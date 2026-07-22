package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func AIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/generations")
}

func AIImagesEdits(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/edits")
}

func AIChatCompletions(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/chat/completions")
}

func AIAudioSpeech(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/audio/speech")
}

func AIVideos(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/videos")
}

func AIVideo(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id)
}

func AIVideoContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id+"/content")
}

const canvasProviderHeader = "X-Canvas-Provider-ID"

// multipartJSONFieldTypesField carries type information that FormData cannot
// represent. It is consumed by the proxy and never forwarded upstream.
const multipartJSONFieldTypesField = "__julong_json_field_types"

func selectAIModelChannel(r *http.Request, modelName string) (model.ModelChannel, error) {
	providerID := strings.TrimSpace(r.Header.Get(canvasProviderHeader))
	channel, err := service.SelectModelChannelByProviderID(modelName, providerID)
	if err == nil || providerID == "" {
		return channel, err
	}
	user, _ := service.UserFromContext(r.Context())
	service.RecordRequestRisk(
		r,
		user,
		"provider_route_invalid",
		model.RiskLevelHigh,
		"access",
		"客户端请求了无效或无权使用的服务端模型渠道",
		map[string]any{"providerId": providerID, "model": modelName},
	)
	return model.ModelChannel{}, err
}

func aiRequestLogDetails(r *http.Request, channel model.ModelChannel, taskID string) service.RequestLogDetails {
	return service.RequestLogDetails{
		Request:     r,
		ChannelName: channel.Name,
		ProviderID:  strings.TrimSpace(r.Header.Get(canvasProviderHeader)),
		TaskID:      taskID,
	}
}

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	isContent := strings.HasSuffix(path, "/content")
	isPolling := strings.Contains(path, "/videos/") && !isContent
	isTaskRequest := isPolling || isContent
	user, _ := service.UserFromContext(r.Context())
	var generationTask canvasGenerationTaskContext
	if isTaskRequest && user.ID != "" {
		requestedTaskID := strings.TrimSuffix(strings.TrimPrefix(path, "/videos/"), "/content")
		if task, ok := service.GetUserGenerationTask(user.ID, string(user.Role), requestedTaskID); ok {
			modelName = task.Model
			generationTask = canvasGenerationTaskContext{TaskID: task.ID, CanvasID: task.CanvasID, NodeID: task.NodeID, CreditChargeID: task.CreditChargeID}
			switch {
			case task.Status == model.GenerationTaskStatusFailed:
				OK(w, map[string]any{"id": task.ID, "status": "failed", "error": map[string]any{"message": task.ErrorMsg}})
				return
			case isPolling && task.Status == model.GenerationTaskStatusSucceeded && task.ResultURL != "":
				OK(w, map[string]any{"id": task.ID, "status": "completed", "url": task.ResultURL})
				return
			case task.UpstreamTaskID == "":
				OK(w, map[string]any{"id": task.ID, "status": "running", "progress": task.Progress})
				return
			default:
				path = "/videos/" + task.UpstreamTaskID
				if isContent {
					path += "/content"
				}
			}
		}
	}
	channel, err := selectAIModelChannel(r, modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		if !isPolling {
			go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		}
		Fail(w, "调用失败，请联系管理员")
		return
	}
	requestMethod := http.MethodGet
	var requestBody []byte
	upstreamURL := ""
	if channel.VideoConfig != nil {
		isContent := strings.HasSuffix(path, "/content")
		upstreamTaskID := strings.TrimSuffix(strings.TrimPrefix(path, "/videos/"), "/content")
		configuredEndpoint := ""
		if isContent {
			configuredEndpoint = channel.VideoConfig.ContentEndpointPath
		} else if isPolling {
			configuredEndpoint = channel.VideoConfig.StatusEndpointPath
			if strings.EqualFold(strings.TrimSpace(channel.VideoConfig.StatusMethod), http.MethodPost) {
				requestMethod = http.MethodPost
				requestBody, _ = json.Marshal(map[string]string{imageTaskIDRequestKey(channel.VideoConfig.TaskIDField): upstreamTaskID})
			}
		}
		if strings.TrimSpace(configuredEndpoint) != "" {
			path = strings.ReplaceAll(configuredEndpoint, "{taskId}", url.PathEscape(upstreamTaskID))
			upstreamURL, err = configuredChannelEndpointURL(channel, path)
			if err != nil {
				Fail(w, "调用失败，请联系管理员")
				return
			}
		}
	}
	if upstreamURL == "" {
		path = resolveAIProxyPath(channel.BaseURL, modelName, path, channel.VideoConfig)
		upstreamURL = service.BuildModelChannelURL(channel, path)
	}

	// 记录请求日志
	reqHeaders := map[string]string{
		"Authorization": "Bearer " + channel.APIKey[:min(len(channel.APIKey), 8)] + "***",
	}
	for k, v := range channel.ExtraHeaders {
		reqHeaders[k] = v
	}
	LogChannelRequest(channel.BaseURL, modelName, requestMethod, upstreamURL, reqHeaders, safeLogBody(requestBody), len(requestBody))

	// 持久化请求日志（轮询去重）
	var logID string
	shouldLog := service.ShouldLogPollingRequest(path, isPolling)
	if shouldLog {
		logID = service.LogRequestDetailed(user.ID, user.Username, modelName, requestMethod, path, upstreamURL, reqHeaders, string(requestBody), len(requestBody), "", aiRequestLogDetails(r, channel, generationTask.TaskID))
	}

	request, err := http.NewRequest(requestMethod, upstreamURL, bytes.NewReader(requestBody))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", upstreamURL, err)
		if logID != "" {
			service.LogRequestResponse(logID, "", 0, false, err.Error())
		}
		if !isPolling {
			go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		}
		Fail(w, "调用失败，请联系管理员")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if requestMethod == http.MethodPost {
		request.Header.Set("Content-Type", "application/json")
	}
	// 应用渠道 ExtraHeaders
	for k, v := range channel.ExtraHeaders {
		request.Header.Set(k, v)
	}
	extraArgs := []any{isPolling, channel.VideoConfig, channel.BaseURL, requestUpstreamURL(upstreamURL), requestHeadersMap(reqHeaders), requestLogSource(service.ClientMetadataFromRequest(r).ClientType)}
	if logID != "" {
		extraArgs = append(extraArgs, requestLogID(logID))
	}
	if isPolling {
		if generationTask.TaskID == "" {
			generationTask = canvasGenerationTaskContext{
				TaskID:   strings.TrimPrefix(path, "/videos/"),
				CanvasID: r.URL.Query().Get("canvasId"),
				NodeID:   r.URL.Query().Get("nodeId"),
			}
		}
		extraArgs = append(extraArgs, generationTask)
	}
	copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, 0, extraArgs...)
}

func CreateVideoGenerationTask(w http.ResponseWriter, r *http.Request) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("video task request read failed: %v", err)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	channel, err := selectAIModelChannel(r, modelName)
	if err != nil {
		log.Printf("video task select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	credits, err := service.CalculateModelCredits(modelName, 1, readAIRequestVideoSeconds(body, contentType), "video")
	if err != nil {
		log.Printf("video task read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "调用失败，请联系管理员")
		return
	}

	finalBody, finalContentType := prepareVideoTaskRequestBody(body, contentType, modelName, channel)
	upstreamPath := resolveAIProxyPath(channel.BaseURL, modelName, "/videos", channel.VideoConfig)
	upstreamURL := service.BuildModelChannelURL(channel, upstreamPath)
	task := service.CreateGenerationTask(service.GenerationTaskCreate{
		Type:       model.GenerationTaskTypeVideo,
		UserID:     user.ID,
		Username:   user.Username,
		Model:      modelName,
		Prompt:     generationTaskPrompt(finalBody),
		Path:       "/videos",
		CanvasID:   r.URL.Query().Get("canvasId"),
		NodeID:     r.URL.Query().Get("nodeId"),
		Persistent: service.IsRoleTasksEnabled(string(user.Role)),
	})
	reqHeaders := map[string]string{"Authorization": "Bearer " + channel.APIKey[:min(len(channel.APIKey), 8)] + "***"}
	if finalContentType != "" {
		reqHeaders["Content-Type"] = finalContentType
	}
	for key, value := range channel.ExtraHeaders {
		reqHeaders[key] = value
	}
	logID := service.LogRequestDetailed(user.ID, user.Username, modelName, http.MethodPost, upstreamPath, upstreamURL, reqHeaders, string(finalBody), len(finalBody), extractMediaFromJSON(finalBody), aiRequestLogDetails(r, channel, task.ID))

	chargedCredits := 0
	if service.IsMembershipActive(user.MembershipExpiresAt) {
		service.LogMembershipFreeUsage(user.ID, modelName, credits, "/videos")
		service.UpdateRequestLogFreeBilling(logID, "membership_free")
	} else if service.IsModelFreeForRole(string(user.Role), modelName) {
		service.LogRoleFreeUsage(user.ID, string(user.Role), modelName, credits, "/videos")
		service.UpdateRequestLogFreeBilling(logID, "role_free")
	} else {
		charge, chargeErr := service.ChargeUserCredits(user.ID, modelName, credits, "/videos")
		if chargeErr != nil {
			service.UpdateGenerationTask(task.ID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusFailed, ErrorMsg: chargeErr.Error()})
			service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Success: false, ErrorMsg: chargeErr.Error(), ErrorStage: "billing"})
			FailError(w, chargeErr)
			return
		}
		service.UpdateGenerationTask(task.ID, service.GenerationTaskUpdate{CreditChargeID: charge.ID})
		service.UpdateRequestLogBilling(logID, charge)
		chargedCredits = credits
		ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
	}

	go runVideoGenerationTaskCreate(task.ID, logID, user.ID, user.Username, modelName, upstreamPath, upstreamURL, finalContentType, finalBody, channel.APIKey, channel.ExtraHeaders, channel.BaseURL, channel.VideoConfig, chargedCredits)
	OK(w, map[string]any{"id": task.ID, "status": "running"})
}

