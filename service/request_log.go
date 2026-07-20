package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	requestLogHeaderMaxChars   = 32 * 1024
	requestLogBodyMaxChars     = 256 * 1024
	requestLogMediaMaxChars    = 64 * 1024
	requestLogResponseMaxChars = 512 * 1024
	requestLogErrorMaxChars    = 64 * 1024
)

var (
	pollingTasksMu sync.Mutex
	pollingTasks   = make(map[string]bool)
)

var (
	requestLogBase64Pattern    = regexp.MustCompile(`(data:[^;"\s]+;base64,)[A-Za-z0-9+/=\r\n]{40,}`)
	requestLogSignedURLPattern = regexp.MustCompile(`(?i)([?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|api[_-]?key|access[_-]?token|token)=)[^&\s"']+`)
)

type RequestLogDetails struct {
	Request        *http.Request
	EventType      string
	Operation      string
	ChannelName    string
	ProviderID     string
	Source         string
	TaskID         string
	RequestID      string
	RequestedCount int
	Credits        int
	BillingMode    string
	ErrorStage     string
}

type RequestLogResponse struct {
	Body           string
	Headers        http.Header
	StatusCode     int
	Success        bool
	ErrorMsg       string
	ErrorStage     string
	ElapsedMs      int64
	GeneratedCount int
}

func extractTaskID(path string) string {
	if idx := strings.LastIndex(path, "/"); idx >= 0 {
		id := path[idx+1:]
		if strings.HasPrefix(id, "task_") || strings.HasPrefix(id, "tsk_") {
			return id
		}
	}
	return ""
}

func ShouldLogPollingRequest(path string, isPolling bool) bool {
	if !isPolling {
		return true
	}
	taskID := extractTaskID(path)
	if taskID == "" {
		return true
	}
	pollingTasksMu.Lock()
	defer pollingTasksMu.Unlock()
	if !pollingTasks[taskID] {
		pollingTasks[taskID] = true
		return true
	}
	return false
}

func markTaskCompleted(path string) {
	taskID := extractTaskID(path)
	if taskID == "" {
		return
	}
	pollingTasksMu.Lock()
	delete(pollingTasks, taskID)
	pollingTasksMu.Unlock()
}

func LogRequest(userID, username, modelName, method, path, url string, requestHeaders map[string]string, requestBody string, requestBodySize int, requestMedia string) string {
	return LogRequestDetailed(userID, username, modelName, method, path, url, requestHeaders, requestBody, requestBodySize, requestMedia, RequestLogDetails{Source: "web"})
}

func LogRequestWithSource(userID, username, modelName, method, path, url string, requestHeaders map[string]string, requestBody string, requestBodySize int, requestMedia string, source string) string {
	return LogRequestDetailed(userID, username, modelName, method, path, url, requestHeaders, requestBody, requestBodySize, requestMedia, RequestLogDetails{Source: source})
}

