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
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	DataLimit  int64  `json:"data_limit"`
	ExpireTime int64  `json:"expire_time"`
	UsedData   int64  `json:"used_data"`
}

type Node struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Address string `json:"address"`
	CleanIP string `json:"clean_ip"`
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

	// روت‌های مدیریت کاربران
	mux.HandleFunc("GET /api/users", handleGetUsers)
	mux.HandleFunc("POST /api/users", handleCreateUser)
	mux.HandleFunc("DELETE /api/users", handleDeleteUser)
	mux.HandleFunc("PUT /api/users", handleEditUser)

	// روت‌های مدیریت نودها
	mux.HandleFunc("GET /api/nodes", handleGetNodes)
	mux.HandleFunc("POST /api/nodes", handleCreateNode)
	mux.HandleFunc("DELETE /api/nodes", handleDeleteNode)
	mux.HandleFunc("PUT /api/nodes", handleEditNode)

	// روت‌های ارتباطی با کلادفلر و کلاینت‌ها
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

	// بررسی وضعیت و تاریخ انقضای کاربر
	var status string
	var expireTime int64
	err = DB.QueryRow("SELECT status, expire_time FROM users WHERE id = ?", userID).Scan(&status, &expireTime)
	if err != nil || status != "active" {
		return
	}
	if expireTime > 0 && time.Now().Unix() > expireTime {
		return
	}

	var nodeID string
	DB.QueryRow("SELECT id FROM nodes WHERE type = 'railway' AND status = 'active' LIMIT 1").Scan(&nodeID)

	optLen := int(firstChunk[17])
	pPos := 18 + optLen + 1
	if len(firstChunk) <= pPos+2 {
		return
	}
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
	rows, err := DB.Query("SELECT id, name, status, data_limit, expire_time FROM users")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var userList []User
	for rows.Next() {
		var u User
		rows.Scan(&u.ID, &u.Name, &u.Status, &u.DataLimit, &u.ExpireTime)
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
		Name       string `json:"name"`
		DataLimit  int64  `json:"data_limit"`
		ExpireTime int64  `json:"expire_time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newID := uuid.New().String()
	_, err := DB.Exec("INSERT INTO users (id, name, data_limit, expire_time) VALUES (?, ?, ?, ?)", newID, req.Name, req.DataLimit, req.ExpireTime)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	_, err := DB.Exec("DELETE FROM node_usage WHERE user_id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	_, err = DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

func handleEditUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		DataLimit  int64  `json:"data_limit"`
		ExpireTime int64  `json:"expire_time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	_, err := DB.Exec("UPDATE users SET name = ?, data_limit = ?, expire_time = ? WHERE id = ?", req.Name, req.DataLimit, req.ExpireTime, req.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

func handleGetNodes(w http.ResponseWriter, r *http.Request) {
	rows, err := DB.Query("SELECT id, name, type, address, clean_ip, token, status FROM nodes")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var nodeList []Node
	for rows.Next() {
		var n Node
		rows.Scan(&n.ID, &n.Name, &n.Type, &n.Address, &n.CleanIP, &n.Token, &n.Status)
		nodeList = append(nodeList, n)
	}

	if nodeList == nil {
		nodeList = []Node{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodeList)
}

func handleCreateNode(w http.ResponseWriter, r *http.Request) {
	var req Node
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newID := uuid.New().String()
	token := generateToken()

	_, err := DB.Exec("INSERT INTO nodes (id, name, type, address, clean_ip, token) VALUES (?, ?, ?, ?, ?, ?)", newID, req.Name, req.Type, req.Address, req.CleanIP, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func handleDeleteNode(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	_, err := DB.Exec("DELETE FROM node_usage WHERE node_id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	_, err = DB.Exec("DELETE FROM nodes WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

func handleEditNode(w http.ResponseWriter, r *http.Request) {
	var req Node
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	_, err := DB.Exec("UPDATE nodes SET name = ?, address = ?, clean_ip = ? WHERE id = ?", req.Name, req.Address, req.CleanIP, req.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

// ارسال لیست یوزرهای معتبر به ورکرها
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

	rows, err := DB.Query("SELECT id, expire_time FROM users WHERE status = 'active'")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var activeUUIDs []string
	now := time.Now().Unix()

	for rows.Next() {
		var id string
		var exp int64
		rows.Scan(&id, &exp)
		// فقط یوزرهایی که بدون انقضا هستن یا هنوز تایم دارن ارسال میشن
		if exp == 0 || exp > now {
			activeUUIDs = append(activeUUIDs, id)
		}
	}

	if activeUUIDs == nil {
		activeUUIDs = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"uuids": activeUUIDs,
	})
}

// ثبت مصرف ارسال شده از سمت ورکرها
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

// موتور فوق هوشمند تولید لینک سابسکریپشن
func handleSubscription(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("id")
	if userID == "" {
		http.Error(w, "Missing User ID", http.StatusBadRequest)
		return
	}

	var status string
	var expireTime int64
	err := DB.QueryRow("SELECT status, expire_time FROM users WHERE id = ?", userID).Scan(&status, &expireTime)
	if err != nil || status != "active" {
		http.Error(w, "User is inactive or not found", http.StatusNotFound)
		return
	}
	if expireTime > 0 && time.Now().Unix() > expireTime {
		http.Error(w, "Subscription Expired", 403)
		return
	}

	rows, err := DB.Query("SELECT name, type, address, clean_ip FROM nodes WHERE status = 'active'")
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var configs []string

	for rows.Next() {
		var nName, nType, nAddr, nCleanIP string
		rows.Scan(&nName, &nType, &nAddr, &nCleanIP)

		// استفاده از آی‌پی تمیز در صورت وجود
		targetIP := nAddr
		if nCleanIP != "" {
			targetIP = nCleanIP
		}

		if nType == "cloudflare" {
			// استفاده از ed=2048 برای دور زدن فیلترینگ پکت‌های وب‌سوکت
			vless := fmt.Sprintf("vless://%s@%s:443?encryption=none&security=tls&sni=%s&type=ws&host=%s&path=/?ed=2048#%s-VLESS", userID, targetIP, nAddr, nAddr, nName)
			trojan := fmt.Sprintf("trojan://%s@%s:443?security=tls&sni=%s&type=ws&host=%s&path=/?ed=2048#%s-Trojan", userID, targetIP, nAddr, nAddr, nName)
			configs = append(configs, vless, trojan)
		} else if nType == "railway" {
			// کانفیگ اختصاصی ریلوی متصل به انجین داخلی
			vless := fmt.Sprintf("vless://%s@%s:443?encryption=none&security=tls&sni=%s&type=ws&host=%s&path=/#%s-Master", userID, targetIP, nAddr, nAddr, nName)
			configs = append(configs, vless)
		}
	}

	finalStr := strings.Join(configs, "\n")
	encodedSub := base64.StdEncoding.EncodeToString([]byte(finalStr))

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(encodedSub))
}