func proxyAIRequest(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		go service.LogCall("", "", modelName, path, false, err.Error(), 0)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		go service.LogCall("", "", modelName, path, false, "未登录或权限不足", 0)
		Fail(w, "未登录或权限不足")
		return
	}
	channel, err := selectAIModelChannel(r, modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	mediaType := "request"
	if isVideoPath(path, channel.VideoConfig) {
		mediaType = "video"
	}
	credits, err := service.CalculateModelCredits(modelName, readAIRequestCount(body, contentType), readAIRequestVideoSeconds(body, contentType), mediaType)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		Fail(w, "调用失败，请联系管理员")
		return
	}

	// 合并渠道 ExtraBody 到请求体
	finalBody := body
	// multipart/form-data 转 JSON（前端 FormData 发送，上游期望 JSON 时自动转换）
	log.Printf("[PROXY] path=%s contentType=%s bodyLen=%d", path, contentType, len(body))
	if strings.HasPrefix(contentType, "multipart/form-data") {
		fm := channel.FieldMapping
		jsonBody, err := multipartToJSON(body, contentType, fm)
		if err != nil {
			log.Printf("[MULTIPART] conversion FAILED: %v", err)
		} else {
			log.Printf("[MULTIPART] OK fieldMapping=%+v convertedLen=%d preview=%s", fm, len(jsonBody), string(jsonBody[:min(len(jsonBody), 500)]))
			finalBody = jsonBody
			contentType = "application/json"
		}
	}
	// 应用模型级别的字段映射（优先于渠道级）
	if contentType == "application/json" {
		finalBody = applyRequestFields(finalBody, modelName)
	}
	// 应用字段映射到 JSON 请求体（仅在用户明确配置了字段映射时才启用）
	if channel.FieldMapping != nil && (channel.FieldMapping.Image != "" || channel.FieldMapping.Images != "" || channel.FieldMapping.ReferenceVideos != "" || channel.FieldMapping.ReferenceAudios != "") {
		if transformed, err := applyFieldMappingToJSON(finalBody, channel.FieldMapping); err == nil {
			finalBody = transformed
		}
	}
	// 将 JSON 中的 base64 图片转换为公网 URL（仅当渠道配置了 url 格式时）
	if channel.ImageFormat == "url" && contentType == "application/json" {
		finalBody = convertBase64ImagesToURLs(finalBody)
	}
	if len(channel.ExtraBody) > 0 && contentType == "application/json" {
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
	if contentType == "application/json" {
		finalBody = normalizeStandardAIRequestTypes(finalBody)
	}

	// 渠道配置了 OpenAI 兼容视频请求格式时，转换 Ark 请求体
	if channel.VideoConfig != nil && channel.VideoConfig.RequestFormat == "openai" && isVideoPath(path, channel.VideoConfig) {
		if converted, err := convertArkToOpenAIVideoRequest(finalBody); err == nil {
			finalBody = converted
		} else {
			log.Printf("AI proxy convert video request failed: %v", err)
		}
	}
	log.Printf("[PROXY] finalBodyLen=%d preview=%s", len(finalBody), string(finalBody[:min(len(finalBody), 500)]))

	path = resolveAIProxyPath(channel.BaseURL, modelName, path, channel.VideoConfig)
	upstreamURL := ""
	if strings.TrimSpace(channel.EndpointPath) != "" && (path == "/images/generations" || path == "/chat/completions" || path == "/audio/speech") {
		upstreamURL, err = configuredChannelEndpointURL(channel, channel.EndpointPath)
		if err != nil {
			log.Printf("AI proxy configured endpoint invalid: model=%s err=%v", modelName, err)
			Fail(w, "调用失败，请联系管理员")
			return
		}
		path = channel.EndpointPath
	}
	if upstreamURL == "" {
		upstreamURL = service.BuildModelChannelURL(channel, path)
	}

	// 记录请求日志
	reqHeaders := map[string]string{
		"Authorization": "Bearer " + channel.APIKey[:min(len(channel.APIKey), 8)] + "***",
	}
	if contentType != "" {
		reqHeaders["Content-Type"] = contentType
	}
	for k, v := range channel.ExtraHeaders {
		reqHeaders[k] = v
	}
	LogChannelRequest(channel.BaseURL, modelName, http.MethodPost, upstreamURL, reqHeaders, safeLogBody(finalBody), len(finalBody))

	// 持久化请求日志
	logID := service.LogRequestDetailed(user.ID, user.Username, modelName, http.MethodPost, path, upstreamURL, reqHeaders, string(finalBody), len(finalBody), extractMediaFromJSON(finalBody), aiRequestLogDetails(r, channel, ""))

	log.Printf("AI proxy upstream: url=%s method=POST content_type=%s body_size=%d", upstreamURL, contentType, len(finalBody))
	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, upstreamURL, bytes.NewReader(finalBody))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", upstreamURL, err)
		service.LogRequestResponse(logID, "", 0, false, err.Error())
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), credits)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if accept := strings.TrimSpace(r.Header.Get("Accept")); accept != "" {
		request.Header.Set("Accept", accept)
	}
	// 应用渠道 ExtraHeaders
	for k, v := range channel.ExtraHeaders {
		request.Header.Set(k, v)
	}
	extraArgs := []any{channel.VideoConfig, channel.BaseURL, requestLogID(logID), requestLogSource(service.ClientMetadataFromRequest(r).ClientType)}
	extraArgs = append(extraArgs, canvasGenerationTaskContext{
		CanvasID: r.URL.Query().Get("canvasId"),
		NodeID:   r.URL.Query().Get("nodeId"),
	})
	// 会员有效期内免扣算力点。
	if service.IsMembershipActive(user.MembershipExpiresAt) {
		service.LogMembershipFreeUsage(user.ID, modelName, credits, path)
		service.UpdateRequestLogFreeBilling(logID, "membership_free")
		copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, credits, extraArgs...)
		return
	}
	if service.IsModelFreeForRole(string(user.Role), modelName) {
		service.LogRoleFreeUsage(user.ID, string(user.Role), modelName, credits, path)
		service.UpdateRequestLogFreeBilling(logID, "role_free")
		copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, credits, extraArgs...)
		return
	}
	charge, chargeErr := service.ChargeUserCredits(user.ID, modelName, credits, path)
	if chargeErr != nil {
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Success: false, ErrorMsg: chargeErr.Error(), ErrorStage: "billing"})
		go service.LogCall(user.ID, user.Username, modelName, path, false, chargeErr.Error(), credits)
		FailError(w, chargeErr)
		return
	}
	service.UpdateRequestLogBilling(logID, charge)
	extraArgs = append(extraArgs, canvasGenerationTaskContext{CreditChargeID: charge.ID})
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
	copyAIResponse(w, request, func() {
		if err := service.RefundCreditCharge(user.ID, charge.ID, modelName, path); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	}, user.ID, user.Username, modelName, path, credits, extraArgs...)
}

func prepareVideoTaskRequestBody(body []byte, contentType string, modelName string, channel model.ModelChannel) ([]byte, string) {
	finalBody, finalContentType := prepareAIRequestBody(body, contentType, modelName, channel)
	if channel.VideoConfig != nil && channel.VideoConfig.RequestFormat == "openai" {
		if converted, err := convertArkToOpenAIVideoRequest(finalBody); err == nil {
			finalBody = converted
		} else {
			log.Printf("video task convert request failed: %v", err)
		}
	}
	return finalBody, finalContentType
}

