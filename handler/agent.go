package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/basketikun/infinite-canvas/service"
)

var agentManager = &AgentManager{}

type AgentManager struct {
	mu       sync.Mutex
	cmd      *exec.Cmd
	port     int
	token    string
	running  bool
	starting bool
	startCh  chan struct{}
}

type AgentStatus struct {
	Running bool   `json:"running"`
	URL     string `json:"url"`
	Token   string `json:"token"`
}

func (m *AgentManager) GetStatus() AgentStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.running {
		return AgentStatus{Running: false}
	}
	return AgentStatus{
		Running: true,
		URL:     fmt.Sprintf("http://127.0.0.1:%d", m.port),
		Token:   m.token,
	}
}

func (m *AgentManager) Start() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	if m.starting {
		ch := m.startCh
		m.mu.Unlock()
		<-ch
		return nil
	}
	m.starting = true
	m.startCh = make(chan struct{})
	m.mu.Unlock()

	// Find canvas-agent binary
	agentDir := findCanvasAgentDir()
	if agentDir == "" {
		m.mu.Lock()
		m.starting = false
		close(m.startCh)
		m.mu.Unlock()
		return fmt.Errorf("canvas-agent not found")
	}

	// Check if node_modules exists
	distPath := filepath.Join(agentDir, "dist", "index.js")
	srcPath := filepath.Join(agentDir, "src", "index.ts")
	entryPath := distPath
	useTsx := false
	if _, err := os.Stat(distPath); os.IsNotExist(err) {
		if _, err := os.Stat(srcPath); err == nil {
			entryPath = srcPath
			useTsx = true
		} else {
			m.mu.Lock()
			m.starting = false
			close(m.startCh)
			m.mu.Unlock()
			return fmt.Errorf("canvas-agent entry not found")
		}
	}

	m.port = 17371
	m.token = generateToken()

	var cmd *exec.Cmd
	if useTsx {
		cmd = exec.Command("npx", "tsx", entryPath)
	} else {
		cmd = exec.Command("node", entryPath)
	}
	cmd.Dir = agentDir
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("PORT=%d", m.port),
		fmt.Sprintf("CANVAS_AGENT_TOKEN=%s", m.token),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		m.mu.Lock()
		m.starting = false
		close(m.startCh)
		m.mu.Unlock()
		return err
	}

	m.mu.Lock()
	m.cmd = cmd
	m.running = true
	m.starting = false
	close(m.startCh)
	m.mu.Unlock()

	go func() {
		_ = cmd.Wait()
		m.mu.Lock()
		m.running = false
		m.cmd = nil
		m.mu.Unlock()
		log.Println("[agent] canvas-agent process exited")
	}()

	// Wait for agent to be ready
	for i := 0; i < 30; i++ {
		time.Sleep(200 * time.Millisecond)
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/health", m.port))
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				log.Printf("[agent] canvas-agent ready on port %d", m.port)
				return nil
			}
		}
	}

	log.Printf("[agent] canvas-agent started but health check timeout")
	return nil
}

func (m *AgentManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Kill()
	}
	m.running = false
	m.cmd = nil
}

func findCanvasAgentDir() string {
	// Try relative to executable
	exe, _ := os.Executable()
	if exe != "" {
		candidate := filepath.Join(filepath.Dir(exe), "..", "canvas-agent")
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			return candidate
		}
	}

	// Try working directory
	if wd, _ := os.Getwd(); wd != "" {
		candidate := filepath.Join(wd, "canvas-agent")
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			return candidate
		}
	}

	// Try known paths
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Agent.localized", "infinite-canvas", "canvas-agent"),
		filepath.Join(home, "infinite-canvas", "canvas-agent"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "package.json")); err == nil {
			return c
		}
	}
	return ""
}

func generateToken() string {
	b := make([]byte, 24)
	for i := range b {
		b[i] = "0123456789abcdef"[time.Now().UnixNano()%16]
		time.Sleep(time.Nanosecond)
	}
	return fmt.Sprintf("%x", b)
}