func LogRequestDetailed(userID, username, modelName, method, path, requestURL string, requestHeaders map[string]string, requestBody string, requestBodySize int, requestMedia string, details RequestLogDetails) string {
	metadata := ClientMetadata{}
	if details.Request != nil {
		metadata = ClientMetadataFromRequest(details.Request)
	}
	source := normalizeRequestLogSource(details.Source)
	if source == "" {
		source = normalizeRequestLogSource(metadata.ClientType)
	}
	if source == "" {
		source = "web"
	}
	operation := strings.TrimSpace(details.Operation)
	if operation == "" {
		operation = requestLogOperation(method, path)
	}
	eventType := strings.TrimSpace(details.EventType)
	if eventType == "" {
		eventType = requestLogEventType(operation, method)
	}
	requestedCount, imageCount, videoCount, audioCount := requestLogCounts(requestBody, operation)
	if details.RequestedCount > 0 {
		requestedCount = details.RequestedCount
	}
	requestID := strings.TrimSpace(details.RequestID)
	if requestID == "" && details.Request != nil {
		requestID = requestLogFirstNonEmpty(details.Request.Header.Get("X-Request-ID"), details.Request.Header.Get("X-Canvas-Request-Nonce"))
	}
	if requestID == "" {
		requestID = uuid.NewString()
	}

	entry := &model.RequestLog{
		ID:                  uuid.NewString(),
		UserID:              userID,
		Username:            username,
		EventType:           eventType,
		Operation:           operation,
		Model:               modelName,
		ChannelName:         strings.TrimSpace(details.ChannelName),
		ProviderID:          strings.TrimSpace(details.ProviderID),
		Method:              strings.ToUpper(strings.TrimSpace(method)),
		Path:                path,
		URL:                 sanitizeRequestLogURL(requestURL),
		RequestHeaders:      marshalSanitizedHeaders(requestHeaders),
		RequestBody:         sanitizeRequestLogText(requestBody, requestLogBodyMaxChars),
		RequestMedia:        sanitizeRequestLogText(requestMedia, requestLogMediaMaxChars),
		RequestConfig:       requestLogConfig(requestBody),
		RequestBodySize:     requestBodySize,
		IsPolling:           extractTaskID(path) != "" || strings.Contains(operation, "poll"),
		Source:              source,
		Credits:             details.Credits,
		BillingMode:         details.BillingMode,
		RequestedCount:      requestedCount,
		ReferenceImageCount: imageCount,
		ReferenceVideoCount: videoCount,
		ReferenceAudioCount: audioCount,
		TaskID:              strings.TrimSpace(details.TaskID),
		RequestID:           requestID,
		ErrorStage:          strings.TrimSpace(details.ErrorStage),
		IPAddress:           metadata.IPAddress,
		DeviceCode:          metadata.DeviceCode,
		ClientType:          metadata.ClientType,
		AppVersion:          metadata.AppVersion,
		OSName:              metadata.OSName,
		OSVersion:           metadata.OSVersion,
		UserAgent:           metadata.UserAgent,
	}
	if err := repository.CreateRequestLog(entry); err != nil {
		log.Printf("LogRequestDetailed create failed: %v", err)
	}
	return entry.ID
}

func LogRequestResponse(id string, responseBody string, statusCode int, success bool, errorMsg string) {
	LogRequestResponseDetailed(id, RequestLogResponse{Body: responseBody, StatusCode: statusCode, Success: success, ErrorMsg: errorMsg, GeneratedCount: -1})
}

func LogRequestResponseDetailed(id string, response RequestLogResponse) {
	if strings.TrimSpace(id) == "" {
		return
	}
	generatedCount := response.GeneratedCount
	if generatedCount < 0 {
		generatedCount = responseGeneratedCount(response.Body)
	}
	updates := map[string]interface{}{
		"status_code":     response.StatusCode,
		"success":         response.Success,
		"generated_count": max(0, generatedCount),
	}
	if len(response.Headers) > 0 {
		updates["response_headers"] = marshalSanitizedHTTPHeaders(response.Headers)
	}
	if response.Body != "" {
		updates["response_body"] = sanitizeRequestLogText(response.Body, requestLogResponseMaxChars)
	}
	if response.ElapsedMs > 0 {
		updates["elapsed_ms"] = response.ElapsedMs
	}
	if response.ErrorMsg != "" {
		updates["error_msg"] = sanitizeRequestLogText(response.ErrorMsg, requestLogErrorMaxChars)
	}
	errorStage := strings.TrimSpace(response.ErrorStage)
	if errorStage == "" && !response.Success {
		errorStage = inferRequestLogErrorStage(response.StatusCode, response.ErrorMsg)
	}
	if errorStage != "" {
		updates["error_stage"] = errorStage
	}
	if err := repository.UpdateRequestLog(id, updates); err != nil {
		log.Printf("LogRequestResponseDetailed update failed: id=%s err=%v", id, err)
	}
}

func UpdateRequestLogBilling(id string, charge model.CreditCharge) {
	if id == "" || charge.ID == "" {
		return
	}
	mode := "wallet"
	if charge.SubscriptionCredits > 0 && charge.WalletCredits > 0 {
		mode = "mixed"
	} else if charge.SubscriptionCredits > 0 {
		mode = "subscription"
	}
	updates := map[string]interface{}{
		"credits":              charge.TotalCredits,
		"wallet_credits":       charge.WalletCredits,
		"subscription_credits": charge.SubscriptionCredits,
		"billing_mode":         mode,
		"charge_status":        string(charge.Status),
		"credit_charge_id":     charge.ID,
	}
	if err := repository.UpdateRequestLog(id, updates); err != nil {
		log.Printf("UpdateRequestLogBilling failed: id=%s err=%v", id, err)
	}
}

