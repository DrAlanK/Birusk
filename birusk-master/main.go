package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type User struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	DataLimit int64  `json:"data_limit"`
	UsedData  int64  `json:"used_data"`
}

type Node struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Address string `json:"address"`
	Token   string `json:"token"`
	Status  string `json:"status"`
}

func generateToken() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	InitDB("birusk.db")

	mux := http.NewServeMux()

	// ترکیب هوشمندانه: اگر درخواست از نوع WebSocket بود میره برای عبور ترافیک، در غیر این صورت پنل باز میشه
	fs := http.FileServer(http.Dir("./ui"))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.ToLower(r.Header.Get("Upgrade")) == "websocket" {
			handleProxy(w, r)
			return
		}
		fs.ServeHTTP(w, r)
	})

	mux.HandleFunc("GET /api/users", handleGetUsers)
	mux.HandleFunc("POST /api/users", handleCreateUser)
	mux.HandleFunc("GET /api/nodes", handleGetNodes)
	mux.HandleFunc("POST /api/nodes", handleCreateNode)
	
	mux.HandleFunc("GET /api/sync", handleNodeSync)
	mux.HandleFunc("POST /api/usage", handleReportUsage)
	mux.HandleFunc("GET /sub", handleSubscription)

	log.Printf("Birusk Master Engine running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// موتور پردازشگر ترافیک VLESS اختصاصی ریلوی
func handleProxy(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_, firstChunk, err := conn.ReadMessage()
	if err != nil || len(firstChunk) < 24 || firstChunk[0] != 0 {
		return
	}

	uuidBytes := firstChunk[1:17]
	parsedUUID, err := uuid.FromBytes(uuidBytes)
	if err != nil {
		return
	}
	userID := parsedUUID.String()

	var status string
	err = DB.QueryRow("SELECT status FROM users WHERE id = ?", userID).Scan(&status)
	if err != nil || status != "active" {
		return
	}

	var nodeID string
	DB.QueryRow("SELECT id FROM nodes WHERE type = 'railway' AND status = 'active' LIMIT 1").Scan(&nodeID)

	optLen := int(firstChunk[17])
	pPos := 18 + optLen + 1
	port := binary.BigEndian.Uint16(firstChunk[pPos : pPos+2])
	aType := firstChunk[pPos+2]

	var targetAddr string
	vPos := pPos + 3
	aLen := 0

	if aType == 1 {
		aLen = 4
		targetAddr = net.IP(firstChunk[vPos : vPos+aLen]).String()
	} else if aType == 2 {
		aLen = int(firstChunk[vPos])
		vPos++
		targetAddr = string(firstChunk[vPos : vPos+aLen])
	} else if aType == 3 {
		aLen = 16
		targetAddr = net.IP(firstChunk[vPos : vPos+aLen]).String()
	} else {
		return
	}

	target := fmt.Sprintf("%s:%d", targetAddr, port)
	targetConn, err := net.Dial("tcp", target)
	if err != nil {
		return
	}
	defer targetConn.Close()

	conn.WriteMessage(websocket.BinaryMessage, []byte{0, 0})

	var tx, rx int64
	offset := vPos + aLen
	if offset < len(firstChunk) {
		targetConn.Write(firstChunk[offset:])
		atomic.AddInt64(&tx, int64(len(firstChunk)-offset))
	}

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			targetConn.Write(msg)
			atomic.AddInt64(&tx, int64(len(msg)))
		}
		targetConn.Close()
	}()

	buf := make([]byte, 32*1024)
	for {
		n, err := targetConn.Read(buf)
		if n > 0 {
			if err2 := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err2 != nil {
				break
			}
			atomic.AddInt64(&rx, int64(n))
		}
		if err != nil {
			break
		}
	}

	totalUsage := atomic.LoadInt64(&tx) + atomic.LoadInt64(&rx)
	if totalUsage > 0 && nodeID != "" {
		RecordUsage(userID, nodeID, totalUsage)
	}
}

func handleGetUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := DB.Query("SELECT id, name, status, data_limit FROM users")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var userList []User
	for rows.Next() {
		var u User
		rows.Scan(&u.ID, &u.Name, &u.Status, &u.DataLimit)
		usage, _ := GetTotalUsage(u.ID)
		u.UsedData = usage
		userList = append(userList, u)
	}

	if userList == nil {
		userList = []User{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userList)
}

