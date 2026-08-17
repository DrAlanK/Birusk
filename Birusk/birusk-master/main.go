package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"

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
	ID     string `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Token  string `json:"token"`
	Status string `json:"status"`
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
	rows, err := DB.Query("SELECT id, name, type, token, status FROM nodes")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var nodeList []Node
	for rows.Next() {
		var n Node
		rows.Scan(&n.ID, &n.Name, &n.Type, &n.Token, &n.Status)
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
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newID := uuid.New().String()
	token := generateToken()

	_, err := DB.Exec("INSERT INTO nodes (id, name, type, token) VALUES (?, ?, ?, ?)", newID, req.Name, req.Type, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	newNode := Node{
		ID:     newID,
		Name:   req.Name,
		Type:   req.Type,
		Token:  token,
		Status: "active",
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