package handler

import (
	"log"
	"net/http"
	"sync"
	"time"
)

// ChannelRequestLog 记录单次请求详情
type ChannelRequestLog struct {
	ID        string            `json:"id"`
	ModelName string            `json:"modelName"`
	Method    string            `json:"method"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	BodySize  int               `json:"bodySize"`
	Response  string            `json:"response,omitempty"`
	StatusCode int              `json:"statusCode,omitempty"`
	Error     string            `json:"error,omitempty"`
	CreatedAt time.Time         `json:"createdAt"`
}

// channelRequestLogs 按渠道 baseURL 存储最近的请求日志
var (
	channelRequestLogsMu sync.Mutex
	channelRequestLogs   = make(map[string][]*ChannelRequestLog) // baseURL -> 最近 10 条
	maxLogsPerChannel    = 10
)

// LogChannelRequest 记录一次渠道请求
func LogChannelRequest(baseURL, modelName, method, url string, headers map[string]string, body string, bodySize int) {
	channelRequestLogsMu.Lock()
	defer channelRequestLogsMu.Unlock()

	log.Printf("[ChannelRequestLog] baseURL=%s model=%s method=%s url=%s bodySize=%d", baseURL, modelName, method, url, bodySize)

	logs := channelRequestLogs[baseURL]
	if logs == nil {
		logs = make([]*ChannelRequestLog, 0, maxLogsPerChannel)
	}

	id := time.Now().Format("20060102150405.000")
	entry := &ChannelRequestLog{
		ID:        id,
		ModelName: modelName,
		Method:    method,
		URL:       url,
		Headers:   headers,
		Body:      body,
		BodySize:  bodySize,
		CreatedAt: time.Now(),
	}

	logs = append(logs, entry)
	if len(logs) > maxLogsPerChannel {
		logs = logs[len(logs)-maxLogsPerChannel:]
	}
	channelRequestLogs[baseURL] = logs
}

// LogChannelResponse 更新最近一条请求的响应信息
func LogChannelResponse(baseURL, response string, statusCode int, err string) {
	channelRequestLogsMu.Lock()
	defer channelRequestLogsMu.Unlock()

	logs := channelRequestLogs[baseURL]
	if len(logs) == 0 {
		return
	}
	last := logs[len(logs)-1]
	last.Response = response
	last.StatusCode = statusCode
	last.Error = err
}

// GetChannelRequestLogs 获取指定渠道的请求日志
func GetChannelRequestLogs(baseURL string) []*ChannelRequestLog {
	channelRequestLogsMu.Lock()
	defer channelRequestLogsMu.Unlock()

	logs := channelRequestLogs[baseURL]
	if logs == nil {
		return []*ChannelRequestLog{}
	}
	result := make([]*ChannelRequestLog, len(logs))
	copy(result, logs)
	return result
}

// GetAllChannelRequestLogs 获取所有渠道的最近一条请求日志
func GetAllChannelRequestLogs() map[string]*ChannelRequestLog {
	channelRequestLogsMu.Lock()
	defer channelRequestLogsMu.Unlock()

	result := make(map[string]*ChannelRequestLog)
	for baseURL, logs := range channelRequestLogs {
		if len(logs) > 0 {
			result[baseURL] = logs[len(logs)-1]
		}
	}
	return result
}

// HandleGetChannelRequestLogs API: GET /api/admin/channel-request-logs?baseURL=xxx
func HandleGetChannelRequestLogs(w http.ResponseWriter, r *http.Request) {
	baseURL := r.URL.Query().Get("baseURL")
	log.Printf("[ChannelRequestLog] Query: baseURL=%s", baseURL)
	if baseURL != "" {
		logs := GetChannelRequestLogs(baseURL)
		OK(w, logs)
		return
	}
	logs := GetAllChannelRequestLogs()
	OK(w, logs)
}