func UpdateRequestLogFreeBilling(id, mode string) {
	if id == "" {
		return
	}
	if err := repository.UpdateRequestLog(id, map[string]interface{}{"billing_mode": mode, "charge_status": "free"}); err != nil {
		log.Printf("UpdateRequestLogFreeBilling failed: id=%s err=%v", id, err)
	}
}

func UpdateRequestLogTask(id, taskID string) {
	if id == "" || taskID == "" {
		return
	}
	_ = repository.UpdateRequestLog(id, map[string]interface{}{"task_id": taskID})
}

func CompleteRequestLogsForTask(task model.GenerationTask) {
	if task.ID == "" || (task.Status != model.GenerationTaskStatusSucceeded && task.Status != model.GenerationTaskStatusFailed) {
		return
	}
	generatedCount := len(task.ResultImages)
	if generatedCount == 0 && task.ResultURL != "" {
		generatedCount = 1
	}
	updates := map[string]interface{}{
		"success":         task.Status == model.GenerationTaskStatusSucceeded,
		"generated_count": generatedCount,
		"elapsed_ms":      max(int64(0), time.Since(task.CreatedAt).Milliseconds()),
	}
	if task.ErrorMsg != "" {
		updates["error_msg"] = sanitizeRequestLogText(task.ErrorMsg, requestLogErrorMaxChars)
		updates["error_stage"] = "generation"
	}
	if err := repository.UpdateRequestLogsByTaskID(task.ID, updates); err != nil {
		log.Printf("CompleteRequestLogsForTask failed: task=%s err=%v", task.ID, err)
	}
}

func UpdateRequestLogClient(id string, metadata ClientMetadata) {
	if id == "" {
		return
	}
	_ = repository.UpdateRequestLog(id, map[string]interface{}{
		"source":      normalizeRequestLogSource(metadata.ClientType),
		"client_type": metadata.ClientType,
		"ip_address":  metadata.IPAddress,
		"device_code": metadata.DeviceCode,
		"app_version": metadata.AppVersion,
		"os_name":     metadata.OSName,
		"os_version":  metadata.OSVersion,
		"user_agent":  metadata.UserAgent,
	})
}

func ListRequestLogs(q model.RequestLogQuery) (model.RequestLogList, error) {
	list, err := repository.ListRequestLogs(q)
	if err != nil {
		return list, err
	}
	for index := range list.Items {
		enrichRequestLogSummary(&list.Items[index])
	}
	return list, nil
}

func GetRequestLog(id string) (model.RequestLog, error) {
	item, err := repository.GetRequestLog(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.RequestLog{}, safeMessageError{message: "使用日志不存在"}
	}
	if err != nil {
		return model.RequestLog{}, err
	}
	item.RequestHeaders = sanitizeRequestLogText(item.RequestHeaders, requestLogHeaderMaxChars)
	item.RequestBody = sanitizeRequestLogText(item.RequestBody, requestLogBodyMaxChars)
	item.RequestMedia = sanitizeRequestLogText(item.RequestMedia, requestLogMediaMaxChars)
	item.RequestConfig = sanitizeRequestLogText(item.RequestConfig, requestLogBodyMaxChars)
	item.ResponseHeaders = sanitizeRequestLogText(item.ResponseHeaders, requestLogHeaderMaxChars)
	item.ResponseBody = sanitizeRequestLogText(item.ResponseBody, requestLogResponseMaxChars)
	item.ErrorMsg = sanitizeRequestLogText(item.ErrorMsg, requestLogErrorMaxChars)
	enrichRequestLog(&item)
	return item, nil
}

func BatchDeleteRequestLogs(ids []string) error {
	return repository.BatchDeleteRequestLogs(ids)
}

func ClearRequestLogs() (int64, error) {
	return repository.ClearRequestLogs()
}

