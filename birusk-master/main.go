package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/google/uuid"
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

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	InitDB("birusk.db")

	mux := http.NewServeMux()

	mux.Handle("/", http.FileServer(http.Dir("./ui")))

	mux.HandleFunc("GET /api/users", handleGetUsers)
	mux.HandleFunc("POST /api/users", handleCreateUser)
	mux.HandleFunc("GET /api/nodes", handleGetNodes)
	mux.HandleFunc("POST /api/nodes", handleCreateNode)
	
	mux.HandleFunc("GET /api/sync", handleNodeSync)
	mux.HandleFunc("POST /api/usage", handleReportUsage)
	
	// روت تولید لینک سابسکریپشن
	mux.HandleFunc("GET /sub", handleSubscription)

	log.Printf("Birusk Master Node running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
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

// سیستم تولید سابسکریپشن و کانفیگ‌های مختلف
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
			vless := fmt.Sprintf("vless://%s@%s:443?encryption=none&security=tls&sni=%s&type=ws&host=%s&path=/#%s-Direct", userID, nAddr, nAddr, nAddr, nName)
			
			vmessJson := fmt.Sprintf(`{"v":"2","ps":"%s-VMess","add":"%s","port":"443","id":"%s","aid":"0","scy":"auto","net":"ws","type":"none","host":"%s","path":"/","tls":"tls","sni":"%s","alpn":""}`, nName, nAddr, userID, nAddr, nAddr)
			vmessB64 := base64.StdEncoding.EncodeToString([]byte(vmessJson))
			vmess := "vmess://" + vmessB64
			
			configs = append(configs, vless, vmess)
		}
	}

	finalStr := strings.Join(configs, "\n")
	encodedSub := base64.StdEncoding.EncodeToString([]byte(finalStr))

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(encodedSub))
}