func runVideoGenerationTaskCreate(taskID, logID, userID, username, modelName, path, upstreamURL, contentType string, body []byte, apiKey string, extraHeaders map[string]string, baseURL string, videoConfig *model.ChannelVideoConfig, credits int) {
	startedAt := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), aiProxyRequestTimeout("/videos", videoConfig, false))
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Success: false, ErrorMsg: err.Error(), ErrorStage: "request_build", ElapsedMs: time.Since(startedAt).Milliseconds()})
		finishVideoTaskFailed(taskID, userID, modelName, path, credits, err.Error())
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
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Success: false, ErrorMsg: err.Error(), ErrorStage: "network", ElapsedMs: time.Since(startedAt).Milliseconds()})
		finishVideoTaskFailed(taskID, userID, modelName, path, credits, err.Error())
		go service.LogCall(userID, username, modelName, path, false, err.Error(), credits)
		return
	}
	defer response.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	respText := string(respBody)
	if response.StatusCode >= http.StatusBadRequest {
		errorMsg := aiUpstreamErrorDetail(respBody)
		if errorMsg == "" {
			errorMsg = "视频任务创建失败"
		}
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: false, ErrorMsg: errorMsg, ErrorStage: "upstream", ElapsedMs: time.Since(startedAt).Milliseconds()})
		finishVideoTaskFailed(taskID, userID, modelName, path, credits, errorMsg)
		go service.LogCall(userID, username, modelName, path, false, respText, credits)
		return
	}
	if videoConfig != nil && videoConfig.ResponseFormat == "openai" {
		if converted, err := convertOpenAIToArkVideoResponse(respBody, videoConfig); err == nil {
			respBody = converted
			respText = string(converted)
		} else {
			log.Printf("video task convert response failed: %v", err)
		}
	}
	if baseURL != "" {
		LogChannelResponse(baseURL, respText, response.StatusCode, "")
	}
	service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: true, ElapsedMs: time.Since(startedAt).Milliseconds(), GeneratedCount: 0})
	var raw map[string]any
	if err := json.Unmarshal(respBody, &raw); err != nil {
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: false, ErrorMsg: err.Error(), ErrorStage: "response_parse", ElapsedMs: time.Since(startedAt).Milliseconds()})
		finishVideoTaskFailed(taskID, userID, modelName, path, credits, err.Error())
		return
	}
	upstreamTaskID := extractFieldPath(raw, "", "id", "task_id", "data.id", "data.task_id")
	if upstreamTaskID == "" {
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: false, ErrorMsg: "视频接口没有返回任务 ID", ErrorStage: "response_parse", ElapsedMs: time.Since(startedAt).Milliseconds()})
		finishVideoTaskFailed(taskID, userID, modelName, path, credits, "视频接口没有返回任务 ID")
		return
	}
	update := service.GenerationTaskUpdate{Status: model.GenerationTaskStatusRunning, UpstreamTaskID: upstreamTaskID}
	if progress := extractProgressNumber(raw); progress >= 0 {
		update.Progress = &progress
	}
	videoURLPaths := []string{"content.video_url", "result.video_url", "result.url", "data.video_url", "data.video_urls", "url", "video_url", "video.url"}
	if videoConfig != nil && len(videoConfig.VideoURLPaths) > 0 {
		videoURLPaths = append(videoConfig.VideoURLPaths, videoURLPaths...)
	}
	taskDone := isVideoTaskDone(respText) || isVideoTaskCompleted(respText)
	taskFailed := isVideoTaskFailed(respText)
	if taskDone {
		update.Status = model.GenerationTaskStatusSucceeded
	}
	if taskFailed {
		update.Status = model.GenerationTaskStatusFailed
	}
	if resultURL := extractVideoURL(raw, videoURLPaths...); resultURL != "" {
		update.ResultURL = resultURL
	}
	if errorMsg := extractFieldPath(raw, "", "error.message", "data.error.message", "data.error", "data.error_message", "data.fail_reason", "fail_reason", "message"); errorMsg != "" {
		update.ErrorMsg = errorMsg
	}
	service.UpdateGenerationTask(taskID, update)
	emitVideoGenerationTaskUpdate(userID, canvasGenerationTaskContext{TaskID: taskID}, respText, taskDone, taskFailed, videoConfig)
	if taskFailed && credits > 0 {
		task, _ := service.GetGenerationTask(taskID)
		if err := service.RefundCreditCharge(userID, task.CreditChargeID, modelName, path); err != nil {
			log.Printf("video task refund failed: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
		}
		ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
	}
	if taskDone || taskFailed {
		go service.LogCall(userID, username, modelName, path, !taskFailed, respText, credits)
	}
}

func finishVideoTaskFailed(taskID, userID, modelName, path string, credits int, errorMsg string) {
	service.UpdateGenerationTask(taskID, service.GenerationTaskUpdate{Status: model.GenerationTaskStatusFailed, ErrorMsg: errorMsg})
	if credits > 0 {
		task, _ := service.GetGenerationTask(taskID)
		if err := service.RefundCreditCharge(userID, task.CreditChargeID, modelName, path); err != nil {
			log.Printf("video task refund failed: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
		}
	}
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "generation-task-updated", "taskId": taskID, "status": "failed", "error": errorMsg})
	ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
}

// requestLogID 用于在 extraArgs 中传递请求日志 ID
type requestLogID string

// requestUpstreamURL 用于在 extraArgs 中传递上游 URL
type requestUpstreamURL string

// requestHeadersMap 用于在 extraArgs 中传递请求头
type requestHeadersMap map[string]string

type requestLogSource string

type canvasGenerationTaskContext struct {
	TaskID         string
	CanvasID       string
	NodeID         string
	CreditChargeID string
}

const (
	aiStreamHeartbeatInterval = 15 * time.Second
	aiStreamLogLimit          = 2 * 1024 * 1024
)

type aiStreamRead struct {
	data []byte
	err  error
}

func shouldProxyAIStream(path string, request *http.Request, response *http.Response) bool {
	if !strings.Contains(strings.ToLower(path), "chat/completions") {
		return false
	}
	return strings.Contains(strings.ToLower(request.Header.Get("Accept")), "text/event-stream") ||
		strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream")
}

func appendAIStreamLog(captured *bytes.Buffer, chunk []byte) bool {
	remaining := aiStreamLogLimit - captured.Len()
	if remaining <= 0 {
		return true
	}
	if len(chunk) > remaining {
		_, _ = captured.Write(chunk[:remaining])
		return true
	}
	_, _ = captured.Write(chunk)
	return false
}