func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		DataLimit int64  `json:"data_limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newID := uuid.New().String()
	_, err := DB.Exec("INSERT INTO users (id, name, data_limit) VALUES (?, ?, ?)", newID, req.Name, req.DataLimit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	newUser := User{
		ID:        newID,
		Name:      req.Name,
		Status:    "active",
		DataLimit: req.DataLimit,
		UsedData:  0,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newUser)
}

func handleGetNodes(w http.ResponseWriter, r *http.Request) {
	rows, err := DB.Query("SELECT id, name, type, address, token, status FROM nodes")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var nodeList []Node
	for rows.Next() {
		var n Node
		rows.Scan(&n.ID, &n.Name, &n.Type, &n.Address, &n.Token, &n.Status)
		nodeList = append(nodeList, n)
	}

	if nodeList == nil {
		nodeList = []Node{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodeList)
}

func handleCreateNode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		Type    string `json:"type"`
		Address string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newID := uuid.New().String()
	token := generateToken()

	_, err := DB.Exec("INSERT INTO nodes (id, name, type, address, token) VALUES (?, ?, ?, ?, ?)", newID, req.Name, req.Type, req.Address, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	newNode := Node{
		ID:      newID,
		Name:    req.Name,
		Type:    req.Type,
		Address: req.Address,
		Token:   token,
		Status:  "active",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newNode)
}

func handleNodeSync(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if len(authHeader) < 8 || authHeader[:7] != "Bearer " {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	token := authHeader[7:]

	_, err := ValidateNodeToken(token)
	if err != nil {
		http.Error(w, "Invalid Token", http.StatusUnauthorized)
		return
	}

	rows, err := DB.Query("SELECT id FROM users WHERE status = 'active'")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var activeUUIDs []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		activeUUIDs = append(activeUUIDs, id)
	}

	if activeUUIDs == nil {
		activeUUIDs = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"uuids": activeUUIDs,
	})
}

func handleReportUsage(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if len(authHeader) < 8 || authHeader[:7] != "Bearer " {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	token := authHeader[7:]

	nodeID, err := ValidateNodeToken(token)
	if err != nil {
		http.Error(w, "Invalid Token", http.StatusUnauthorized)
		return
	}

	var req []struct {
		UserID    string `json:"user_id"`
		BytesUsed int64  `json:"bytes_used"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	for _, usage := range req {
		RecordUsage(usage.UserID, nodeID, usage.BytesUsed)
	}

	w.WriteHeader(http.StatusOK)
}

func handleSubscription(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("id")
	if userID == "" {
		http.Error(w, "Missing User ID", http.StatusBadRequest)
		return
	}

	var status string
	err := DB.QueryRow("SELECT status FROM users WHERE id = ?", userID).Scan(&status)
	if err != nil || status != "active" {
		http.Error(w, "User is inactive or not found", http.StatusNotFound)
		return
	}

	rows, err := DB.Query("SELECT name, type, address FROM nodes WHERE status = 'active'")
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var configs []string

	for rows.Next() {
		var nName, nType, nAddr string
		rows.Scan(&nName, &nType, &nAddr)

		if nType == "cloudflare" {
			vless := fmt.Sprintf("vless://%s@%s:443?encryption=none&security=tls&sni=%s&type=ws&host=%s&path=/#%s-VLESS", userID, nAddr, nAddr, nAddr, nName)
			trojan := fmt.Sprintf("trojan://%s@%s:443?security=tls&sni=%s&type=ws&host=%s&path=/#%s-Trojan", userID, nAddr, nAddr, nAddr, nName)
			configs = append(configs, vless, trojan)
		} else if nType == "railway" {
			// کانفیگ اختصاصی ریلوی متصل به انجین داخلی
			vless := fmt.Sprintf("vless://%s@%s:443?encryption=none&security=tls&sni=%s&type=ws&host=%s&path=/#%s-Master", userID, nAddr, nAddr, nAddr, nName)
			configs = append(configs, vless)
		}
	}

	finalStr := strings.Join(configs, "\n")
	encodedSub := base64.StdEncoding.EncodeToString([]byte(finalStr))

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(encodedSub))
}