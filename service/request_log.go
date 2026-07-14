package service

import (
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"sync"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/google/uuid"
)

// pollingTasks 跟踪轮询任务，用于去重：只记录第一次轮询和最终结果
var (
	pollingTasksMu sync.Mutex
	pollingTasks   = make(map[string]bool) // taskID -> true 表示已记录过首次轮询
)

// 从 URL 路径中提取任务 ID
var taskIDPattern = regexp.MustCompile(`/([^/]+)$`)

func extractTaskID(path string) string {
	// 匹配 /videos/task_xxx 或 /contents/generations/tasks/task_xxx
	if idx := strings.LastIndex(path, "/"); idx >= 0 {
		id := path[idx+1:]
		if strings.HasPrefix(id, "task_") || strings.HasPrefix(id, "tsk_") {
			return id
		}
	}
	return ""
}

// ShouldLogPollingRequest 判断轮询请求是否应该被记录
// 返回: shouldLog bool
func ShouldLogPollingRequest(path string, isPolling bool) bool {
	if !isPolling {
		return true
	}
	taskID := extractTaskID(path)
	if taskID == "" {
		return true // 无法提取 taskID，记录
	}

	pollingTasksMu.Lock()
	defer pollingTasksMu.Unlock()

	if !pollingTasks[taskID] {
		// 首次轮询，记录并标记
		pollingTasks[taskID] = true
		return true
	}
	return false // 已记录过首次轮询，跳过中间轮询
}

// markTaskCompleted 标记任务完成，后续轮询不再记录
func markTaskCompleted(path string) {
	taskID := extractTaskID(path)
	if taskID == "" {
		return
	}
	pollingTasksMu.Lock()
	delete(pollingTasks, taskID)
	pollingTasksMu.Unlock()
}

// LogRequest 记录 AI 代理请求
func LogRequest(userID, username, model_, method, path, url string, requestHeaders map[string]string, requestBody string, requestBodySize int, requestMedia string) string {
	return LogRequestWithSource(userID, username, model_, method, path, url, requestHeaders, requestBody, requestBodySize, requestMedia, "web")
}

func LogRequestWithSource(userID, username, model_, method, path, url string, requestHeaders map[string]string, requestBody string, requestBodySize int, requestMedia string, source string) string {
	headersJSON, _ := json.Marshal(requestHeaders)

	entry := &model.RequestLog{
		ID:              uuid.NewString(),
		UserID:          userID,
		Username:        username,
		Model:           model_,
		Method:          method,
		Path:            path,
		URL:             url,
		RequestHeaders:  string(headersJSON),
		RequestBody:     requestBody,
		RequestMedia:    requestMedia,
		RequestBodySize: requestBodySize,
		IsPolling:       extractTaskID(path) != "",
		Source:          source,
	}

	if err := repository.CreateRequestLog(entry); err != nil {
		log.Printf("LogRequest create failed: %v", err)
	}
	return entry.ID
}

// LogRequestResponse 更新请求日志的响应信息
func LogRequestResponse(id string, responseBody string, statusCode int, success bool, errorMsg string) {
	updates := map[string]interface{}{
		"response_body": responseBody,
		"status_code":   statusCode,
		"success":       success,
	}
	if errorMsg != "" {
		updates["error_msg"] = errorMsg
	}
	if err := repository.UpdateRequestLog(id, updates); err != nil {
		log.Printf("LogRequestResponse update failed: id=%s err=%v", id, err)
	}
}

func ListRequestLogs(q model.Query, method string, source string) (model.RequestLogList, error) {
	return repository.ListRequestLogs(q, method, source)
}

func BatchDeleteRequestLogs(ids []string) error {
	return repository.BatchDeleteRequestLogs(ids)
}

// LogAppRequest 记录 App 端提交的请求日志
func LogAppRequest(userID, username, model_, method, path, url string, requestHeaders string, requestBody string, responseBody string, statusCode int, success bool, errorMsg string, elapsedMs int64) string {
	entry := &model.RequestLog{
		ID:              uuid.NewString(),
		UserID:          userID,
		Username:        username,
		Model:           model_,
		Method:          method,
		Path:            path,
		URL:             url,
		RequestHeaders:  requestHeaders,
		RequestBody:     requestBody,
		ResponseBody:    responseBody,
		StatusCode:      statusCode,
		Success:         success,
		ErrorMsg:        errorMsg,
		Source:          "app",
		RequestBodySize: len(requestBody),
	}
	if err := repository.CreateRequestLog(entry); err != nil {
		log.Printf("LogAppRequest create failed: %v", err)
	}
	return entry.ID
}
