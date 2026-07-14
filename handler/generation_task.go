package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func AdminGenerationTasks(w http.ResponseWriter, r *http.Request) {
	OK(w, service.ListGenerationTasks(parseQuery(r)))
}

func CreateImageGenerationTask(w http.ResponseWriter, r *http.Request) {
	createImageTask(w, r, "/images/generations")
}

func CreateImageEditTask(w http.ResponseWriter, r *http.Request) {
	createImageTask(w, r, "/images/edits")
}

func GetGenerationTask(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	task, ok := service.GetUserGenerationTask(user.ID, id)
	if !ok {
		Fail(w, "任务不存在")
		return
	}
	OK(w, task)
}

func createImageTask(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		Fail(w, "参数错误")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		Fail(w, "调用失败，请联系管理员")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		Fail(w, "调用失败，请联系管理员")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	finalBody, finalContentType := prepareAIRequestBody(body, contentType, modelName, channel)
	upstreamPath := resolveAIProxyPath(channel.BaseURL, modelName, path, channel.VideoConfig)
	upstreamURL := service.BuildModelChannelURL(channel, upstreamPath)
	task := service.CreateGenerationTask(service.GenerationTaskCreate{
		Type:     model.GenerationTaskTypeImage,
		UserID:   user.ID,
		Username: user.Username,
		Model:    modelName,
		Path:     path,
		CanvasID: r.URL.Query().Get("canvasId"),
		NodeID:   r.URL.Query().Get("nodeId"),
	})

	chargedCredits := 0
	if !service.IsMembershipActive(user.MembershipExpiresAt) && !service.IsModelFreeForRole(string(user.Role), modelName) {
		if err := service.ConsumeUserCredits(user.ID, modelName, credits, path); err != nil {
			service.UpdateGenerationTask(task.ID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusFailed, ErrorMsg: err.Error()})
			FailError(w, err)
			return
		}
		chargedCredits = credits
		ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
	}

	go runImageGenerationTask(task.ID, user.ID, user.Username, modelName, path, upstreamURL, finalContentType, finalBody, channel.APIKey, channel.ExtraHeaders, chargedCredits)
	OK(w, task)
}

func prepareAIRequestBody(body []byte, contentType string, modelName string, channel model.ModelChannel) ([]byte, string) {
	finalBody := body
	finalContentType := contentType
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if jsonBody, err := multipartToJSON(body, contentType, channel.FieldMapping); err == nil {
			finalBody = jsonBody
			finalContentType = "application/json"
		}
	}
	if finalContentType == "application/json" {
		finalBody = applyRequestFields(finalBody, modelName)
	}
	if channel.FieldMapping != nil && (channel.FieldMapping.Image != "" || channel.FieldMapping.Images != "" || channel.FieldMapping.ReferenceVideos != "" || channel.FieldMapping.ReferenceAudios != "") {
		if transformed, err := applyFieldMappingToJSON(finalBody, channel.FieldMapping); err == nil {
			finalBody = transformed
		}
	}
	if channel.ImageFormat == "url" && finalContentType == "application/json" {
		finalBody = convertBase64ImagesToURLs(finalBody)
	}
	if len(channel.ExtraBody) > 0 && finalContentType == "application/json" {
		var bodyMap map[string]any
		if err := json.Unmarshal(finalBody, &bodyMap); err == nil {
			for k, v := range channel.ExtraBody {
				bodyMap[k] = v
			}
			if merged, err := json.Marshal(bodyMap); err == nil {
				finalBody = merged
			}
		}
	}
	return finalBody, finalContentType
}

func runImageGenerationTask(taskID, userID, username, modelName, path, upstreamURL, contentType string, body []byte, apiKey string, extraHeaders map[string]string, credits int) {
	request, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		finishImageTaskFailed(taskID, userID, modelName, path, credits, err.Error())
		return
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	for k, v := range extraHeaders {
		request.Header.Set(k, v)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		finishImageTaskFailed(taskID, userID, modelName, path, credits, err.Error())
		go service.LogCall(userID, username, modelName, path, false, err.Error(), credits)
		return
	}
	defer response.Body.Close()
	respBody, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		errorMsg := aiUpstreamErrorDetail(respBody)
		if errorMsg == "" {
			errorMsg = "图片生成失败"
		}
		finishImageTaskFailed(taskID, userID, modelName, path, credits, errorMsg)
		go service.LogCall(userID, username, modelName, path, false, string(respBody), credits)
		return
	}
	images, err := extractImageTaskResults(respBody)
	if err != nil {
		finishImageTaskFailed(taskID, userID, modelName, path, credits, err.Error())
		go service.LogCall(userID, username, modelName, path, false, err.Error(), credits)
		return
	}
	service.UpdateGenerationTask(taskID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusSucceeded, Progress: intPtr(100), ResultImages: images})
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "generation-task-updated", "taskId": taskID, "status": "completed", "resultImages": images})
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
	go service.LogCall(userID, username, modelName, path, true, "", credits)
}

func finishImageTaskFailed(taskID, userID, modelName, path string, credits int, errorMsg string) {
	service.UpdateGenerationTask(taskID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusFailed, ErrorMsg: errorMsg})
	if credits > 0 {
		if err := service.RefundUserCredits(userID, modelName, credits, path); err != nil {
			log.Printf("image task refund failed: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
		}
	}
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "generation-task-updated", "taskId": taskID, "status": "failed", "error": errorMsg})
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
}

func extractImageTaskResults(body []byte) ([]string, error) {
	var payload struct {
		Code *int   `json:"code"`
		Msg  string `json:"msg"`
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.Code != nil && *payload.Code != 0 {
		if payload.Msg != "" {
			return nil, &aiError{message: payload.Msg}
		}
		return nil, &aiError{message: "图片生成失败"}
	}
	if payload.Error != nil && payload.Error.Message != "" {
		return nil, &aiError{message: payload.Error.Message}
	}
	images := make([]string, 0, len(payload.Data))
	for _, item := range payload.Data {
		if item.B64JSON != "" {
			images = append(images, "data:image/png;base64,"+item.B64JSON)
		} else if item.URL != "" {
			images = append(images, item.URL)
		}
	}
	if len(images) == 0 {
		return nil, &aiError{message: "接口没有返回图片"}
	}
	return images, nil
}

func intPtr(value int) *int {
	return &value
}
