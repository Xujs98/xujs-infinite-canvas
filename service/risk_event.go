package service

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	requestTimestampHeader = "X-Canvas-Request-Timestamp"
	requestNonceHeader     = "X-Canvas-Request-Nonce"
	requestClockSkew       = 5 * time.Minute
	nonceRetention         = 10 * time.Minute

	riskSummaryMaxChars = 240
	riskDetailMaxChars  = 4000
)

type RiskEventInput struct {
	UserID    string
	Username  string
	EventType string
	Level     model.RiskLevel
	Source    string
	Summary   string
	Detail    map[string]any
	Metadata  ClientMetadata
	Path      string
}

type ClientRiskInspection struct {
	Blocked bool
	Message string
}

var appRequestNonces = struct {
	sync.Mutex
	items map[string]time.Time
}{items: map[string]time.Time{}}

var recordRiskSignal = RecordRequestRisk

func RecordRiskEvent(input RiskEventInput) error {
	input.UserID = strings.TrimSpace(input.UserID)
	input.Username = trimField(input.Username, 100)
	if input.Username == "" && input.UserID != "" {
		if user, ok, _ := repository.GetUserByID(input.UserID); ok {
			input.Username = trimField(user.Username, 100)
		}
	}
	input.EventType = normalizeRiskToken(input.EventType, 80)
	if input.EventType == "" {
		return nil
	}
	if !validRiskLevel(input.Level) {
		input.Level = model.RiskLevelMedium
	}
	input.Source = normalizeRiskToken(input.Source, 40)
	if input.Source == "" {
		input.Source = "server"
	}
	timestamp := time.Now()
	detail := marshalRiskDetail(input.Detail)
	event := model.RiskEvent{
		ID:              newID("risk"),
		UserID:          input.UserID,
		Username:        input.Username,
		EventType:       input.EventType,
		Level:           input.Level,
		Status:          model.RiskStatusOpen,
		Source:          input.Source,
		IPAddress:       normalizeIP(input.Metadata.IPAddress),
		DeviceCode:      normalizeDeviceCode(input.Metadata.DeviceCode),
		ClientType:      trimField(input.Metadata.ClientType, 20),
		AppVersion:      trimField(input.Metadata.AppVersion, 64),
		Path:            trimField(input.Path, 300),
		Summary:         trimField(input.Summary, riskSummaryMaxChars),
		Detail:          detail,
		OccurrenceCount: 1,
		FirstSeenAt:     timestamp,
		LastSeenAt:      timestamp,
		CreatedAt:       timestamp,
		UpdatedAt:       timestamp,
	}
	_, err := repository.SaveRiskEvent(event)
	return err
}

func RecordRequestRisk(r *http.Request, user model.AuthUser, eventType string, level model.RiskLevel, source, summary string, detail map[string]any) {
	if r == nil {
		return
	}
	_ = RecordRiskEvent(RiskEventInput{
		UserID: user.ID, Username: user.Username, EventType: eventType, Level: level,
		Source: source, Summary: summary, Detail: detail,
		Metadata: ClientMetadataFromRequest(r), Path: r.URL.Path,
	})
}

func InspectClientRiskSignals(r *http.Request, user model.AuthUser) (ClientRiskInspection, error) {
	metadata := ClientMetadataFromRequest(r)
	if metadata.ClientType != "app" {
		return ClientRiskInspection{}, nil
	}
	record := func(eventType string, level model.RiskLevel, summary string, detail map[string]any) {
		recordRiskSignal(r, user, eventType, level, "app", summary, detail)
	}

	if metadata.DeviceCode == "" {
		record("app_device_invalid", model.RiskLevelHigh, "App 请求缺少有效设备标识", nil)
	}
	if metadata.AppVersion == "" {
		record("app_integrity_missing", model.RiskLevelMedium, "App 请求缺少客户端版本标识", nil)
	}
	if isInsecurePublicRequest(r) {
		record("insecure_transport", model.RiskLevelHigh, "App 通过非加密公网连接访问服务端", nil)
	}

	timestampText := strings.TrimSpace(r.Header.Get(requestTimestampHeader))
	nonce := strings.TrimSpace(r.Header.Get(requestNonceHeader))
	if timestampText == "" && nonce == "" {
		record("app_integrity_missing", model.RiskLevelMedium, "App 请求缺少防重放标识，可能来自旧版客户端", map[string]any{"legacyClient": true})
		return ClientRiskInspection{}, nil
	}
	if timestampText == "" || nonce == "" {
		record("app_integrity_missing", model.RiskLevelHigh, "App 防重放标识不完整", map[string]any{"hasTimestamp": timestampText != "", "hasNonce": nonce != ""})
		return ClientRiskInspection{Blocked: true, Message: "请求安全校验失败，请更新客户端后重试"}, nil
	}

	timestamp, err := strconv.ParseInt(timestampText, 10, 64)
	if err != nil || timestamp <= 0 {
		record("app_timestamp_invalid", model.RiskLevelHigh, "App 请求时间戳格式无效", nil)
		return ClientRiskInspection{Blocked: true, Message: "请求时间校验失败，请检查系统时间"}, nil
	}
	requestTime := time.Unix(timestamp, 0)
	if delta := time.Since(requestTime); delta > requestClockSkew || delta < -requestClockSkew {
		record("app_timestamp_invalid", model.RiskLevelHigh, "App 请求时间戳超出允许范围", map[string]any{"clockSkewSeconds": int64(delta.Seconds())})
		return ClientRiskInspection{Blocked: true, Message: "请求时间已失效，请校准系统时间后重试"}, nil
	}
	if !validNonce(nonce) {
		record("app_integrity_missing", model.RiskLevelHigh, "App 请求 nonce 格式无效", nil)
		return ClientRiskInspection{Blocked: true, Message: "请求安全校验失败，请重试"}, nil
	}

	deviceKey := metadata.DeviceCode
	if deviceKey == "" {
		deviceKey = metadata.IPAddress
	}
	if consumeNonce(deviceKey+":"+nonce, time.Now()) {
		record("app_request_replay", model.RiskLevelCritical, "检测到重复的一次性请求标识，已拦截疑似重放请求", nil)
		return ClientRiskInspection{Blocked: true, Message: "检测到重复请求，已拒绝处理"}, nil
	}
	return ClientRiskInspection{}, nil
}

