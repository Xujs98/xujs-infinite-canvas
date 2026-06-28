package seedance

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSSession struct {
	id      string
	agent   *AgentSession
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
}

var sessions = map[string]*WSSession{}

// getUserWorkDir returns per-user workDir: workDir/seedance-users/{userId}/
// Falls back to shared workDir when no user is authenticated.
func getUserWorkDir(c *gin.Context, baseWorkDir string) string {
	if user, ok := service.UserFromContext(c.Request.Context()); ok && user.ID != "" {
		return filepath.Join(baseWorkDir, "seedance-users", user.ID)
	}
	return baseWorkDir
}


var sessionsMu sync.Mutex

func GetSession(chatID, workDir, apiKey, baseURL, model, protocol string) *WSSession {
	sessionsMu.Lock()
	defer sessionsMu.Unlock()
	if s, ok := sessions[chatID]; ok {
		return s
	}
	s := &WSSession{
		id:      chatID,
		agent:   NewAgentSession(apiKey, baseURL, model, protocol, workDir),
		clients: map[*websocket.Conn]bool{},
	}
	sessions[chatID] = s
	return s
}

func (s *WSSession) Broadcast(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for c := range s.clients {
		c.WriteMessage(websocket.TextMessage, data)
	}
}

func HandleWS(c *gin.Context) {
	chatID := c.Query("chatId")
	if chatID == "" {
		chatID = "default"
	}
	modelName := c.Query("model")
	workDir := c.GetString("workDir")

	// 优先使用 .env 配置（视频脚本创作助手专用）
	envKey := os.Getenv("ANTHROPIC_API_KEY")
	if envKey == "" {
		envKey = os.Getenv("OPENAI_API_KEY")
	}
	if envKey != "" {
		protocol := "openai"
		baseURL := os.Getenv("OPENAI_BASE_URL")
		if os.Getenv("ANTHROPIC_BASE_URL") != "" {
			protocol = "anthropic"
			baseURL = os.Getenv("ANTHROPIC_BASE_URL")
		} else if baseURL == "" {
			baseURL = "https://api.openai.com"
		}
		if modelName == "" {
			if m := os.Getenv("MODEL"); m != "" {
				modelName = m
			} else {
				modelName = "claude-sonnet-4-20250514"
			}
		}
		log.Printf("[Seedance] using .env: base=%s model=%s protocol=%s", baseURL, modelName, protocol)
		conn, upgradeErr := upgrader.Upgrade(c.Writer, c.Request, nil)
		if upgradeErr != nil {
			log.Printf("[Seedance] WS upgrade failed: %v", upgradeErr)
			return
		}
		session := GetSession(chatID, getUserWorkDir(c, workDir), envKey, baseURL, modelName, protocol)
		session.mu.Lock()
		session.clients[conn] = true
		session.mu.Unlock()
		defer func() {
			session.mu.Lock()
			delete(session.clients, conn)
			session.mu.Unlock()
			conn.Close()
		}()
		conn.WriteJSON(map[string]any{"type": "subscribed", "chatId": chatID})
		for {
			_, message, readErr := conn.ReadMessage()
			if readErr != nil {
				break
			}
			var msg struct {
				Type    string `json:"type"`
				Content string `json:"content"`
			}
			if jsonErr := json.Unmarshal(message, &msg); jsonErr != nil {
				continue
			}
			if msg.Type == "chat" && msg.Content != "" {
				session.Broadcast(mustJSON(map[string]any{"type": "user_message", "content": msg.Content}))
				go func() {
					output := make(chan StreamChunk, 50)
					go session.agent.Run(context.Background(), msg.Content, output)
					for chunk := range output {
						switch chunk.Type {
						case "text":
							session.Broadcast(mustJSON(map[string]any{"type": "assistant_message", "content": chunk.Content}))
						case "tool_start":
							session.Broadcast(mustJSON(map[string]any{"type": "tool_use", "toolName": chunk.ToolName, "toolInput": nil}))
						case "tool_call":
							session.Broadcast(mustJSON(map[string]any{"type": "tool_use", "toolName": chunk.ToolName, "toolInput": json.RawMessage(chunk.ToolInput)}))
						case "tool_result":
							session.Broadcast(mustJSON(map[string]any{"type": "tool_result", "toolName": chunk.ToolName, "content": chunk.Content}))
						case "error":
							session.Broadcast(mustJSON(map[string]any{"type": "error", "error": chunk.Error}))
						case "done":
							session.Broadcast(mustJSON(map[string]any{"type": "result", "success": true}))
						}
					}
				}()
			}
		}
		return
	}

	// 没有 .env 配置时，从系统渠道中选择
	if modelName == "" {
		modelName = "claude-sonnet-4-20250514"
	}

	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("[Seedance] no channel for model %s: %v", modelName, err)
		conn, _ := upgrader.Upgrade(c.Writer, c.Request, nil)
		if conn != nil {
			conn.WriteJSON(map[string]any{"type": "error", "error": fmt.Sprintf("没有可用的模型渠道: %v", err)})
			conn.Close()
		}
		return
	}
	apiKey := channel.APIKey
	protocol := channel.Protocol
	if protocol == "" {
		protocol = "openai"
	}
	// 构造 agent 需要的 baseURL：agent 会追加 /messages 或 /chat/completions
	var baseURL string
	if strings.TrimSpace(channel.PathPrefix) != "" {
		// PathPrefix 会包含完整路径前缀，agent 直接拼 /messages 或 /chat/completions
		baseURL = strings.TrimRight(channel.BaseURL, "/") + "/" + strings.Trim(channel.PathPrefix, "/")
	} else if protocol == "anthropic" {
		// Anthropic 协议：baseURL 需要包含路径后缀（如 /anthropic），agent 拼 /messages
		baseURL = strings.TrimRight(channel.BaseURL, "/")
	} else {
		// OpenAI 协议：标准路径是 /v1，agent 拼 /chat/completions
		baseURL = strings.TrimRight(channel.BaseURL, "/")
		lower := strings.ToLower(baseURL)
		if !strings.HasSuffix(lower, "/v1") {
			baseURL += "/v1"
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Seedance] WS upgrade failed: %v", err)
		return
	}

	session := GetSession(chatID, getUserWorkDir(c, workDir), apiKey, baseURL, modelName, protocol)
	session.mu.Lock()
	session.clients[conn] = true
	session.mu.Unlock()

	defer func() {
		session.mu.Lock()
		delete(session.clients, conn)
		session.mu.Unlock()
		conn.Close()
	}()

	// Send subscribed
	conn.WriteJSON(map[string]any{"type": "subscribed", "chatId": chatID})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg struct {
			Type    string `json:"type"`
			Content string `json:"content"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		if msg.Type == "chat" && msg.Content != "" {
			// Broadcast user message
			session.Broadcast(mustJSON(map[string]any{"type": "user_message", "content": msg.Content}))

			// Run agent
			go func() {
				output := make(chan StreamChunk, 50)
				ctx := context.Background()
				go session.agent.Run(ctx, msg.Content, output)

				for chunk := range output {
					switch chunk.Type {
					case "text":
						session.Broadcast(mustJSON(map[string]any{"type": "assistant_message", "content": chunk.Content}))
					case "tool_start":
						session.Broadcast(mustJSON(map[string]any{"type": "tool_use", "toolName": chunk.ToolName, "toolInput": nil}))
					case "tool_call":
						session.Broadcast(mustJSON(map[string]any{"type": "tool_use", "toolName": chunk.ToolName, "toolInput": json.RawMessage(chunk.ToolInput)}))
					case "tool_result":
						session.Broadcast(mustJSON(map[string]any{"type": "tool_result", "toolName": chunk.ToolName, "content": chunk.Content}))
					case "error":
						session.Broadcast(mustJSON(map[string]any{"type": "error", "error": chunk.Error}))
					case "done":
						session.Broadcast(mustJSON(map[string]any{"type": "result", "success": true}))
					}
				}
			}()
		}
	}
}

func HandleOutput(c *gin.Context) {
	workDir := getUserWorkDir(c, c.GetString("workDir"))
	outputDir := filepath.Join(workDir, "seedance-script", "output")
	entries, err := os.ReadDir(outputDir)
	if err != nil {
		c.JSON(200, []any{})
		return
	}
	type FileInfo struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Size int64  `json:"size"`
		Type string `json:"type"`
	}
	var files []FileInfo
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		info, _ := e.Info()
		fType := "script"
		name := e.Name()
		if strings.Contains(name, "素材") {
			fType = "asset"
		} else if strings.Contains(name, "分镜") {
			fType = "storyboard"
		}
		files = append(files, FileInfo{Name: name, Path: fmt.Sprintf("seedance-script/output/%s", name), Size: info.Size(), Type: fType})
	}
	c.JSON(200, files)
}

func HandleUpload(c *gin.Context) {
	workDir := getUserWorkDir(c, c.GetString("workDir"))
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "No file"})
		return
	}
	uploadDir := filepath.Join(workDir, "seedance-script", "uploads")
	os.MkdirAll(uploadDir, 0o755)
	dst := filepath.Join(uploadDir, file.Filename)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"name": file.Filename, "path": fmt.Sprintf("seedance-script/uploads/%s", file.Filename), "size": file.Size})
}

func HandleOutputFile(c *gin.Context) {
	workDir := getUserWorkDir(c, c.GetString("workDir"))
	relPath := c.Param("filepath")
	fullPath := filepath.Join(workDir, "seedance-script", "output", relPath)
	c.File(fullPath)
}

func HandleHealth(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok"})
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
