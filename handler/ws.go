package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// HandleWebSocket 处理客户端 WebSocket 连接。
func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Try to authenticate user from query param or Authorization header before
	// upgrading. If a token is present but invalid, reject the socket so the App
	// cannot appear connected while the admin list cannot bind it to a user.
	var userID string
	tokenProvided := false
	if token := r.URL.Query().Get("token"); token != "" {
		tokenProvided = true
		if user, ok := service.CurrentAuthUser(token); ok {
			userID = user.ID
		}
	} else if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		tokenProvided = true
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if user, ok := service.CurrentAuthUser(token); ok {
			userID = user.ID
		}
	}
	if tokenProvided && userID == "" {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade failed: %v", err)
		return
	}

	clientType := normalizeWSClientType(r.URL.Query().Get("client"))

	client := &ws.Client{
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Hub:        ws.DefaultHub,
		UserID:     userID,
		ClientType: clientType,
	}

	ws.DefaultHub.Register(client)

	// Send welcome message
	welcome := map[string]any{"type": "connected", "msg": "ok"}
	data, _ := json.Marshal(welcome)
	conn.WriteMessage(websocket.TextMessage, data)

	go client.WritePump()
	go client.ReadPump()
}

func normalizeWSClientType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "app":
		return "app"
	default:
		return "web"
	}
}
