package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

const usageAuditBodyLimit = 512 * 1024

type usageAuditWriter struct {
	gin.ResponseWriter
	body       bytes.Buffer
	auditError string
}

func (writer *usageAuditWriter) SetUsageAuditError(value string) {
	writer.auditError = strings.TrimSpace(value)
}

func (writer *usageAuditWriter) Write(data []byte) (int, error) {
	if writer.body.Len() < usageAuditBodyLimit {
		remaining := usageAuditBodyLimit - writer.body.Len()
		writer.body.Write(data[:min(len(data), remaining)])
	}
	return writer.ResponseWriter.Write(data)
}

func (writer *usageAuditWriter) WriteString(value string) (int, error) {
	if writer.body.Len() < usageAuditBodyLimit {
		remaining := usageAuditBodyLimit - writer.body.Len()
		writer.body.WriteString(value[:min(len(value), remaining)])
	}
	return writer.ResponseWriter.WriteString(value)
}

// UsageAudit records meaningful state-changing API operations. High-volume AI,
// polling and client-log endpoints already have dedicated diagnostic logging.
func UsageAudit(c *gin.Context) {
	if !shouldAuditUsage(c.Request) {
		c.Next()
		return
	}

	startedAt := time.Now()
	requestBody := readUsageAuditBody(c.Request)
	writer := &usageAuditWriter{ResponseWriter: c.Writer}
	c.Writer = writer
	c.Next()

	responseBody := writer.body.String()
	statusCode := c.Writer.Status()
	success, errorMsg := usageAuditResponse(responseBody, statusCode)
	if !success && writer.auditError != "" {
		errorMsg = writer.auditError
	}
	user, _ := service.UserFromContext(c.Request.Context())
	if responseUser := usageAuditResponseUser(responseBody); user.ID == "" && responseUser.ID != "" {
		user = responseUser
	}
	if user.Username == "" {
		user.Username = usageAuditUsername(requestBody)
	}
	service.LogBusinessUsage(c.Request, user, requestBody, responseBody, statusCode, success, errorMsg, time.Since(startedAt).Milliseconds())
}

func shouldAuditUsage(r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return false
	}
	path := strings.ToLower(r.URL.Path)
	for _, prefix := range []string{
		"/api/v1/request-logs",
		"/api/v1/images/",
		"/api/v1/image-tasks/",
		"/api/v1/video",
		"/api/v1/chat/",
		"/api/v1/audio/",
		"/api/v1/generation-tasks",
		"/api/ws",
		"/api/seedance/ws",
	} {
		if strings.HasPrefix(path, prefix) {
			return false
		}
	}
	return true
}

func readUsageAuditBody(r *http.Request) string {
	if r.Body == nil {
		return ""
	}
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.Contains(contentType, "multipart/form-data") {
		return `{"content":"[multipart payload omitted]"}`
	}
	if r.ContentLength > usageAuditBodyLimit {
		return `{"content":"[request payload exceeds audit limit]"}`
	}
	if r.ContentLength < 0 {
		return `{"content":"[streaming request payload omitted]"}`
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, usageAuditBodyLimit+1))
	if err != nil {
		return `{"content":"[request payload read failed]"}`
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	if len(body) > usageAuditBodyLimit {
		return `{"content":"[request payload exceeds audit limit]"}`
	}
	return string(body)
}

func usageAuditResponse(body string, statusCode int) (bool, string) {
	success := statusCode < http.StatusBadRequest
	errorMsg := ""
	var envelope struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if json.Unmarshal([]byte(body), &envelope) == nil && envelope.Code != 0 {
		success = false
		errorMsg = envelope.Msg
	}
	if !success && errorMsg == "" {
		errorMsg = http.StatusText(statusCode)
	}
	return success, errorMsg
}

func usageAuditUsername(body string) string {
	var payload map[string]any
	if json.Unmarshal([]byte(body), &payload) != nil {
		return ""
	}
	for _, key := range []string{"username", "email"} {
		if value, ok := payload[key].(string); ok {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func usageAuditResponseUser(body string) model.AuthUser {
	var payload struct {
		Data struct {
			User model.AuthUser `json:"user"`
		} `json:"data"`
	}
	if json.Unmarshal([]byte(body), &payload) != nil {
		return model.AuthUser{}
	}
	return payload.Data.User
}
