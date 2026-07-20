package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func AIImageTaskStatus(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIImageTaskRequest(w, r, id, false)
}

func AIImageTaskContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIImageTaskRequest(w, r, id, true)
}

func proxyAIImageTaskRequest(w http.ResponseWriter, r *http.Request, id string, content bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	modelName := strings.TrimSpace(r.URL.Query().Get("model"))
	classification, err := service.GetModelClassificationByModelName(modelName)
	if err != nil || classification == nil || classification.ImageConfig == nil || classification.ImageConfig.AsyncTask == nil || !classification.ImageConfig.AsyncTask.Enabled {
		Fail(w, "图片任务配置不存在")
		return
	}
	task, ok := service.GetUserGenerationTask(user.ID, string(user.Role), id)
	if !ok || task.Type != model.GenerationTaskTypeImage || task.Model != modelName {
		service.RecordRequestRisk(r, user, "generation_task_access_denied", model.RiskLevelHigh, "access", "客户端尝试查询不属于自己的图片任务", map[string]any{"model": modelName})
		Fail(w, "图片任务不存在")
		return
	}
	channel, err := selectAIModelChannel(r, modelName)
	if err != nil {
		Fail(w, "调用失败，请联系管理员")
		return
	}
	config := classification.ImageConfig.AsyncTask
	endpoint := config.StatusEndpointPath
	method := strings.ToUpper(strings.TrimSpace(config.StatusMethod))
	if method != http.MethodPost {
		method = http.MethodGet
	}
	if content {
		endpoint = config.ContentEndpointPath
		method = http.MethodGet
	}
	if strings.TrimSpace(endpoint) == "" {
		Fail(w, "图片任务接口未配置")
		return
	}
	upstreamURL, err := configuredChannelEndpointURL(channel, strings.ReplaceAll(endpoint, "{taskId}", url.PathEscape(task.UpstreamTaskID)))
	if err != nil {
		Fail(w, "图片任务接口配置无效")
		return
	}
	var body []byte
	if method == http.MethodPost {
		body, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if len(bytes.TrimSpace(body)) == 0 {
			body, _ = json.Marshal(map[string]string{imageTaskIDRequestKey(config.TaskIDField): task.UpstreamTaskID})
		}
	}
	request, err := http.NewRequestWithContext(r.Context(), method, upstreamURL, bytes.NewReader(body))
	if err != nil {
		Fail(w, "调用失败，请联系管理员")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if method == http.MethodPost {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range channel.ExtraHeaders {
		request.Header.Set(key, value)
	}
	copyAIResponse(
		w,
		request,
		nil,
		user.ID,
		user.Username,
		modelName,
		endpoint,
		0,
		true,
		config,
		channel.BaseURL,
		canvasGenerationTaskContext{TaskID: task.ID, CreditChargeID: task.CreditChargeID},
	)
}

func configuredChannelEndpointURL(channel model.ModelChannel, endpoint string) (string, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", fmt.Errorf("empty endpoint")
	}
	if parsed, err := url.Parse(endpoint); err == nil && parsed.IsAbs() {
		return endpoint, nil
	}
	if !strings.HasPrefix(endpoint, "/") {
		return service.BuildModelChannelURL(channel, "/"+endpoint), nil
	}
	base, err := url.Parse(strings.TrimSpace(channel.BaseURL))
	if err != nil || base.Scheme == "" || base.Host == "" {
		return "", fmt.Errorf("invalid channel base URL")
	}
	configured, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	base.Path = configured.Path
	base.RawPath = configured.RawPath
	base.RawQuery = configured.RawQuery
	base.Fragment = ""
	return base.String(), nil
}

func imageTaskIDRequestKey(path string) string {
	parts := strings.FieldsFunc(path, func(r rune) bool { return r == '.' || r == '[' || r == ']' })
	for index := len(parts) - 1; index >= 0; index-- {
		if _, err := strconv.Atoi(parts[index]); err != nil && strings.TrimSpace(parts[index]) != "" {
			return parts[index]
		}
	}
	return "id"
}

func registerImageGenerationTask(userID, username, modelName, path string, responseBody []byte, task canvasGenerationTaskContext) {
	classification, err := service.GetModelClassificationByModelName(modelName)
	if err != nil || classification == nil || classification.ImageConfig == nil || classification.ImageConfig.AsyncTask == nil || !classification.ImageConfig.AsyncTask.Enabled {
		return
	}
	var raw map[string]any
	if json.Unmarshal(responseBody, &raw) != nil {
		return
	}
	upstreamTaskID := stringValueAtPath(raw, classification.ImageConfig.AsyncTask.TaskIDField)
	if upstreamTaskID == "" {
		return
	}
	if _, exists := service.GetGenerationTask(upstreamTaskID); exists {
		return
	}
	service.CreateGenerationTask(service.GenerationTaskCreate{
		UpstreamTaskID: upstreamTaskID,
		Type:           model.GenerationTaskTypeImage,
		UserID:         userID,
		Username:       username,
		Model:          modelName,
		Path:           path,
		CanvasID:       task.CanvasID,
		NodeID:         task.NodeID,
		Persistent:     service.IsUserTasksEnabled(userID),
		CreditChargeID: task.CreditChargeID,
	})
}

func updateImageGenerationTaskFromResponse(userID, username, modelName, path string, responseBody []byte, config *model.ImageAsyncTaskConfig, task canvasGenerationTaskContext) {
	if config == nil || task.TaskID == "" {
		return
	}
	var raw map[string]any
	if json.Unmarshal(responseBody, &raw) != nil {
		return
	}
	status := strings.ToLower(strings.TrimSpace(stringValueAtPath(raw, config.StatusField)))
	if containsFold(config.FailedValues, status) {
		message := firstNonEmptyStringAtPath(raw, "error.message", "error", "message", "detail", "data.error.message", "data.error")
		if message == "" {
			message = "图片生成失败"
		}
		service.UpdateGenerationTask(task.TaskID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusFailed, ErrorMsg: message})
		if task.CreditChargeID != "" {
			_ = service.RefundCreditCharge(userID, task.CreditChargeID, modelName, path)
		}
		ws.DefaultHub.SendToUser(userID, map[string]any{"type": "generation-task-updated", "taskId": task.TaskID, "status": "failed", "error": message})
		go service.LogCall(userID, username, modelName, path, false, message, 0)
		return
	}
	imageSource := stringValueAtPath(raw, config.ImageURLPath)
	if imageSource == "" {
		return
	}
	if status != "" && !containsFold(config.SuccessValues, status) {
		return
	}
	service.UpdateGenerationTask(task.TaskID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusSucceeded, ResultImages: []string{imageSource}})
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "generation-task-updated", "taskId": task.TaskID, "status": "completed", "resultImages": []string{imageSource}})
	go service.LogCall(userID, username, modelName, path, true, "", 0)
}

func stringValueAtPath(raw map[string]any, path string) string {
	value := resolveDottedPathValue(raw, strings.TrimSpace(path))
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case []any:
		for _, item := range typed {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
	}
	return ""
}

func firstNonEmptyStringAtPath(raw map[string]any, paths ...string) string {
	for _, path := range paths {
		if value := stringValueAtPath(raw, path); value != "" {
			return value
		}
	}
	return ""
}

func containsFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), target) {
			return true
		}
	}
	return false
}