func LogAppRequest(userID, username, modelName, method, path, requestURL string, requestHeaders string, requestBody string, responseBody string, statusCode int, success bool, errorMsg string, elapsedMs int64) string {
	headerMap := map[string]string{}
	_ = json.Unmarshal([]byte(requestHeaders), &headerMap)
	id := LogRequestDetailed(userID, username, modelName, method, path, requestURL, headerMap, requestBody, len(requestBody), "", RequestLogDetails{Source: "app"})
	LogRequestResponseDetailed(id, RequestLogResponse{Body: responseBody, StatusCode: statusCode, Success: success, ErrorMsg: errorMsg, ElapsedMs: elapsedMs, GeneratedCount: -1})
	return id
}

func LogBusinessUsage(r *http.Request, user model.AuthUser, requestBody, responseBody string, statusCode int, success bool, errorMsg string, elapsedMs int64) string {
	modelName := requestLogModel(requestBody)
	headerMap := requestHeadersForLog(r.Header)
	id := LogRequestDetailed(user.ID, user.Username, modelName, r.Method, r.URL.Path, r.URL.RequestURI(), headerMap, requestBody, len(requestBody), "", RequestLogDetails{Request: r})
	LogRequestResponseDetailed(id, RequestLogResponse{Body: responseBody, StatusCode: statusCode, Success: success, ErrorMsg: errorMsg, ElapsedMs: elapsedMs, GeneratedCount: 0})
	return id
}

func SanitizedRequestLogText(value string, maxChars int) string {
	return sanitizeRequestLogText(value, maxChars)
}

func sanitizeRequestLogText(value string, maxChars int) string {
	if value == "" || maxChars <= 0 {
		return ""
	}
	value = requestLogBase64Pattern.ReplaceAllString(value, `${1}[base64 omitted]`)
	var decoded any
	decoder := json.NewDecoder(strings.NewReader(value))
	decoder.UseNumber()
	if decoder.Decode(&decoded) == nil {
		decoded = sanitizeRequestLogValue("", decoded)
		if encoded, err := json.Marshal(decoded); err == nil {
			value = string(encoded)
		}
	}
	value = sanitizeRequestLogURL(value)
	runes := []rune(value)
	if len(runes) <= maxChars {
		return value
	}
	return string(runes[:maxChars]) + "\n...[日志内容已截断]"
}

func sanitizeRequestLogValue(key string, value any) any {
	if isRequestLogSecretKey(key) {
		return "[masked]"
	}
	switch typed := value.(type) {
	case map[string]any:
		for childKey, childValue := range typed {
			typed[childKey] = sanitizeRequestLogValue(childKey, childValue)
		}
		return typed
	case []any:
		for index, childValue := range typed {
			typed[index] = sanitizeRequestLogValue(key, childValue)
		}
		return typed
	case string:
		if strings.Contains(typed, ";base64,") {
			prefix := typed[:strings.Index(typed, ";base64,")+8]
			return prefix + fmt.Sprintf("[base64 omitted: %d chars]", len(typed))
		}
		if isRequestLogBase64Key(key) && len(typed) > 80 {
			return fmt.Sprintf("[base64 omitted: %d chars]", len(typed))
		}
		return sanitizeRequestLogURL(typed)
	default:
		return value
	}
}

func isRequestLogSecretKey(key string) bool {
	normalized := strings.ToLower(strings.NewReplacer("_", "", "-", "", " ", "").Replace(strings.TrimSpace(key)))
	switch normalized {
	case "authorization", "apikey", "password", "passwd", "secret", "accesstoken", "refreshtoken", "token", "cookie", "setcookie", "emailcode", "verificationcode", "verifycode":
		return true
	default:
		return false
	}
}

func isRequestLogBase64Key(key string) bool {
	normalized := strings.ToLower(strings.NewReplacer("_", "", "-", "").Replace(key))
	return normalized == "b64json" || normalized == "base64" || normalized == "imagebase64"
}

func sanitizeRequestLogURL(value string) string {
	return requestLogSignedURLPattern.ReplaceAllString(value, `${1}[masked]`)
}

func marshalSanitizedHeaders(headers map[string]string) string {
	if len(headers) == 0 {
		return "{}"
	}
	sanitized := make(map[string]string, len(headers))
	for key, value := range headers {
		if isRequestLogSecretKey(key) {
			sanitized[key] = "[masked]"
		} else {
			sanitized[key] = sanitizeRequestLogURL(value)
		}
	}
	encoded, _ := json.Marshal(sanitized)
	return sanitizeRequestLogText(string(encoded), requestLogHeaderMaxChars)
}