func proxyAIStreamResponse(w http.ResponseWriter, response *http.Response) ([]byte, bool, error) {
	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(response.StatusCode)
	flusher, _ := w.(http.Flusher)
	if flusher != nil {
		flusher.Flush()
	}

	reads := make(chan aiStreamRead, 1)
	ctx := response.Request.Context()
	go func() {
		buffer := make([]byte, 32*1024)
		for {
			n, err := response.Body.Read(buffer)
			item := aiStreamRead{err: err}
			if n > 0 {
				item.data = append([]byte(nil), buffer[:n]...)
			}
			select {
			case reads <- item:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	ticker := time.NewTicker(aiStreamHeartbeatInterval)
	defer ticker.Stop()
	var captured bytes.Buffer
	truncated := false
	for {
		select {
		case <-ctx.Done():
			return captured.Bytes(), truncated, ctx.Err()
		case <-ticker.C:
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return captured.Bytes(), truncated, err
			}
			if flusher != nil {
				flusher.Flush()
			}
		case item := <-reads:
			if len(item.data) > 0 {
				if appendAIStreamLog(&captured, item.data) {
					truncated = true
				}
				if _, err := w.Write(item.data); err != nil {
					return captured.Bytes(), truncated, err
				}
				if flusher != nil {
					flusher.Flush()
				}
			}
			if item.err == io.EOF {
				return captured.Bytes(), truncated, nil
			}
			if item.err != nil {
				return captured.Bytes(), truncated, item.err
			}
		}
	}
}

func aiStreamResponseIndicatesFailure(body []byte) (bool, string) {
	if failed, message := aiResponseIndicatesFailure(body); failed {
		return true, message
	}
	for _, line := range bytes.Split(body, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if bytes.Equal(payload, []byte("[DONE]")) {
			continue
		}
		if failed, message := aiResponseIndicatesFailure(payload); failed {
			return true, message
		}
	}
	return false, ""
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func(), userID, username, modelName, path string, credits int, extraArgs ...any) {
	var isPolling bool
	var videoConfig *model.ChannelVideoConfig
	var imageAsyncConfig *model.ImageAsyncTaskConfig
	var baseURL string
	var logID string
	var logUpstreamURL string
	var logReqHeaders map[string]string
	var generationTask canvasGenerationTaskContext
	startedAt := time.Now()
	logSource := "web"
	for _, arg := range extraArgs {
		switch v := arg.(type) {
		case bool:
			isPolling = v
		case *model.ChannelVideoConfig:
			videoConfig = v
		case *model.ImageAsyncTaskConfig:
			imageAsyncConfig = v
		case string:
			if baseURL == "" {
				baseURL = v
			}
		case requestLogID:
			logID = string(v)
		case requestUpstreamURL:
			logUpstreamURL = string(v)
		case requestHeadersMap:
			logReqHeaders = v
		case requestLogSource:
			logSource = string(v)
		case canvasGenerationTaskContext:
			if v.TaskID != "" {
				generationTask.TaskID = v.TaskID
			}
			if v.CanvasID != "" {
				generationTask.CanvasID = v.CanvasID
			}
			if v.NodeID != "" {
				generationTask.NodeID = v.NodeID
			}
			if v.CreditChargeID != "" {
				generationTask.CreditChargeID = v.CreditChargeID
			}
		}
	}
	if timeout := aiProxyRequestTimeout(path, videoConfig, isPolling); timeout > 0 {
		ctx, cancel := context.WithTimeout(request.Context(), timeout)
		defer cancel()
		request = request.WithContext(ctx)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if baseURL != "" {
			LogChannelResponse(baseURL, "", 0, err.Error())
		}
		if logID != "" {
			service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Success: false, ErrorMsg: err.Error(), ErrorStage: "network", ElapsedMs: time.Since(startedAt).Milliseconds()})
		}
		if onFailure != nil {
			onFailure()
		}
		if !isPolling {
			go service.LogCall(userID, username, modelName, path, false, err.Error(), credits)
		}
		Fail(w, "调用失败，请联系管理员")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
		log.Printf("AI upstream error: url=%s status=%d", request.URL.String(), response.StatusCode)
		if baseURL != "" {
			LogChannelResponse(baseURL, string(body), response.StatusCode, "")
		}
		if logID != "" {
			service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: string(body), Headers: response.Header, StatusCode: response.StatusCode, Success: false, ErrorMsg: aiUpstreamErrorDetail(body), ErrorStage: "upstream", ElapsedMs: time.Since(startedAt).Milliseconds()})
		}
		if onFailure != nil {
			onFailure()
		}
		// 视频请求只在轮询失败时记录日志，创建任务不记录
		isVideoPollError := strings.Contains(path, "/videos/task_")
		if !isPolling && !isVideoPollError {
			go service.LogCall(userID, username, modelName, path, false, string(body), credits)
		}
		Fail(w, "调用失败，请联系管理员")
		return
	}

	if shouldProxyAIStream(path, request, response) {
		respBody, truncated, streamErr := proxyAIStreamResponse(w, response)
		respText := string(respBody)
		if truncated {
			respText += "\n...[stream log truncated]"
		}
		responseSucceeded := streamErr == nil
		responseError := ""
		if streamErr != nil {
			responseError = streamErr.Error()
		} else if failed, message := aiStreamResponseIndicatesFailure(respBody); failed {
			responseSucceeded = false
			responseError = message
		}
		if !responseSucceeded && onFailure != nil {
			onFailure()
		}
		if baseURL != "" {
			LogChannelResponse(baseURL, respText, response.StatusCode, responseError)
		}
		if logID != "" {
			service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: responseSucceeded, ErrorMsg: responseError, ErrorStage: "stream", ElapsedMs: time.Since(startedAt).Milliseconds(), GeneratedCount: -1})
		}
		if !isPolling {
			go service.LogCall(userID, username, modelName, path, responseSucceeded, responseError, credits)
		}
		return
	}

	// 视频请求：读取完整响应后记录日志（包含返回的视频数据）
	if isVideoPath(path, videoConfig) {
		respBody, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
		respText := string(respBody)
		log.Printf("[VIDEO] url=%s status=%d body=%s", request.URL.String(), response.StatusCode, respText)
		if baseURL != "" {
			LogChannelResponse(baseURL, respText, response.StatusCode, "")
		}
		isContentRequest := strings.HasSuffix(path, "/content")
		// 渠道配置了 OpenAI 兼容视频响应格式时，转换为 Ark 格式
		if videoConfig != nil && videoConfig.ResponseFormat == "openai" {
			if converted, err := convertOpenAIToArkVideoResponse(respBody, videoConfig); err == nil {
				respBody = converted
				respText = string(converted)
			} else {
				log.Printf("AI proxy convert video response failed: %v", err)
			}
		}
		// 内容请求始终记录；轮询请求仅在任务完成(SUCCESS/SUBMITTED)或失败(FAILURE)时记录
		taskDone := isVideoTaskDone(respText) || isVideoTaskCompleted(respText)
		taskFailed := isVideoTaskFailed(respText)
		if !isPolling && !isContentRequest {
			registerVideoGenerationTask(userID, username, modelName, path, respText, generationTask)
		}
		if isPolling && generationTask.TaskID != "" {
			emitVideoGenerationTaskUpdate(userID, generationTask, respText, taskDone, taskFailed, videoConfig)
		}
		if isContentRequest || (isPolling && taskDone) {
			go service.LogCall(userID, username, modelName, path, !taskFailed, respText, credits)
		}
		// 轮询中遇到 FAILURE 时退还算力点
		if isPolling && taskFailed && generationTask.CreditChargeID != "" {
			if err := service.RefundCreditCharge(userID, generationTask.CreditChargeID, modelName, path); err != nil {
				log.Printf("AI proxy refund credits on video failure: user=%s model=%s err=%v", userID, modelName, err)
			} else {
				log.Printf("AI proxy refunded failed video task: user=%s model=%s", userID, modelName)
				ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
			}
		}
		// 请求管理：轮询只记录一条最终结果日志（SUCCESS 或 FAILURE）
		if isPolling {
			if !taskDone && logID != "" {
				// 中间轮询（processing/IN_PROGRESS），删除已创建的日志
				service.BatchDeleteRequestLogs([]string{logID})
				logID = ""
			} else if taskDone && logID == "" {
				// 补录最终结果日志
				logID = service.LogRequestDetailed(userID, username, modelName, http.MethodGet, path, logUpstreamURL, logReqHeaders, "", 0, "", service.RequestLogDetails{Source: logSource, TaskID: generationTask.TaskID})
			}
		}
		if logID != "" {
			generatedCount := 0
			if taskDone && !taskFailed {
				generatedCount = 1
			}
			errorMsg := ""
			errorStage := ""
			if taskFailed {
				errorMsg = firstNonEmptyStringAtPath(rawJSONMap(respBody), "error.message", "error", "message", "detail")
				errorStage = "generation"
			}
			service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: respText, Headers: response.Header, StatusCode: response.StatusCode, Success: !taskFailed, ErrorMsg: errorMsg, ErrorStage: errorStage, ElapsedMs: time.Since(startedAt).Milliseconds(), GeneratedCount: generatedCount})
		}
		for key, values := range response.Header {
			if strings.EqualFold(key, "Content-Length") {
				continue
			}
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(respBody)
		return
	}

	// 非视频请求：读取完整响应（图片 b64_json 可能很大，不限制大小）
	respBody, _ := io.ReadAll(response.Body)
	responseSucceeded := true
	responseError := ""
	if failed, message := aiResponseIndicatesFailure(respBody); failed {
		responseSucceeded = false
		responseError = message
		if !isPolling && onFailure != nil {
			onFailure()
		}
	}
	if isPolling && imageAsyncConfig != nil && generationTask.TaskID != "" {
		updateImageGenerationTaskFromResponse(userID, username, modelName, path, respBody, imageAsyncConfig, generationTask)
	} else if responseSucceeded && !isPolling {
		registerImageGenerationTask(userID, username, modelName, path, respBody, generationTask)
	}
	if baseURL != "" {
		LogChannelResponse(baseURL, string(respBody), response.StatusCode, "")
	}
	if logID != "" {
		service.LogRequestResponseDetailed(logID, service.RequestLogResponse{Body: string(respBody), Headers: response.Header, StatusCode: response.StatusCode, Success: responseSucceeded, ErrorMsg: responseError, ElapsedMs: time.Since(startedAt).Milliseconds(), GeneratedCount: -1})
	}

	if !isPolling {
		go service.LogCall(userID, username, modelName, path, responseSucceeded, responseError, credits)
	}

	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(respBody)
}

func rawJSONMap(body []byte) map[string]any {
	var raw map[string]any
	_ = json.Unmarshal(body, &raw)
	return raw
}

func aiResponseIndicatesFailure(body []byte) (bool, string) {
	var raw map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return false, ""
	}
	if success, ok := raw["success"].(bool); ok && !success {
		return true, firstNonEmptyStringAtPath(raw, "error.message", "error", "message", "msg", "detail")
	}
	if code, exists := raw["code"]; exists && code != nil {
		normalized := strings.ToLower(strings.TrimSpace(fmt.Sprint(code)))
		if normalized != "" && normalized != "0" && normalized != "200" && normalized != "ok" && normalized != "success" && normalized != "succeeded" {
			return true, firstNonEmptyStringAtPath(raw, "error.message", "error", "message", "msg", "detail")
		}
	}
	if value, exists := raw["error"]; exists && value != nil {
		switch typed := value.(type) {
		case string:
			if strings.TrimSpace(typed) != "" {
				return true, safeUpstreamText(typed)
			}
		case map[string]any:
			if len(typed) > 0 {
				return true, firstNonEmptyStringAtPath(raw, "error.message", "error.code", "message", "msg", "detail")
			}
		}
	}
	status := strings.ToLower(strings.TrimSpace(firstNonEmptyStringAtPath(raw, "status", "data.status", "result.status")))
	for _, failedStatus := range []string{"failed", "failure", "error", "canceled", "cancelled"} {
		if status == failedStatus {
			return true, firstNonEmptyStringAtPath(raw, "error.message", "error", "message", "msg", "detail", "data.error")
		}
	}
	return false, ""
}

func aiProxyRequestTimeout(path string, videoConfig *model.ChannelVideoConfig, isPolling bool) time.Duration {
	if !isVideoPath(path, videoConfig) {
		return 0
	}
	if strings.HasSuffix(path, "/content") {
		return 2 * time.Minute
	}
	if isPolling {
		return 30 * time.Second
	}
	return 60 * time.Second
}

func readAIRequest(r *http.Request) ([]byte, string, string, error) {
	contentType := r.Header.Get("Content-Type")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", "", err
	}
	modelName := ""
	if strings.HasPrefix(contentType, "multipart/form-data") {
		modelName = readMultipartModel(body, contentType)
	} else {
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		modelName = payload.Model
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", "", errMissingModel
	}
	return body, contentType, modelName, nil
}

