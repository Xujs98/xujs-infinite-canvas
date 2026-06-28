package seedance

import (
	"bufio"
	"bytes"
"net/http"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type ContentBlock struct {
	Type       string          `json:"type"`
	Text       string          `json:"text,omitempty"`
	ID         string          `json:"id,omitempty"`
	ToolUseID  string          `json:"tool_use_id,omitempty"`
	Name       string          `json:"name,omitempty"`
	Input      json.RawMessage `json:"input,omitempty"`
	Content    string          `json:"content,omitempty"`
}

type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type StreamChunk struct {
	Type      string          `json:"type"`
	Content   string          `json:"content,omitempty"`
	ToolName  string          `json:"toolName,omitempty"`
	ToolInput json.RawMessage `json:"toolInput,omitempty"`
	Error     string          `json:"error,omitempty"`
	Done      bool            `json:"done"`
}

type AgentSession struct {
	apiKey   string
	baseURL  string
	model    string
	protocol string // "anthropic" or "openai"
	mu       sync.Mutex
	messages []map[string]any
	workDir  string
}

func NewAgentSession(apiKey, baseURL, model, protocol, workDir string) *AgentSession {
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	if protocol == "" {
		protocol = "openai"
	}
	return &AgentSession{apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/"), model: model, protocol: protocol, workDir: workDir}
}

func (s *AgentSession) getSystemPrompt() string {
	skillPath := filepath.Join(s.workDir, "seedance-script", ".claude", "skills", "seedance-storyboard-generator", "SKILL.md")
	skillContent, _ := os.ReadFile(skillPath)
	var refs strings.Builder
	refDir := filepath.Join(s.workDir, "seedance-script", ".claude", "skills", "seedance-storyboard-generator", "references")
	if entries, err := os.ReadDir(refDir); err == nil {
		for _, e := range entries {
			if data, err := os.ReadFile(filepath.Join(refDir, e.Name())); err == nil {
				refs.WriteString(fmt.Sprintf("\n\n--- %s ---\n%s", e.Name(), string(data)))
			}
		}
	}
	return fmt.Sprintf("你是 SeedanceChat，一个专业的 AI 视频脚本创作助手。\n\n## 核心技能\n%s\n\n## 参考文档\n%s\n\n## 工作方式\n1. 理解用户的视频创作需求\n2. 按 SKILL.md 的 5 步工作流执行\n3. 使用 Read 工具读取用户上传的文件（uploads/目录）\n4. 使用 Write 工具将生成的文件保存到 seedance-script/output/ 目录\n5. 用中文回复用户\n\n## 重要规则\n- 剧本必须严格遵循 △ 镜头格式\n- 每集 15 秒，3-7 个镜头\n- 分镜脚本使用时间轴格式\n- 如果信息不足，主动询问：视觉风格、时长、画幅比例、基调、核心梗", string(skillContent), refs.String())
}

func (s *AgentSession) getTools() []Tool {
	return []Tool{
		{Name: "Read", Description: "读取文件内容", InputSchema: json.RawMessage(`{"type":"object","properties":{"file_path":{"type":"string"}},"required":["file_path"]}`)},
		{Name: "Write", Description: "写入文件内容", InputSchema: json.RawMessage(`{"type":"object","properties":{"file_path":{"type":"string"},"content":{"type":"string"}},"required":["file_path","content"]}`)},
		{Name: "Glob", Description: "搜索文件", InputSchema: json.RawMessage(`{"type":"object","properties":{"pattern":{"type":"string"}},"required":["pattern"]}`)},
	}
}

func (s *AgentSession) Run(ctx context.Context, userMessage string, output chan<- StreamChunk) {
	s.mu.Lock()
	if s.protocol == "anthropic" {
		s.messages = append(s.messages, map[string]any{"role": "user", "content": userMessage})
	} else {
		s.messages = append(s.messages, map[string]any{"role": "user", "content": userMessage})
	}
	s.mu.Unlock()

	httpClient := &http.Client{Timeout: 5 * time.Minute}
	maxTurns := 20

	for turn := 0; turn < maxTurns; turn++ {
		if s.protocol == "anthropic" {
			if !s.runAnthropicTurn(ctx, httpClient, output) {
				return
			}
		} else {
			if !s.runOpenAITurn(ctx, httpClient, output) {
				return
			}
		}
	}
	output <- StreamChunk{Type: "done", Done: true}
}

func (s *AgentSession) runAnthropicTurn(ctx context.Context, httpClient *http.Client, output chan<- StreamChunk) bool {
	reqBody := map[string]any{
		"model":      s.model,
		"max_tokens": 8192,
		"messages":   s.messages,
		"system":     s.getSystemPrompt(),
		"stream":     true,
		"tools":      s.getTools(),
	}
	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		output <- StreamChunk{Type: "error", Error: err.Error(), Done: true}
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := httpClient.Do(req)
	if err != nil {
		output <- StreamChunk{Type: "error", Error: err.Error(), Done: true}
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		output <- StreamChunk{Type: "error", Error: fmt.Sprintf("API %d: %s", resp.StatusCode, truncate(string(respBody), 500)), Done: true}
		return false
	}

	var textBuf strings.Builder
	var toolBlocks []map[string]any
	var stopReason string
	currentToolID, currentToolName := "", ""
	var inputBuf bytes.Buffer

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var event struct {
			Type         string `json:"type"`
			Delta        *struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				StopReason  string `json:"stop_reason"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
			ContentBlock *struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}
		switch event.Type {
		case "content_block_start":
			if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
				currentToolID = event.ContentBlock.ID
				currentToolName = event.ContentBlock.Name
				inputBuf.Reset()
				output <- StreamChunk{Type: "tool_start", ToolName: currentToolName}
			}
		case "content_block_delta":
			if event.Delta == nil {
				continue
			}
			if event.Delta.Type == "text_delta" && event.Delta.Text != "" {
				textBuf.WriteString(event.Delta.Text)
				output <- StreamChunk{Type: "text", Content: event.Delta.Text}
			} else if event.Delta.Type == "input_json_delta" {
				inputBuf.WriteString(event.Delta.PartialJSON)
			}
		case "content_block_stop":
			if currentToolName != "" {
				toolBlocks = append(toolBlocks, map[string]any{"type": "tool_use", "id": currentToolID, "name": currentToolName, "input": json.RawMessage(inputBuf.Bytes())})
				currentToolID, currentToolName = "", ""
			}
		case "message_delta":
			if event.Delta != nil {
				stopReason = event.Delta.StopReason
			}
		}
	}

	var assistantContent []any
	if text := textBuf.String(); text != "" {
		assistantContent = append(assistantContent, map[string]any{"type": "text", "text": text})
	}
	for _, tb := range toolBlocks {
		assistantContent = append(assistantContent, tb)
	}

	s.mu.Lock()
	s.messages = append(s.messages, map[string]any{"role": "assistant", "content": assistantContent})

	if stopReason != "tool_use" {
		s.mu.Unlock()
		output <- StreamChunk{Type: "done", Done: true}
		return false
	}

	var toolResults []any
	for _, tb := range toolBlocks {
		name, _ := tb["name"].(string)
		id, _ := tb["id"].(string)
		inputRaw, _ := json.Marshal(tb["input"])
		output <- StreamChunk{Type: "tool_call", ToolName: name, ToolInput: inputRaw}
		result := s.executeTool(name, inputRaw)
		toolResults = append(toolResults, map[string]any{"type": "tool_result", "tool_use_id": id, "content": result})
		output <- StreamChunk{Type: "tool_result", ToolName: name, Content: truncate(result, 200)}
	}
	s.mu.Unlock()

	s.messages = append(s.messages, map[string]any{"role": "user", "content": toolResults})
	return true
}

func (s *AgentSession) runOpenAITurn(ctx context.Context, httpClient *http.Client, output chan<- StreamChunk) bool {
	oaiTools := make([]map[string]any, 0)
	for _, t := range s.getTools() {
		oaiTools = append(oaiTools, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        t.Name,
				"description": t.Description,
				"parameters":  json.RawMessage(t.InputSchema),
			},
		})
	}

	apiMessages := make([]map[string]any, 0)
	apiMessages = append(apiMessages, map[string]any{"role": "system", "content": s.getSystemPrompt()})
	for _, m := range s.messages {
		role, _ := m["role"].(string)
		content := m["content"]
		// Convert anthropic tool_result format to openai format
		if role == "user" {
			if arr, ok := content.([]any); ok && len(arr) > 0 {
				if first, ok := arr[0].(map[string]any); ok {
					if _, ok := first["tool_use_id"]; ok {
						for _, item := range arr {
							if obj, ok := item.(map[string]any); ok {
								toolResultID, _ := obj["tool_use_id"].(string)
								toolContent, _ := obj["content"].(string)
								apiMessages = append(apiMessages, map[string]any{"role": "tool", "tool_call_id": toolResultID, "content": toolContent})
							}
						}
						continue
					}
				}
			}
		}
		apiMessages = append(apiMessages, m)
	}

	reqBody := map[string]any{
		"model":       s.model,
		"messages":    apiMessages,
		"stream":      true,
		"max_tokens":  8192,
		"stream_options": map[string]bool{"include_usage": true},
	}
	if len(oaiTools) > 0 {
		reqBody["tools"] = oaiTools
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", s.baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		output <- StreamChunk{Type: "error", Error: err.Error(), Done: true}
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		output <- StreamChunk{Type: "error", Error: err.Error(), Done: true}
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		output <- StreamChunk{Type: "error", Error: fmt.Sprintf("API %d: %s", resp.StatusCode, truncate(string(respBody), 500)), Done: true}
		return false
	}

	var textBuf strings.Builder
	var toolCalls []map[string]any
	toolCallInputs := map[int]*strings.Builder{}
	var finishReason string

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content      string `json:"content"`
					ToolCalls    []struct {
						Index int    `json:"index"`
						ID    string `json:"id"`
						Type  string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				textBuf.WriteString(choice.Delta.Content)
				output <- StreamChunk{Type: "text", Content: choice.Delta.Content}
			}
			for _, tc := range choice.Delta.ToolCalls {
				if tc.ID != "" {
					toolCalls = append(toolCalls, map[string]any{"id": tc.ID, "type": "function", "function": map[string]any{"name": tc.Function.Name, "arguments": ""}})
					toolCallInputs[tc.Index] = &strings.Builder{}
					output <- StreamChunk{Type: "tool_start", ToolName: tc.Function.Name}
				}
				if tc.Function.Arguments != "" {
					if idx := tc.Index; idx < len(toolCalls) {
						toolCallInputs[idx].WriteString(tc.Function.Arguments)
					}
				}
			}
			if choice.FinishReason != nil {
				finishReason = *choice.FinishReason
			}
		}
	}

	// Finalize tool call arguments
	for i, tc := range toolCalls {
		if sb, ok := toolCallInputs[i]; ok {
			tc["function"].(map[string]any)["arguments"] = sb.String()
		}
	}

	assistantMsg := map[string]any{"role": "assistant", "content": textBuf.String()}
	if len(toolCalls) > 0 {
		assistantMsg["tool_calls"] = toolCalls
	}

	s.mu.Lock()
	s.messages = append(s.messages, assistantMsg)

	if finishReason != "tool_calls" {
		s.mu.Unlock()
		output <- StreamChunk{Type: "done", Done: true}
		return false
	}

	for _, tc := range toolCalls {
		fn, _ := tc["function"].(map[string]any)
		name, _ := fn["name"].(string)
		argsStr, _ := fn["arguments"].(string)
		id, _ := tc["id"].(string)
		var args json.RawMessage = []byte(argsStr)
		if argsStr == "" {
			args = []byte("{}")
		}
		output <- StreamChunk{Type: "tool_call", ToolName: name, ToolInput: args}
		result := s.executeTool(name, args)
		s.messages = append(s.messages, map[string]any{"role": "tool", "tool_call_id": id, "content": result})
		output <- StreamChunk{Type: "tool_result", ToolName: name, Content: truncate(result, 200)}
	}
	s.mu.Unlock()
	return true
}

func (s *AgentSession) executeTool(name string, input json.RawMessage) string {
	var params map[string]any
	json.Unmarshal(input, &params)
	filePath, _ := params["file_path"].(string)
	content, _ := params["content"].(string)
	switch name {
	case "Read":
		for _, base := range []string{filepath.Join(s.workDir, "seedance-script"), s.workDir} {
			data, err := os.ReadFile(filepath.Join(base, filePath))
			if err == nil {
				return string(data)
			}
		}
		return "Error: file not found"
	case "Write":
		var fullPath string
		if strings.HasPrefix(filePath, "seedance-script/") {
			fullPath = filepath.Join(s.workDir, filePath)
		} else {
			fullPath = filepath.Join(s.workDir, "seedance-script", filePath)
		}
		os.MkdirAll(filepath.Dir(fullPath), 0o755)
		if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
			return fmt.Sprintf("Error: %v", err)
		}
		return fmt.Sprintf("Written: %s", filePath)
	case "Glob":
		pattern, _ := params["pattern"].(string)
		var matches []string
		filepath.Walk(filepath.Join(s.workDir, "seedance-script"), func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(filepath.Join(s.workDir, "seedance-script"), path)
			matched, _ := filepath.Match(filepath.Base(pattern), info.Name())
			if matched {
				matches = append(matches, rel)
			}
			return nil
		})
		if len(matches) == 0 {
			return "No files found"
		}
		return strings.Join(matches, "\n")
	default:
		return fmt.Sprintf("Unknown tool: %s", name)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func init() {
	_ = log.Prefix()
}