func marshalSanitizedHTTPHeaders(headers http.Header) string {
	if len(headers) == 0 {
		return ""
	}
	values := make(map[string]string, len(headers))
	for key, items := range headers {
		values[key] = strings.Join(items, ", ")
	}
	return marshalSanitizedHeaders(values)
}

func requestHeadersForLog(headers http.Header) map[string]string {
	values := make(map[string]string, len(headers))
	for key, items := range headers {
		values[key] = strings.Join(items, ", ")
	}
	return values
}

func requestLogConfig(body string) string {
	var raw map[string]any
	if json.Unmarshal([]byte(body), &raw) != nil {
		return ""
	}
	for key := range raw {
		normalized := strings.ToLower(key)
		if normalized == "prompt" || normalized == "messages" || normalized == "input" || isRequestLogMediaKey(normalized) {
			delete(raw, key)
		}
	}
	encoded, _ := json.Marshal(sanitizeRequestLogValue("", raw))
	return sanitizeRequestLogText(string(encoded), requestLogBodyMaxChars)
}

func requestLogCounts(body, operation string) (requested, images, videos, audios int) {
	var raw map[string]any
	if json.Unmarshal([]byte(body), &raw) == nil {
		requested = positiveInt(raw["n"])
		if requested == 0 {
			requested = positiveInt(raw["count"])
		}
		walkRequestLogMedia(raw, &images, &videos, &audios)
	}
	if requested == 0 && strings.Contains(operation, "generation") {
		requested = 1
	}
	return
}

func walkRequestLogMedia(value any, images, videos, audios *int) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			normalized := strings.ToLower(key)
			count := requestLogValueCount(child)
			switch {
			case strings.Contains(normalized, "image") && isRequestLogMediaKey(normalized):
				*images += count
			case strings.Contains(normalized, "video") && isRequestLogMediaKey(normalized):
				*videos += count
			case strings.Contains(normalized, "audio") && isRequestLogMediaKey(normalized):
				*audios += count
			default:
				walkRequestLogMedia(child, images, videos, audios)
			}
		}
	case []any:
		for _, child := range typed {
			walkRequestLogMedia(child, images, videos, audios)
		}
	}
}

func isRequestLogMediaKey(key string) bool {
	key = strings.ToLower(key)
	return strings.Contains(key, "image") || strings.Contains(key, "video") || strings.Contains(key, "audio") || strings.Contains(key, "reference") || strings.Contains(key, "input_reference")
}

func requestLogValueCount(value any) int {
	switch typed := value.(type) {
	case []any:
		return len(typed)
	case string:
		if strings.TrimSpace(typed) != "" {
			return 1
		}
	case map[string]any:
		return 1
	}
	return 0
}

func positiveInt(value any) int {
	switch typed := value.(type) {
	case float64:
		return max(0, int(typed))
	case json.Number:
		parsed, _ := strconv.Atoi(typed.String())
		return max(0, parsed)
	case string:
		parsed, _ := strconv.Atoi(typed)
		return max(0, parsed)
	default:
		return 0
	}
}

func responseGeneratedCount(body string) int {
	var raw map[string]any
	if json.Unmarshal([]byte(body), &raw) != nil {
		return 0
	}
	for _, key := range []string{"data", "images", "output", "results"} {
		if values, ok := raw[key].([]any); ok {
			return len(values)
		}
	}
	for _, path := range []string{"url", "video_url", "data.url", "data.video_url", "result.url", "result.video_url"} {
		if requestLogStringAtPath(raw, path) != "" {
			return 1
		}
	}
	return 0
}

