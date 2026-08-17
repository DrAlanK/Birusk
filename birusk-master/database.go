package main

import (
	"database/sql"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func InitDB(filepath string) {
	var err error
	DB, err = sql.Open("sqlite3", filepath)
	if err != nil {
		log.Fatal(err)
	}

	createTables := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		status TEXT DEFAULT 'active',
		data_limit INTEGER DEFAULT 0,
		expire_time INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS nodes (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		address TEXT NOT NULL,
		clean_ip TEXT DEFAULT '',
		token TEXT UNIQUE NOT NULL,
		status TEXT DEFAULT 'active'
	);

	CREATE TABLE IF NOT EXISTS node_usage (
		user_id TEXT,
		node_id TEXT,
		bytes_used INTEGER DEFAULT 0,
		last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, node_id)
	);
	`
	_, err = DB.Exec(createTables)
	if err != nil {
		log.Fatal(err)
	}

	// آپدیت خودکار دیتابیس‌های قدیمی بدون پاک شدن اطلاعات قبلی کاربران و نودها
	DB.Exec("ALTER TABLE users ADD COLUMN expire_time INTEGER DEFAULT 0;")
	DB.Exec("ALTER TABLE nodes ADD COLUMN clean_ip TEXT DEFAULT '';")
}

func RecordUsage(userID string, nodeID string, bytes int64) error {
	query := `
	INSERT INTO node_usage (user_id, node_id, bytes_used) 
	VALUES (?, ?, ?)
	ON CONFLICT(user_id, node_id) 
	DO UPDATE SET bytes_used = bytes_used + ?, last_updated = CURRENT_TIMESTAMP;
	`
	_, err := DB.Exec(query, userID, nodeID, bytes, bytes)
	return err
}

func GetTotalUsage(userID string) (int64, error) {
	var total sql.NullInt64
	err := DB.QueryRow("SELECT SUM(bytes_used) FROM node_usage WHERE user_id = ?", userID).Scan(&total)
	if err != nil {
		return 0, err
	}
	if total.Valid {
		return total.Int64, nil
	}
	return 0, nil
}

func ValidateNodeToken(token string) (string, error) {
	var nodeID string
	err := DB.QueryRow("SELECT id FROM nodes WHERE token = ? AND status = 'active'", token).Scan(&nodeID)
	if err != nil {
		return "", err
	}
	return nodeID, nil
}