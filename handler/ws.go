package handler

import (
	"encoding/json"
	"log"
	"net/http"

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

	client := &ws.Client{
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  ws.DefaultHub,
	}

	ws.DefaultHub.Register(client)

	// 发送欢迎消息
	welcome := map[string]any{"type": "connected", "msg": "ok"}
	data, _ := json.Marshal(welcome)
	conn.WriteMessage(websocket.TextMessage, data)

	go client.WritePump()
	go client.ReadPump()
}