func ListRiskEvents(q model.Query, userID string, level model.RiskLevel, source string) (model.RiskEventList, error) {
	return repository.ListRiskEvents(q, strings.TrimSpace(userID), level, strings.TrimSpace(source))
}

func GetRiskEventStats() (model.RiskEventStats, error) { return repository.RiskEventStats() }

func UpdateRiskEventStatus(id string, status model.RiskStatus, adminUserID string) error {
	if status != model.RiskStatusOpen && status != model.RiskStatusResolved && status != model.RiskStatusIgnored {
		return safeMessageError{message: "风险事件状态无效"}
	}
	return repository.UpdateRiskEventStatus(strings.TrimSpace(id), status, strings.TrimSpace(adminUserID), time.Now())
}

func BatchDeleteRiskEvents(ids []string) error { return repository.BatchDeleteRiskEvents(ids) }
func ClearRiskEvents() (int64, error)          { return repository.ClearRiskEvents() }

func consumeNonce(key string, timestamp time.Time) bool {
	appRequestNonces.Lock()
	defer appRequestNonces.Unlock()
	cutoff := timestamp.Add(-nonceRetention)
	for existing, seenAt := range appRequestNonces.items {
		if seenAt.Before(cutoff) {
			delete(appRequestNonces.items, existing)
		}
	}
	if seenAt, ok := appRequestNonces.items[key]; ok && seenAt.After(cutoff) {
		return true
	}
	appRequestNonces.items[key] = timestamp
	return false
}

func validNonce(value string) bool {
	if len(value) < 16 || len(value) > 128 {
		return false
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || strings.ContainsRune("-_.:", char) {
			continue
		}
		return false
	}
	return true
}

func isInsecurePublicRequest(r *http.Request) bool {
	if r.TLS != nil || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
		return false
	}
	host := r.Host
	if parsed, err := url.Parse("http://" + host); err == nil {
		host = parsed.Hostname()
	}
	host = strings.ToLower(strings.TrimSpace(host))
	return host != "" && host != "localhost" && host != "127.0.0.1" && host != "::1"
}

func marshalRiskDetail(detail map[string]any) string {
	if len(detail) == 0 {
		return ""
	}
	sanitized := sanitizeRiskValue(detail, "")
	payload, err := json.Marshal(sanitized)
	if err != nil {
		return ""
	}
	return trimField(string(payload), riskDetailMaxChars)
}

func sanitizeRiskValue(value any, key string) any {
	key = strings.ToLower(strings.TrimSpace(key))
	for _, blocked := range []string{"password", "secret", "token", "authorization", "code", "apikey", "api_key", "prompt", "body", "base64", "media"} {
		if strings.Contains(key, blocked) {
			return "[redacted]"
		}
	}
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for childKey, childValue := range typed {
			result[trimField(childKey, 80)] = sanitizeRiskValue(childValue, childKey)
		}
		return result
	case []any:
		limit := len(typed)
		if limit > 20 {
			limit = 20
		}
		result := make([]any, 0, limit)
		for _, child := range typed[:limit] {
			result = append(result, sanitizeRiskValue(child, key))
		}
		return result
	case string:
		return trimField(typed, 300)
	case nil, bool, float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return typed
	default:
		return trimField("unsupported", 20)
	}
}

func normalizeRiskToken(value string, maxLength int) string {
	value = strings.ToLower(strings.TrimSpace(value))
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '_' || char == '-' {
			continue
		}
		return ""
	}
	return trimField(value, maxLength)
}

func validRiskLevel(level model.RiskLevel) bool {
	return level == model.RiskLevelLow || level == model.RiskLevelMedium || level == model.RiskLevelHigh || level == model.RiskLevelCritical
}
