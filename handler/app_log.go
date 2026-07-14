package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

// AppRequestLogInput App 端提交的请求日志
type AppRequestLogInput struct {
	Model          string `json:"model"`
	Method         string `json:"method"`
	Path           string `json:"path"`
	URL            string `json:"url"`
	RequestHeaders string `json:"requestHeaders"`
	RequestBody    string `json:"requestBody"`
	ResponseBody   string `json:"responseBody"`
	StatusCode     int    `json:"statusCode"`
	Success        bool   `json:"success"`
	ErrorMsg       string `json:"errorMsg"`
	ElapsedMs      int64  `json:"elapsedMs"`
}

// SubmitAppRequestLog App 端提交请求日志
func SubmitAppRequestLog(w http.ResponseWriter, r *http.Request) {
	log.Printf("[SubmitAppRequestLog] received request")
	var input AppRequestLogInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		Fail(w, "参数错误")
		return
	}

	log.Printf("[SubmitAppRequestLog] model=%s user=%s success=%v", input.Model, "unknown", input.Success)

	user, _ := service.UserFromContext(r.Context())

	logID := service.LogAppRequest(
		user.ID, user.Username,
		input.Model, input.Method, input.Path, input.URL,
		input.RequestHeaders, input.RequestBody, input.ResponseBody,
		input.StatusCode, input.Success, input.ErrorMsg,
		input.ElapsedMs,
	)

	OK(w, map[string]string{"id": logID})
}