// AdminAgentSettingsRequest Agent 设置请求。
type AdminAgentSettingsRequest struct {
	AgentEnabled     *bool   `json:"agentEnabled"`
	AgentVisible     *bool   `json:"agentVisible"`
	AgentAccessLevel *string `json:"agentAccessLevel"`
}

// AdminGetAgentSettings 获取 Agent 相关设置。
func AdminGetAgentSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, gin.H{
		"agentEnabled":     settings.AgentEnabled,
		"agentVisible":     settings.AgentVisible,
		"agentAccessLevel": settings.AgentAccessLevel,
	})
}

// AdminSaveAgentSettings 保存 Agent 相关设置（部分更新）。
func AdminSaveAgentSettings(w http.ResponseWriter, r *http.Request) {
	var req AdminAgentSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "参数错误")
		return
	}
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	if req.AgentEnabled != nil {
		settings.AgentEnabled = *req.AgentEnabled
	}
	if req.AgentVisible != nil {
		settings.AgentVisible = *req.AgentVisible
	}
	if req.AgentAccessLevel != nil {
		settings.AgentAccessLevel = *req.AgentAccessLevel
	}
	if err := service.SaveSystemSettings(settings); err != nil {
		FailError(w, err)
		return
	}
	OK(w, nil)
}

// AdminAgentStatus returns the canvas-agent status
func AdminAgentStatus(w http.ResponseWriter, r *http.Request) {
	status := agentManager.GetStatus()
	OK(w, status)
}

// AdminAgentStart starts the canvas-agent process
func AdminAgentStart(w http.ResponseWriter, r *http.Request) {
	if err := agentManager.Start(); err != nil {
		Fail(w, fmt.Sprintf("启动失败: %v", err))
		return
	}
	OK(w, agentManager.GetStatus())
}

// AdminAgentStop stops the canvas-agent process
func AdminAgentStop(w http.ResponseWriter, r *http.Request) {
	agentManager.Stop()
	OK(w, true)
}

// AgentProxy proxies requests to canvas-agent
func AgentProxy(w http.ResponseWriter, r *http.Request) {
	// Handle /agent/status directly
	if strings.TrimPrefix(r.URL.Path, "/api/agent") == "/status" || strings.TrimPrefix(r.URL.Path, "/api/agent") == "" {
		status := agentManager.GetStatus()
		if status.Running {
			status.URL = "/api/agent"
		}
		resp := map[string]interface{}{
			"website": status,
		}
		OK(w, resp)
		return
	}

	status := agentManager.GetStatus()
	if !status.Running {
		Fail(w, "Agent 服务未运行")
		return
	}

	// Rewrite URL: /api/agent/* -> http://127.0.0.1:17371/*
	target, _ := url.Parse(status.URL)
	proxy := httputil.NewSingleHostReverseProxy(target)

	// Set auth header
	r.Header.Set("x-canvas-agent-token", status.Token)

	// Handle SSE connections
	if strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
	}

	// Strip /api/agent prefix
	r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api/agent")
	if r.URL.Path == "" {
		r.URL.Path = "/"
	}
	r.URL.RawPath = strings.TrimPrefix(r.URL.RawPath, "/api/agent")

	proxy.ServeHTTP(w, r)
}

// PublicAgentStatus returns agent status for frontend (with access control)
func PublicAgentStatus(w http.ResponseWriter, r *http.Request) {
	// Check if agent is enabled
	agentEnabled := r.Header.Get("X-Agent-Enabled")
	if agentEnabled == "false" {
		OK(w, map[string]interface{}{"website": AgentStatus{Running: false}})
		return
	}

	status := agentManager.GetStatus()
	if status.Running {
		status.URL = "/api/agent"
	}
	resp := map[string]interface{}{
		"website": status,
	}
	OK(w, resp)
}

func init() {
	// Auto-start canvas-agent on server boot
	go func() {
		time.Sleep(2 * time.Second)
		if err := agentManager.Start(); err != nil {
			log.Printf("[agent] auto-start skipped: %v", err)
		}
	}()
}

// Ensure init is referenced
var _ = json.Marshal