func requestLogStringAtPath(raw map[string]any, path string) string {
	var value any = raw
	for _, part := range strings.Split(path, ".") {
		object, ok := value.(map[string]any)
		if !ok {
			return ""
		}
		value = object[part]
	}
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func requestLogModel(body string) string {
	var raw map[string]any
	if json.Unmarshal([]byte(body), &raw) == nil {
		if modelName, ok := raw["model"].(string); ok {
			return strings.TrimSpace(modelName)
		}
	}
	return ""
}

func requestLogOperation(method, path string) string {
	path = strings.ToLower(path)
	switch {
	case strings.Contains(path, "/images/edits"):
		return "image_edit"
	case strings.Contains(path, "/images/generations") || strings.Contains(path, "/image-tasks/generations"):
		return "image_generation"
	case strings.Contains(path, "/video") && (strings.Contains(path, "generation") || method == http.MethodPost):
		return "video_generation"
	case strings.Contains(path, "/chat/completions"):
		return "chat_completion"
	case strings.Contains(path, "/audio/speech"):
		return "audio_generation"
	case strings.Contains(path, "/auth/login") || strings.Contains(path, "/admin/login"):
		return "login"
	case strings.Contains(path, "/auth/register"):
		return "register"
	case strings.Contains(path, "/password-email-code"):
		return "password_verification"
	case strings.Contains(path, "/checkin"):
		return "check_in"
	case strings.Contains(path, "/redeem"):
		return "redeem"
	case strings.Contains(path, "/subscription"):
		return "subscription"
	case strings.Contains(path, "/offline-credits/sync"):
		return "offline_credit_sync"
	case strings.Contains(path, "/credits/consume"):
		return "credit_consume"
	case strings.Contains(path, "/credits/refund"):
		return "credit_refund"
	case strings.Contains(path, "/profile"):
		return "profile_update"
	case strings.Contains(path, "/bind-aff-code"):
		return "referral_bind"
	case strings.Contains(path, "/media/"):
		return "media_upload"
	case strings.Contains(path, "/access-bans"):
		return "access_ban"
	case strings.Contains(path, "/risk-events"):
		return "risk_event_operation"
	case strings.Contains(path, "/app-releases"):
		return "app_release_operation"
	case strings.Contains(path, "/model-classifications"):
		return "model_configuration"
	case strings.Contains(path, "/system-settings") || strings.Contains(path, "/admin/settings"):
		return "settings_update"
	case strings.Contains(path, "/admin/users"):
		return "user_management"
	case strings.Contains(path, "/admin/"):
		return "admin_operation"
	case strings.EqualFold(method, "ERROR"):
		return "client_error"
	default:
		return "api_operation"
	}
}

func requestLogEventType(operation, method string) string {
	switch {
	case strings.Contains(operation, "generation"), operation == "image_edit", operation == "chat_completion":
		return "generation"
	case operation == "login" || operation == "register" || operation == "password_verification":
		return "authentication"
	case strings.Contains(operation, "credit") || operation == "redeem" || operation == "check_in":
		return "credits"
	case operation == "subscription":
		return "subscription"
	case operation == "admin_operation":
		return "admin"
	case operation == "client_error" || strings.EqualFold(method, "ERROR"):
		return "error"
	default:
		return "business"
	}
}

func inferRequestLogErrorStage(statusCode int, errorMsg string) string {
	lower := strings.ToLower(errorMsg)
	switch {
	case strings.Contains(lower, "算力点") || strings.Contains(lower, "额度"):
		return "billing"
	case statusCode >= 400:
		return "upstream"
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "network") || strings.Contains(lower, "request failed"):
		return "network"
	default:
		return "processing"
	}
}

func enrichRequestLogSummary(item *model.RequestLogSummary) {
	if item.Operation == "" {
		item.Operation = requestLogOperation(item.Method, item.Path)
	}
	if item.EventType == "" {
		item.EventType = requestLogEventType(item.Operation, item.Method)
	}
	if normalizeRequestLogSource(item.Source) == "" {
		item.Source = "web"
	}
	if item.RequestedCount == 0 && strings.Contains(item.Operation, "generation") {
		item.RequestedCount = 1
	}
}

func enrichRequestLog(item *model.RequestLog) {
	if item.Operation == "" {
		item.Operation = requestLogOperation(item.Method, item.Path)
	}
	if item.EventType == "" {
		item.EventType = requestLogEventType(item.Operation, item.Method)
	}
	if normalizeRequestLogSource(item.Source) == "" {
		item.Source = normalizeRequestLogSource(item.ClientType)
		if item.Source == "" {
			item.Source = "web"
		}
	}
	if item.RequestedCount == 0 && strings.Contains(item.Operation, "generation") {
		item.RequestedCount = 1
	}
}

func normalizeRequestLogSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "app":
		return "app"
	case "web", "admin":
		return "web"
	default:
		return ""
	}
}

func requestLogFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
