package service

import (
	"encoding/json"
	"errors"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	requestLogHeaderMaxChars   = 16 * 1024
	requestLogBodyMaxChars     = 64 * 1024
	requestLogMediaMaxChars    = 32 * 1024
	requestLogResponseMaxChars = 128 * 1024
	requestLogErrorMaxChars    = 16 * 1024
	requestLogRetentionDays    = 30
	requestLogMaxRows          = 5000
)

// pollingTasks 跟踪轮询任务，用于去重：只记录第一次轮询和最终结果
var (
	pollingTasksMu sync.Mutex
	pollingTasks   = make(map[string]bool) // taskID -> true 表示已记录过首次轮询

	requestLogCleanupMu   sync.Mutex
	requestLogLastCleanup time.Time
)

// 从 URL 路径中提取任务 ID
var taskIDPattern = regexp.MustCompile(`/([^/]+)$`)

var requestLogBase64Pattern = regexp.MustCompile(`(data:[^;"\s]+;base64,)[A-Za-z0-9+/=\r\n]{40,}`)

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
		RequestHeaders:  sanitizeRequestLogText(string(headersJSON), requestLogHeaderMaxChars),
		RequestBody:     sanitizeRequestLogText(requestBody, requestLogBodyMaxChars),
		RequestMedia:    sanitizeRequestLogText(requestMedia, requestLogMediaMaxChars),
		RequestBodySize: requestBodySize,
		IsPolling:       extractTaskID(path) != "",
		Source:          source,
	}

	if err := repository.CreateRequestLog(entry); err != nil {
		log.Printf("LogRequest create failed: %v", err)
	} else {
		go maybePruneRequestLogs()
	}
	return entry.ID
}

// LogRequestResponse 更新请求日志的响应信息
func LogRequestResponse(id string, responseBody string, statusCode int, success bool, errorMsg string) {
	updates := map[string]interface{}{
		"response_body": sanitizeRequestLogText(responseBody, requestLogResponseMaxChars),
		"status_code":   statusCode,
		"success":       success,
	}
	if errorMsg != "" {
		updates["error_msg"] = sanitizeRequestLogText(errorMsg, requestLogErrorMaxChars)
	}
	if err := repository.UpdateRequestLog(id, updates); err != nil {
		log.Printf("LogRequestResponse update failed: id=%s err=%v", id, err)
	}
}

func ListRequestLogs(q model.Query, method string, source string) (model.RequestLogList, error) {
	return repository.ListRequestLogs(q, method, source)
}

func GetRequestLog(id string) (model.RequestLog, error) {
	item, err := repository.GetRequestLog(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.RequestLog{}, safeMessageError{message: "请求日志不存在"}
	}
	if err != nil {
		return model.RequestLog{}, err
	}
	item.RequestHeaders = sanitizeRequestLogText(item.RequestHeaders, requestLogHeaderMaxChars)
	item.RequestBody = sanitizeRequestLogText(item.RequestBody, requestLogBodyMaxChars)
	item.RequestMedia = sanitizeRequestLogText(item.RequestMedia, requestLogMediaMaxChars)
	item.ResponseBody = sanitizeRequestLogText(item.ResponseBody, requestLogResponseMaxChars)
	item.ErrorMsg = sanitizeRequestLogText(item.ErrorMsg, requestLogErrorMaxChars)
	return item, nil
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
		RequestHeaders:  sanitizeRequestLogText(requestHeaders, requestLogHeaderMaxChars),
		RequestBody:     sanitizeRequestLogText(requestBody, requestLogBodyMaxChars),
		ResponseBody:    sanitizeRequestLogText(responseBody, requestLogResponseMaxChars),
		StatusCode:      statusCode,
		Success:         success,
		ErrorMsg:        sanitizeRequestLogText(errorMsg, requestLogErrorMaxChars),
		Source:          "app",
		RequestBodySize: len(requestBody),
	}
	if err := repository.CreateRequestLog(entry); err != nil {
		log.Printf("LogAppRequest create failed: %v", err)
	} else {
		go maybePruneRequestLogs()
	}
	return entry.ID
}

func sanitizeRequestLogText(value string, maxChars int) string {
	if value == "" || maxChars <= 0 {
		return ""
	}
	value = requestLogBase64Pattern.ReplaceAllString(value, `${1}[base64 omitted]`)
	runes := []rune(value)
	if len(runes) <= maxChars {
		return value
	}
	return string(runes[:maxChars]) + "\n...[日志内容已截断]"
}

func maybePruneRequestLogs() {
	nowTime := time.Now()
	requestLogCleanupMu.Lock()
	if !requestLogLastCleanup.IsZero() && nowTime.Sub(requestLogLastCleanup) < time.Hour {
		requestLogCleanupMu.Unlock()
		return
	}
	requestLogLastCleanup = nowTime
	requestLogCleanupMu.Unlock()

	deleted, err := repository.PruneRequestLogs(nowTime.AddDate(0, 0, -requestLogRetentionDays), requestLogMaxRows)
	if err != nil {
		log.Printf("request log cleanup failed: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("request log cleanup removed %d expired or excess records", deleted)
	}
}