func readMultipartModel(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return ""
	}
	defer form.RemoveAll()
	if values := form.Value["model"]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func readAIRequestCount(body []byte, contentType string) int {
	count := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return count
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return count
		}
		defer form.RemoveAll()
		if values := form.Value["n"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &count)
		}
	} else {
		var payload struct {
			N int `json:"n"`
		}
		_ = json.Unmarshal(body, &payload)
		count = payload.N
	}
	if count < 1 {
		return 1
	}
	return count
}

func readAIRequestVideoSeconds(body []byte, contentType string) int {
	seconds := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return seconds
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return seconds
		}
		defer form.RemoveAll()
		if values := form.Value["seconds"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &seconds)
		} else if values := form.Value["duration"]; len(values) > 0 {
			var d int
			_, _ = fmt.Sscan(values[0], &d)
			if d > 0 {
				seconds = d
			}
		}
	} else {
		var payload struct {
			Seconds  string `json:"seconds"`
			Duration any    `json:"duration"`
		}
		_ = json.Unmarshal(body, &payload)
		if payload.Seconds != "" {
			_, _ = fmt.Sscan(payload.Seconds, &seconds)
		} else if payload.Duration != nil {
			switch v := payload.Duration.(type) {
			case float64:
				if v > 0 {
					seconds = int(v)
				}
			case string:
				var d int
				_, _ = fmt.Sscan(v, &d)
				if d > 0 {
					seconds = d
				}
			}
		}
	}
	if seconds < 1 {
		return 1
	}
	return seconds
}

var errMissingModel = &aiError{"缺少模型名称"}

func resolveAIProxyPath(baseURL string, modelName string, path string, videoConfig *model.ChannelVideoConfig) string {
	// 渠道配置了自定义视频路径时，优先使用
	if videoConfig != nil && strings.TrimSpace(videoConfig.Path) != "" && strings.Contains(path, "/videos") {
		customPath := strings.TrimRight("/"+strings.TrimLeft(videoConfig.Path, "/"), "/")
		if path == "/videos" {
			return customPath
		}
		if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
			return customPath + "/" + strings.TrimPrefix(path, "/videos/")
		}
	}
	if !isArkSeedanceVideo(baseURL, modelName) {
		return path
	}
	if path == "/videos" {
		return "/contents/generations/tasks"
	}
	if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
		return "/contents/generations/tasks/" + strings.TrimPrefix(path, "/videos/")
	}
	return path
}

func isArkSeedanceVideo(baseURL string, modelName string) bool {
	base := strings.ToLower(baseURL)
	model := strings.ToLower(modelName)
	// 只对火山方舟 Agent Plan 渠道做路径转换
	isArk := strings.Contains(base, "/api/plan/v3")
	isSeedance := strings.Contains(model, "seedance") || strings.Contains(model, "doubao-seedance")
	return isArk && isSeedance
}

func aiStatusMessage(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "AI 接口鉴权失败，请检查 API Key、套餐权限或模型权限"
	case http.StatusTooManyRequests:
		return "AI 接口限流或额度不足，请稍后重试或检查额度"
	default:
		return "AI 接口请求失败"
	}
}

func aiUpstreamStatusMessage(statusCode int, body []byte) string {
	base := aiStatusMessage(statusCode)
	detail := aiUpstreamErrorDetail(body)
	if detail == "" {
		return base
	}
	return base + "：" + detail
}

func aiUpstreamErrorDetail(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	var payload struct {
		Msg     string `json:"msg"`
		Message string `json:"message"`
		Error   struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			if detail := friendlyUpstreamError(payload.Error.Code, payload.Error.Message); detail != "" {
				return safeUpstreamText(detail)
			}
			if payload.Error.Code != "" {
				return safeUpstreamText(payload.Error.Code + " " + payload.Error.Message)
			}
			return safeUpstreamText(payload.Error.Message)
		}
		if payload.Msg != "" {
			return safeUpstreamText(payload.Msg)
		}
		if payload.Message != "" {
			return safeUpstreamText(payload.Message)
		}
	}
	return safeUpstreamText(text)
}

func friendlyUpstreamError(code string, message string) string {
	lowerCode := strings.ToLower(strings.TrimSpace(code))
	if strings.Contains(lowerCode, "inputvideosensitivecontentdetected") || strings.Contains(lowerCode, "privacyinformation") {
		return strings.TrimSpace(code + " 参考视频疑似包含真人或隐私信息，火山方舟拒绝使用普通 URL 作为真人视频参考；请改用不含真人的视频、官方允许的模型产物，或已授权的 asset:// 素材。原始错误：" + message)
	}
	return ""
}

// extractMediaFromJSON 从 JSON 请求体中提取素材字段的原始值（URL 或 base64 data URL），用于日志预览。
func extractMediaFromJSON(body []byte) string {
	var bodyMap map[string]any
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		return ""
	}
	mediaKeys := []string{"image", "images", "image_urls", "input_reference[]", "reference_images", "reference_videos", "reference_audios"}
	media := make(map[string]any)
	found := false
	for _, key := range mediaKeys {
		val, ok := bodyMap[key]
		if !ok || val == nil {
			continue
		}
		media[key] = val
		found = true
	}
	if !found {
		return ""
	}
	b, err := json.Marshal(media)
	if err != nil {
		return ""
	}
	return string(b)
}

func safeLogBody(body []byte) string {
	truncated := truncateBase64InBody(body)
	runes := []rune(string(truncated))
	if len(runes) > 4000 {
		return string(runes[:4000]) + "..."
	}
	return string(runes)
}

// truncateBase64InBody 截断请求体中的 base64 数据，保留 JSON 结构和其他字段
func truncateBase64InBody(body []byte) []byte {
	str := string(body)
	result := strings.Builder{}
	i := 0
	for i < len(str) {
		// 查找 base64 data URL 的起始位置
		idx := strings.Index(str[i:], "data:")
		if idx == -1 {
			result.WriteString(str[i:])
			break
		}
		idx += i
		// 查找 ";base64," 标记
		b64Marker := strings.Index(str[idx:], ";base64,")
		if b64Marker == -1 {
			result.WriteString(str[i : idx+5])
			i = idx + 5
			continue
		}
		b64Start := idx + b64Marker + 8
		// 从 base64 数据开始向后扫描，找到结束引号（跳过转义）
		j := b64Start
		for j < len(str) {
			if str[j] == '\\' && j+1 < len(str) {
				j += 2 // 跳过转义字符
				continue
			}
			if str[j] == '"' {
				break
			}
			j++
		}
		// 截断：保留前缀 + 前 32 字符 + "..."
		prefix := str[idx:b64Start]
		b64Data := str[b64Start:j]
		if len(b64Data) > 32 {
			result.WriteString(str[i:idx])
			result.WriteString(prefix)
			result.WriteString(b64Data[:32])
			result.WriteString("...")
			// 写入闭合引号，继续循环处理后续 base64 数据
			if j < len(str) {
				result.WriteByte(str[j]) // 写入闭合引号 "
				i = j + 1
			} else {
				i = j
			}
		} else {
			i = idx + 1
		}
	}
	return []byte(result.String())
}

func safeUpstreamText(text string) string {
	text = strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	runes := []rune(text)
	if len(runes) > 300 {
		return string(runes[:300]) + "..."
	}
	return text
}

func isVideoPath(path string, videoConfig *model.ChannelVideoConfig) bool {
	if strings.Contains(path, "/videos") || strings.Contains(path, "/contents/generations/tasks") {
		return true
	}
	// 渠道配置了自定义视频路径时，匹配该路径
	if videoConfig != nil && strings.TrimSpace(videoConfig.Path) != "" {
		customPath := strings.TrimRight("/"+strings.TrimLeft(videoConfig.Path, "/"), "/")
		if strings.HasPrefix(path, customPath) {
			return true
		}
	}
	if videoConfig != nil {
		for _, configuredPath := range []string{videoConfig.StatusEndpointPath, videoConfig.ContentEndpointPath} {
			prefix := strings.Split(strings.TrimSpace(configuredPath), "{taskId}")[0]
			if prefix != "" && strings.HasPrefix(path, prefix) {
				return true
			}
		}
	}
	return false
}

