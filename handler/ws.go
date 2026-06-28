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
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade failed: %v", err)
		return
	}

	// Try to authenticate user from query param or Authorization header
	var userID string
	if token := r.URL.Query().Get("token"); token != "" {
		if user, ok := service.CurrentAuthUser(token); ok {
			userID = user.ID
		}
	} else if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if user, ok := service.CurrentAuthUser(token); ok {
			userID = user.ID
		}
	}

	client := &ws.Client{
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Hub:    ws.DefaultHub,
		UserID: userID,
	}

	ws.DefaultHub.Register(client)

	// Send welcome message
	welcome := map[string]any{"type": "connected", "msg": "ok"}
	data, _ := json.Marshal(welcome)
	conn.WriteMessage(websocket.TextMessage, data)

	go client.WritePump()
	go client.ReadPump()
}