func isVideoTaskCompleted(respText string) bool {
	var raw struct {
		Status string `json:"status"`
		Data   struct {
			Status string `json:"status"`
		} `json:"data"`
		Result struct {
			Status string `json:"status"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(respText), &raw); err != nil {
		return false
	}
	for _, s := range []string{raw.Status, raw.Data.Status, raw.Result.Status} {
		s = strings.ToLower(s)
		if s == "completed" || s == "succeeded" || s == "success" || s == "submitted" {
			return true
		}
	}
	return false
}

// isVideoTaskFailed 检测视频任务是否失败（SD2 渠道 data.status == "FAILURE"）
func isVideoTaskFailed(respText string) bool {
	var raw struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(respText), &raw); err != nil {
		return false
	}
	return strings.ToUpper(raw.Data.Status) == "FAILURE"
}

// convertArkToOpenAIVideoRequest 将火山方舟 Ark 格式的视频请求转换为 OpenAI 兼容格式。
// Ark 格式: { model, content: [{type:"text",text},{type:"image_url",...}], ratio, resolution, duration, ... }
// OpenAI 格式: { model, prompt, size, n, image_urls, seconds, ... }

// applyRequestFields 根据模型级别的 RequestFields 转换 JSON 请求体。
// 模型级别的字段映射优先于渠道级 FieldMapping。
func applyRequestFields(body []byte, modelName string) []byte {
	cls, _, err := repository.GetModelClassificationByModelName(modelName)
	if err != nil || len(cls.RequestFields) == 0 {
		return body
	}
	var bodyMap map[string]any
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		return body
	}
	changed := false
	for _, rf := range cls.RequestFields {
		if rf.FieldName == "" || rf.RequestKey == "" {
			continue
		}
		val, ok := bodyMap[rf.FieldName]
		if !ok {
			continue
		}
		mappedValue, ok := transformRequestFieldValue(val, rf)
		if !ok {
			continue
		}
		// 如果目标字段已存在且不是同一个，跳过
		if rf.FieldName != rf.RequestKey {
			if _, exists := bodyMap[rf.RequestKey]; !exists {
				bodyMap[rf.RequestKey] = mappedValue
			}
			delete(bodyMap, rf.FieldName)
			changed = true
		} else if !reflect.DeepEqual(bodyMap[rf.RequestKey], mappedValue) {
			bodyMap[rf.RequestKey] = mappedValue
			changed = true
		}
	}
	if !changed {
		return body
	}
	out, _ := json.Marshal(bodyMap)
	return out
}

func transformRequestFieldValue(value any, field model.RequestField) (any, bool) {
	boundValue, ok := requestFieldValueAtPath(value, field.ValuePath)
	if !ok {
		return nil, false
	}

	if templateText := strings.TrimSpace(field.JSONTemplate); templateText != "" {
		var template any
		if err := json.Unmarshal([]byte(templateText), &template); err != nil {
			return nil, false
		}
		return replaceRequestFieldTemplateData(template, boundValue), true
	}

	if field.DataType == "object" && strings.TrimSpace(field.ObjectKey) != "" {
		return map[string]any{strings.TrimSpace(field.ObjectKey): boundValue}, true
	}

	if field.DataType != "" {
		if converted, changed := convertFieldType(boundValue, field.DataType); changed {
			return converted, true
		}
	}
	return boundValue, true
}

func requestFieldValueAtPath(value any, path string) (any, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		return value, true
	}

	current := value
	for _, segment := range strings.Split(path, ".") {
		segment = strings.TrimSpace(segment)
		if segment == "" {
			return nil, false
		}
		switch typed := current.(type) {
		case map[string]any:
			next, exists := typed[segment]
			if !exists {
				return nil, false
			}
			current = next
		case []any:
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, false
			}
			current = typed[index]
		default:
			return nil, false
		}
	}
	return current, true
}

func replaceRequestFieldTemplateData(template any, boundValue any) any {
	switch typed := template.(type) {
	case string:
		if typed == "@data" {
			return boundValue
		}
		return typed
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = replaceRequestFieldTemplateData(item, boundValue)
		}
		return result
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			result[key] = replaceRequestFieldTemplateData(item, boundValue)
		}
		return result
	default:
		return typed
	}
}

func convertFieldType(val any, dataType string) (any, bool) {
	switch dataType {
	case "string":
		switch v := val.(type) {
		case string:
			return v, false
		case []any:
			// 数组取第一个元素的值作为字符串
			if len(v) > 0 {
				first := v[0]
				if m, ok := first.(map[string]any); ok {
					if dataUrl, ok := m["dataUrl"].(string); ok {
						return dataUrl, true
					}
				}
				if s, ok := first.(string); ok {
					return s, true
				}
				return fmt.Sprintf("%v", first), true
			}
			return "", true
		default:
			return fmt.Sprintf("%v", v), true
		}
	case "integer":
		switch v := val.(type) {
		case float64:
			return int(v), true
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return i, true
			}
		}
	case "number":
		switch v := val.(type) {
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				return f, true
			}
		}
	case "boolean":
		switch v := val.(type) {
		case bool:
			return v, false
		case string:
			return v == "true" || v == "1", true
		case float64:
			return v != 0, true
		}
	case "array":
		switch v := val.(type) {
		case []any:
			return v, false
		case string:
			return []any{v}, true
		}
	case "object":
		switch val.(type) {
		case map[string]any:
			return val, false
		}
	}
	return val, false
}

// applyFieldMappingToJSON 根据渠道字段映射转换 JSON 请求体中的字段名和类型
// 前端统一发送 reference_images 字段，后端根据 fieldMapping 转换为渠道期望的字段名。
func applyFieldMappingToJSON(body []byte, fieldMapping *model.ChannelFieldMapping) ([]byte, error) {
	var bodyMap map[string]any
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		return body, err
	}

	imagesFieldName := fieldMapping.Images
	if imagesFieldName == "" {
		imagesFieldName = "images"
	}

	changed := false

	// 前端通用字段名 reference_images -> 渠道目标字段名
	if refImages, ok := bodyMap["reference_images"]; ok {
		if _, exists := bodyMap[imagesFieldName]; !exists {
			bodyMap[imagesFieldName] = refImages
			delete(bodyMap, "reference_images")
			changed = true
		} else {
			delete(bodyMap, "reference_images")
			changed = true
		}
	}

	// 兼容旧字段名 image_urls / images -> 渠道目标字段名
	for _, srcKey := range []string{"image_urls", "images"} {
		if srcKey == imagesFieldName {
			continue
		}
		if val, ok := bodyMap[srcKey]; ok {
			if _, exists := bodyMap[imagesFieldName]; !exists {
				bodyMap[imagesFieldName] = val
				delete(bodyMap, srcKey)
				changed = true
			} else {
				delete(bodyMap, srcKey)
				changed = true
			}
		}
	}

	// 单图字段 image -> images 数组
	imgFieldName := "image"
	if fieldMapping.Image != "" {
		imgFieldName = fieldMapping.Image
	}
	if imgVal, ok := bodyMap[imgFieldName]; ok {
		if _, hasImages := bodyMap[imagesFieldName]; !hasImages {
			switch v := imgVal.(type) {
			case string:
				bodyMap[imagesFieldName] = []string{v}
				delete(bodyMap, imgFieldName)
				changed = true
			}
		} else {
			delete(bodyMap, imgFieldName)
			changed = true
		}
	}

	// 处理 images 字段类型
	if imagesVal, ok := bodyMap[imagesFieldName]; ok {
		if fieldMapping.ImagesType != "string" {
			switch v := imagesVal.(type) {
			case string:
				bodyMap[imagesFieldName] = []string{v}
				changed = true
			}
		}
	}

	if !changed {
		return body, nil
	}
	return json.Marshal(bodyMap)
}

// convertBase64ImagesToURLs 将 JSON 中的 base64 data URL 上传为公网 URL
func convertBase64ImagesToURLs(body []byte) []byte {
	var bodyMap map[string]any
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		return body
	}
	changed := false
	for key, val := range bodyMap {
		switch v := val.(type) {
		case string:
			if strings.HasPrefix(v, "data:") {
				if url, err := uploadBase64AsMedia(v); err == nil {
					bodyMap[key] = url
					changed = true
					log.Printf("[MEDIA] uploaded base64 image for key=%s url=%s", key, url)
				} else {
					log.Printf("[MEDIA] failed to upload base64 image for key=%s: %v", key, err)
				}
			}
		case []any:
			arr := make([]any, len(v))
			for i, item := range v {
				if s, ok := item.(string); ok && strings.HasPrefix(s, "data:") {
					if url, err := uploadBase64AsMedia(s); err == nil {
						arr[i] = url
						changed = true
						log.Printf("[MEDIA] uploaded base64 image for key=%s[%d] url=%s", key, i, url)
					} else {
						log.Printf("[MEDIA] failed to upload base64 image for key=%s[%d]: %v", key, i, err)
						arr[i] = s
					}
				} else {
					arr[i] = item
				}
			}
			bodyMap[key] = arr
		}
	}
	if !changed {
		return body
	}
	result, err := json.Marshal(bodyMap)
	if err != nil {
		return body
	}
	return result
}

// multipartToJSON 将 multipart/form-data 请求体转换为 JSON
func multipartToJSON(body []byte, contentType string, fieldMapping *model.ChannelFieldMapping) ([]byte, error) {
	// 从 Content-Type 中提取 boundary
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "multipart/form-data" {
		return body, err
	}
	boundary := params["boundary"]
	if boundary == "" {
		return body, fmt.Errorf("no boundary in content-type")
	}

	mr := multipart.NewReader(bytes.NewReader(body), boundary)
	result := make(map[string]any)
	files := make(map[string][]FileData)
	fieldTypes := map[string]string{
		// OpenAI-compatible image APIs define n as an integer. Keeping this
		// default also fixes requests from clients released before type hints.
		"n":     "integer",
		"async": "boolean",
	}

	for {
		part, err := mr.NextPart()
		if err != nil {
			break
		}
		name := part.FormName()
		if name == "" {
			continue
		}
		partBody, err := io.ReadAll(io.LimitReader(part, 10<<20)) // 10MB limit
		if err != nil {
			continue
		}
		// 检查是否是文件字段
		if part.FileName() != "" {
			files[name] = append(files[name], FileData{
				FileName: part.FileName(),
				MimeType: part.Header.Get("Content-Type"),
				Data:     partBody,
			})
			continue
		}
		val := string(partBody)
		if name == multipartJSONFieldTypesField {
			var hintedTypes map[string]string
			if err := json.Unmarshal(partBody, &hintedTypes); err != nil {
				return nil, fmt.Errorf("invalid multipart JSON field types: %w", err)
			}
			for fieldName, fieldType := range hintedTypes {
				fieldTypes[fieldName] = fieldType
			}
			continue
		}
		// FormData text fields remain strings unless the client explicitly
		// supplies a JSON type hint (or the field has a standard type above).
		result[name] = val
	}

	for name, dataType := range fieldTypes {
		value, exists := result[name]
		if !exists {
			continue
		}
		converted, err := convertMultipartJSONField(value, dataType)
		if err != nil {
			return nil, fmt.Errorf("invalid multipart field %q as %s: %w", name, dataType, err)
		}
		result[name] = converted
	}

	// 处理文件字段：转为 base64 data URL
	// 仅在用户明确配置了字段映射时才重命名字段，否则保留原始字段名
	hasFieldMapping := fieldMapping != nil && (fieldMapping.Image != "" || fieldMapping.Images != "" || fieldMapping.ReferenceVideos != "" || fieldMapping.ReferenceAudios != "")
	imgFieldName := "image"
	imagesFieldName := "image_urls"
	videoFieldName := "reference_videos"
	audioFieldName := "reference_audios"
	if hasFieldMapping {
		if fieldMapping.Image != "" {
			imgFieldName = fieldMapping.Image
		}
		if fieldMapping.Images != "" {
			imagesFieldName = fieldMapping.Images
		}
		if fieldMapping.ReferenceVideos != "" {
			videoFieldName = fieldMapping.ReferenceVideos
		}
		if fieldMapping.ReferenceAudios != "" {
			audioFieldName = fieldMapping.ReferenceAudios
		}
	}
	for name, fileList := range files {
		if len(fileList) == 0 {
			continue
		}
		dataURLs := make([]string, 0, len(fileList))
		for _, f := range fileList {
			dataURLs = append(dataURLs, fmt.Sprintf("data:%s;base64,%s", f.MimeType, base64.StdEncoding.EncodeToString(f.Data)))
		}

		// 没有配置字段映射且不是通用参考字段时，保留原始字段名
		if !hasFieldMapping && name != "reference_images" && name != "reference_videos" && name != "reference_audios" {
			if len(fileList) == 1 {
				result[name] = dataURLs[0]
			} else {
				result[name] = dataURLs
			}
			continue
		}

		// 根据字段名和 MIME 类型判断映射到哪个 JSON key
		key := imagesFieldName
		_, isVideo := mimeLookup(fileList[0].MimeType)
		_, isAudio := audioLookup(fileList[0].MimeType)
		switch {
		case isVideo || name == "reference_videos":
			key = videoFieldName
		case isAudio || name == "reference_audios":
			key = audioFieldName
		case name == imgFieldName || name == "image" || name == "input_image":
			if len(fileList) == 1 {
				result[imgFieldName] = dataURLs[0]
				continue
			}
			key = imagesFieldName
		case name == "reference_images" || name == imagesFieldName || strings.Contains(name, "image"):
			key = imagesFieldName
		}
		if key == imgFieldName && len(fileList) == 1 {
			// 单图字段名匹配，发单个字符串
			result[imgFieldName] = dataURLs[0]
		} else if key == imagesFieldName {
			// 多图字段名匹配，始终发数组
			result[imagesFieldName] = dataURLs
		} else {
			result[key] = dataURLs
		}
	}

	return json.Marshal(result)
}

func convertMultipartJSONField(value any, dataType string) (any, error) {
	text, ok := value.(string)
	if !ok {
		return value, nil
	}
	switch strings.ToLower(strings.TrimSpace(dataType)) {
	case "", "string":
		return text, nil
	case "integer":
		parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		return parsed, err
	case "number":
		parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
		return parsed, err
	case "boolean":
		switch strings.ToLower(strings.TrimSpace(text)) {
		case "true", "1":
			return true, nil
		case "false", "0":
			return false, nil
		default:
			return nil, fmt.Errorf("expected true, false, 1, or 0")
		}
	case "array":
		var parsed []any
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			return nil, err
		}
		return parsed, nil
	case "object":
		var parsed map[string]any
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			return nil, err
		}
		return parsed, nil
	case "json":
		var parsed any
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			return nil, err
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("unsupported JSON field type %q", dataType)
	}
}

// normalizeStandardAIRequestTypes repairs scalar types that can be lost when
// a client serializes a typed JSON request through multipart/form-data or a
// persisted string-based configuration. Invalid values are left unchanged so
// the upstream can return its own validation error.
func normalizeStandardAIRequestTypes(body []byte) []byte {
	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return body
	}
	changed := false
	for name, dataType := range map[string]string{
		"n":     "integer",
		"async": "boolean",
	} {
		value, exists := result[name]
		if !exists {
			continue
		}
		converted, err := convertMultipartJSONField(value, dataType)
		if err != nil || reflect.DeepEqual(converted, value) {
			continue
		}
		result[name] = converted
		changed = true
	}
	if !changed {
		return body
	}
	converted, err := json.Marshal(result)
	if err != nil {
		return body
	}
	return converted
}

type FileData struct {
	FileName string
	MimeType string
	Data     []byte
}

func mimeLookup(mimeType string) (string, bool) {
	if strings.HasPrefix(mimeType, "video/") {
		return mimeType, true
	}
	return "", false
}

func audioLookup(mimeType string) (string, bool) {
	if strings.HasPrefix(mimeType, "audio/") {
		return mimeType, true
	}
	return "", false
}

func convertArkToOpenAIVideoRequest(body []byte) ([]byte, error) {
	var req struct {
		Model   string `json:"model"`
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text"`
			ImageURL *struct {
				URL string `json:"url"`
			} `json:"image_url"`
			VideoURL *struct {
				URL string `json:"url"`
			} `json:"video_url"`
			AudioURL *struct {
				URL string `json:"url"`
			} `json:"audio_url"`
			Role string `json:"role"`
		} `json:"content"`
		Ratio         string `json:"ratio"`
		Resolution    string `json:"resolution"`
		Duration      any    `json:"duration"`
		GenerateAudio any    `json:"generate_audio"`
		Watermark     any    `json:"watermark"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		return body, err
	}

	// 提取提示词和素材
	var promptParts []string
	var imageUrls []string
	var videoUrls []string
	var audioUrls []string

	// 如果 Content 为空，尝试从扁平 JSON 提取（multipart 转换后的格式）
	if len(req.Content) == 0 {
		// 先用通用 map 解析，将单字符串的数组字段归一化为数组
		var rawMap map[string]any
		if err := json.Unmarshal(body, &rawMap); err == nil {
			normalizeStringOrArray := func(key string) []string {
				val, ok := rawMap[key]
				if !ok {
					return nil
				}
				switch v := val.(type) {
				case string:
					return []string{v}
				case []any:
					var result []string
					for _, item := range v {
						if s, ok := item.(string); ok {
							result = append(result, s)
						}
					}
					return result
				}
				return nil
			}
			modelName := req.Model
			prompt, _ := rawMap["prompt"].(string)
			seconds := rawMap["seconds"]
			resolution, _ := rawMap["resolution_name"].(string)
			size, _ := rawMap["size"].(string)
			preset, _ := rawMap["preset"].(string)

			if prompt != "" {
				promptParts = append(promptParts, prompt)
			}
			// 收集所有图片（支持多种字段名，兼容字符串和数组格式）
			imageUrls = append(imageUrls, normalizeStringOrArray("image_urls")...)
			if img, _ := rawMap["image"].(string); img != "" {
				imageUrls = append(imageUrls, img)
			}
			imageUrls = append(imageUrls, normalizeStringOrArray("images")...)
			imageUrls = append(imageUrls, normalizeStringOrArray("input_reference[]")...)
			imageUrls = append(imageUrls, normalizeStringOrArray("reference_images")...)
			videoUrls = append(videoUrls, normalizeStringOrArray("reference_videos")...)
			audioUrls = append(audioUrls, normalizeStringOrArray("reference_audios")...)

			// 从扁平字段构建结果
			result := map[string]any{"model": modelName}
			if len(promptParts) > 0 {
				result["prompt"] = strings.Join(promptParts, "\n")
			}
			if len(imageUrls) > 0 {
				result["reference_images"] = imageUrls
			}
			if len(videoUrls) > 0 {
				result["reference_videos"] = videoUrls
			}
			if len(audioUrls) > 0 {
				result["reference_audios"] = audioUrls
			}
			if seconds != nil {
				result["seconds"] = seconds
			}
			if resolution != "" {
				result["resolution_name"] = resolution
			} else if req.Resolution != "" {
				result["resolution_name"] = req.Resolution
			}
			if size != "" {
				result["size"] = size
			} else if req.Ratio != "" {
				result["size"] = req.Ratio
			}
			if preset != "" {
				result["preset"] = preset
			}
			return json.Marshal(result)
		}
	}

	for _, item := range req.Content {
		switch {
		case item.Type == "text" && item.Text != "":
			promptParts = append(promptParts, item.Text)
		case item.Type == "image_url" && item.ImageURL != nil && item.ImageURL.URL != "":
			imageUrls = append(imageUrls, item.ImageURL.URL)
		case item.Role == "reference_image" && item.ImageURL != nil && item.ImageURL.URL != "":
			imageUrls = append(imageUrls, item.ImageURL.URL)
		case item.Type == "video_url" && item.VideoURL != nil && item.VideoURL.URL != "":
			videoUrls = append(videoUrls, item.VideoURL.URL)
		case item.Role == "reference_video" && item.VideoURL != nil && item.VideoURL.URL != "":
			videoUrls = append(videoUrls, item.VideoURL.URL)
		case item.Type == "audio_url" && item.AudioURL != nil && item.AudioURL.URL != "":
			audioUrls = append(audioUrls, item.AudioURL.URL)
		case item.Role == "reference_audio" && item.AudioURL != nil && item.AudioURL.URL != "":
			audioUrls = append(audioUrls, item.AudioURL.URL)
		}
	}

	result := map[string]any{
		"model":  req.Model,
		"prompt": strings.Join(promptParts, "\n"),
	}
	if req.Ratio != "" {
		result["size"] = req.Ratio
	}
	if req.Duration != nil {
		result["seconds"] = req.Duration
	}
	if len(imageUrls) > 0 {
		result["reference_images"] = imageUrls
	}
	if len(videoUrls) > 0 {
		result["reference_videos"] = videoUrls
	}
	if len(audioUrls) > 0 {
		result["reference_audios"] = audioUrls
	}
	return json.Marshal(result)
}

// convertOpenAIToArkVideoResponse 将 OpenAI 兼容格式的视频响应转换为 Ark 格式。
// OpenAI 格式: { id, status, progress, result_url, data: { status, result_url, ... } }
// Ark 格式: { id, status, progress, content: { video_url }, result: { video_url }, data: { status, video_url } }
func convertOpenAIToArkVideoResponse(body []byte, config *model.ChannelVideoConfig) ([]byte, error) {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return body, err
	}

	// 提取任务 ID
	taskID := extractFieldPath(raw, config.TaskIDField, "id", "task_id")
	// 提取状态
	status := extractFieldPath(raw, config.StatusField, "status", "data.status")
	// 提取视频 URL
	videoURL := extractFieldPath(raw, "", config.VideoURLPaths...)
	// 提取进度
	progress := extractFieldPath(raw, "", "progress", "data.progress")
	// 提取错误信息
	errorMsg := extractFieldPath(raw, "", "fail_reason", "data.fail_reason", "data.error", "data.error_message", "data.message", "error.message")

	// 规范化状态
	normalizedStatus := normalizeVideoStatus(status)

	// 构建 Ark 兼容响应
	arkResp := map[string]any{
		"id":     taskID,
		"status": normalizedStatus,
	}
	if progress != "" {
		arkResp["progress"] = progress
	}
	if videoURL != "" {
		arkResp["content"] = map[string]any{"video_url": videoURL}
		arkResp["result"] = map[string]any{"video_url": videoURL}
	}
	if normalizedStatus == "failed" && errorMsg != "" {
		arkResp["error"] = map[string]any{"message": errorMsg}
	}
	// 保留原始 data 字段
	if data, ok := raw["data"]; ok {
		arkResp["data"] = data
	}
	return json.Marshal(arkResp)
}

func extractFieldPath(obj map[string]any, explicitPath string, fallbackPaths ...string) string {
	if explicitPath != "" {
		if val := resolveDottedPath(obj, explicitPath); val != "" {
			return val
		}
	}
	for _, p := range fallbackPaths {
		if val := resolveDottedPath(obj, p); val != "" {
			return val
		}
	}
	return ""
}

func resolveDottedPath(obj map[string]any, path string) string {
	parts := strings.Split(path, ".")
	var current any = obj
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current = m[part]
	}
	if current == nil {
		return ""
	}
	return fmt.Sprintf("%v", current)
}

func normalizeVideoStatus(status string) string {
	switch strings.ToLower(status) {
	case "success", "succeeded", "completed", "submitted":
		return "completed"
	case "failed", "failure", "error", "canceled", "cancelled", "expired":
		return "failed"
	case "processing", "in_progress", "queued", "running":
		return "pending"
	default:
		return status
	}
}

func emitVideoGenerationTaskUpdate(userID string, task canvasGenerationTaskContext, respText string, taskDone bool, taskFailed bool, videoConfig *model.ChannelVideoConfig) {
	if userID == "" || task.TaskID == "" {
		return
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(respText), &raw); err != nil {
		return
	}
	status := normalizeVideoStatus(extractFieldPath(raw, "", "status", "data.status", "result.status"))
	if status == "" {
		switch {
		case taskFailed:
			status = "failed"
		case taskDone:
			status = "completed"
		default:
			status = "pending"
		}
	}
	videoURLPaths := []string{"content.video_url", "result.video_url", "result.url", "data.video_url", "data.video_urls", "url", "video_url", "video.url"}
	if videoConfig != nil && len(videoConfig.VideoURLPaths) > 0 {
		videoURLPaths = append(videoConfig.VideoURLPaths, videoURLPaths...)
	}
	payload := map[string]any{
		"type":     "generation-task-updated",
		"taskId":   task.TaskID,
		"canvasId": task.CanvasID,
		"nodeId":   task.NodeID,
		"status":   status,
	}
	if progress := extractProgressNumber(raw); progress >= 0 {
		payload["progress"] = progress
	}
	if videoURL := extractVideoURL(raw, videoURLPaths...); videoURL != "" {
		payload["resultUrl"] = videoURL
	}
	if errorMsg := extractFieldPath(raw, "", "error.message", "data.error.message", "data.error", "data.error_message", "data.fail_reason", "fail_reason", "message"); errorMsg != "" {
		payload["error"] = errorMsg
	}
	ws.DefaultHub.SendToUser(userID, payload)
	taskStatus := model.GenerationTaskStatusRunning
	if payload["status"] == "completed" {
		taskStatus = model.GenerationTaskStatusSucceeded
	} else if payload["status"] == "failed" {
		taskStatus = model.GenerationTaskStatusFailed
	}
	progress := -1
	if value, ok := payload["progress"].(int); ok {
		progress = value
	}
	update := service.GenerationTaskUpdate{Status: taskStatus}
	if upstreamTaskID := extractFieldPath(raw, "", "id", "task_id", "data.id", "data.task_id"); upstreamTaskID != "" {
		update.UpstreamTaskID = upstreamTaskID
	}
	if progress >= 0 {
		update.Progress = &progress
	}
	if resultURL, ok := payload["resultUrl"].(string); ok {
		update.ResultURL = resultURL
	}
	if errorMsg, ok := payload["error"].(string); ok {
		update.ErrorMsg = errorMsg
	}
	service.UpdateGenerationTaskByIDOrUpstreamID(task.TaskID, update)
}

func registerVideoGenerationTask(userID, username, modelName, path, respText string, task canvasGenerationTaskContext) {
	if userID == "" {
		return
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(respText), &raw); err != nil {
		return
	}
	upstreamTaskID := extractFieldPath(raw, "", "id", "task_id", "data.id", "data.task_id")
	if upstreamTaskID == "" {
		return
	}
	service.CreateGenerationTask(service.GenerationTaskCreate{
		UpstreamTaskID: upstreamTaskID,
		Type:           model.GenerationTaskTypeVideo,
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

func extractProgressNumber(raw map[string]any) int {
	progress := extractFieldPath(raw, "", "progress", "data.progress", "result.progress")
	if progress == "" {
		return -1
	}
	percent := strings.TrimSuffix(strings.TrimSpace(progress), "%")
	n, err := strconv.Atoi(percent)
	if err != nil || n < 0 || n > 100 {
		return -1
	}
	return n
}

func extractVideoURL(raw map[string]any, paths ...string) string {
	for _, path := range paths {
		if val := resolveDottedPathValue(raw, path); val != nil {
			switch v := val.(type) {
			case string:
				if strings.TrimSpace(v) != "" {
					return v
				}
			case []any:
				for _, item := range v {
					if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
						return s
					}
				}
			case []string:
				for _, s := range v {
					if strings.TrimSpace(s) != "" {
						return s
					}
				}
			}
		}
	}
	return ""
}

func resolveDottedPathValue(obj map[string]any, path string) any {
	if path == "" {
		return nil
	}
	parts := strings.Split(path, ".")
	var current any = obj
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = m[part]
	}
	return current
}

// isVideoTaskDone 检测视频轮询任务是否已完成（SUCCESS 或 FAILURE），用于停止轮询
func isVideoTaskDone(respText string) bool {
	var raw struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(respText), &raw); err != nil {
		return false
	}
	s := strings.ToUpper(raw.Data.Status)
	return s == "SUCCESS" || s == "FAILURE"
}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
