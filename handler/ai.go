package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

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

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	isPolling := strings.Contains(path, "/videos/") && !strings.HasSuffix(path, "/content")
	user, _ := service.UserFromContext(r.Context())
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		if !isPolling {
			go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		}
		Fail(w, "调用失败，请联系管理员")
		return
	}
	path = resolveAIProxyPath(channel.BaseURL, modelName, path, channel.VideoConfig)
	upstreamURL := service.BuildModelChannelURL(channel, path)

	// 记录请求日志
	reqHeaders := map[string]string{
		"Authorization": "Bearer " + channel.APIKey[:min(len(channel.APIKey), 8)] + "***",
	}
	for k, v := range channel.ExtraHeaders {
		reqHeaders[k] = v
	}
	LogChannelRequest(channel.BaseURL, modelName, http.MethodGet, upstreamURL, reqHeaders, "", 0)

	// 持久化请求日志（轮询去重）
	var logID string
	shouldLog := service.ShouldLogPollingRequest(path, isPolling)
	if shouldLog {
		logID = service.LogRequest(user.ID, user.Username, modelName, http.MethodGet, path, upstreamURL, reqHeaders, "", 0, "")
	}

	request, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
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
	// 应用渠道 ExtraHeaders
	for k, v := range channel.ExtraHeaders {
		request.Header.Set(k, v)
	}
	extraArgs := []any{isPolling, channel.VideoConfig, channel.BaseURL, requestUpstreamURL(upstreamURL), requestHeadersMap(reqHeaders)}
	if logID != "" {
		extraArgs = append(extraArgs, requestLogID(logID))
	}
	if isPolling {
		extraArgs = append(extraArgs, canvasGenerationTaskContext{
			TaskID:   strings.TrimPrefix(path, "/videos/"),
			CanvasID: r.URL.Query().Get("canvasId"),
			NodeID:   r.URL.Query().Get("nodeId"),
		})
	}
	copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, 0, extraArgs...)
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
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), 0)
		Fail(w, "调用失败，请联系管理员")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	if isVideoPath(path, channel.VideoConfig) {
		credits *= readAIRequestVideoSeconds(body, contentType)
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
	upstreamURL := service.BuildModelChannelURL(channel, path)

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
	logID := service.LogRequest(user.ID, user.Username, modelName, http.MethodPost, path, upstreamURL, reqHeaders, safeLogBody(finalBody), len(finalBody), extractMediaFromJSON(finalBody))

	log.Printf("AI proxy upstream: url=%s method=POST content_type=%s body_size=%d", upstreamURL, contentType, len(finalBody))
	request, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewReader(finalBody))
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
	// 应用渠道 ExtraHeaders
	for k, v := range channel.ExtraHeaders {
		request.Header.Set(k, v)
	}
	extraArgs := []any{channel.VideoConfig, channel.BaseURL, requestLogID(logID)}
	if isVideoPath(path, channel.VideoConfig) {
		extraArgs = append(extraArgs, canvasGenerationTaskContext{
			CanvasID: r.URL.Query().Get("canvasId"),
			NodeID:   r.URL.Query().Get("nodeId"),
		})
	}
	// 会员有效期内免扣算力点。
	if service.IsMembershipActive(user.MembershipExpiresAt) {
		service.LogMembershipFreeUsage(user.ID, modelName, credits, path)
		copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, credits, extraArgs...)
		return
	}
	if service.IsModelFreeForRole(string(user.Role), modelName) {
		service.LogRoleFreeUsage(user.ID, string(user.Role), modelName, credits, path)
		copyAIResponse(w, request, nil, user.ID, user.Username, modelName, path, credits, extraArgs...)
		return
	}
	if err := service.ConsumeUserCredits(user.ID, modelName, credits, path); err != nil {
		go service.LogCall(user.ID, user.Username, modelName, path, false, err.Error(), credits)
		FailError(w, err)
		return
	}
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
	copyAIResponse(w, request, func() {
		if err := service.RefundUserCredits(user.ID, modelName, credits, path); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	}, user.ID, user.Username, modelName, path, credits, extraArgs...)
}

// requestLogID 用于在 extraArgs 中传递请求日志 ID
type requestLogID string

// requestUpstreamURL 用于在 extraArgs 中传递上游 URL
type requestUpstreamURL string

// requestHeadersMap 用于在 extraArgs 中传递请求头
type requestHeadersMap map[string]string

type canvasGenerationTaskContext struct {
	TaskID   string
	CanvasID string
	NodeID   string
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func(), userID, username, modelName, path string, credits int, extraArgs ...any) {
	var isPolling bool
	var videoConfig *model.ChannelVideoConfig
	var baseURL string
	var logID string
	var logUpstreamURL string
	var logReqHeaders map[string]string
	var generationTask canvasGenerationTaskContext
	for _, arg := range extraArgs {
		switch v := arg.(type) {
		case bool:
			isPolling = v
		case *model.ChannelVideoConfig:
			videoConfig = v
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
		case canvasGenerationTaskContext:
			generationTask = v
		}
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if baseURL != "" {
			LogChannelResponse(baseURL, "", 0, err.Error())
		}
		if logID != "" {
			service.LogRequestResponse(logID, "", 0, false, err.Error())
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
			service.LogRequestResponse(logID, string(body), response.StatusCode, false, "")
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
		if isPolling && taskFailed && credits > 0 {
			if err := service.RefundUserCredits(userID, modelName, credits, path); err != nil {
				log.Printf("AI proxy refund credits on video failure: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
			} else {
				log.Printf("AI proxy refunded %d credits for failed video task: user=%s model=%s", credits, userID, modelName)
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
				logID = service.LogRequest(userID, username, modelName, http.MethodGet, path, logUpstreamURL, logReqHeaders, "", 0, "")
			}
		}
		if logID != "" {
			service.LogRequestResponse(logID, respText, response.StatusCode, !taskFailed, "")
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
	if baseURL != "" {
		LogChannelResponse(baseURL, string(respBody), response.StatusCode, "")
	}
	if logID != "" {
		service.LogRequestResponse(logID, string(respBody), response.StatusCode, true, "")
	}

	if !isPolling {
		go service.LogCall(userID, username, modelName, path, true, "", credits)
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
		return strings.HasPrefix(path, customPath)
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
		// 如果目标字段已存在且不是同一个，跳过
		if rf.FieldName != rf.RequestKey {
			if _, exists := bodyMap[rf.RequestKey]; !exists {
				bodyMap[rf.RequestKey] = val
			}
			delete(bodyMap, rf.FieldName)
			changed = true
		}
		// 类型转换
		if rf.DataType != "" {
			if converted, ok := convertFieldType(bodyMap[rf.RequestKey], rf.DataType); ok {
				bodyMap[rf.RequestKey] = converted
				changed = true
			}
		}
	}
	if !changed {
		return body
	}
	out, _ := json.Marshal(bodyMap)
	return out
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
		// 普通字段：保持原始字符串类型（API 可能期望 string 而非 number）
		val := string(partBody)
		result[name] = val
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
	if progress >= 0 {
		update.Progress = &progress
	}
	if resultURL, ok := payload["resultUrl"].(string); ok {
		update.ResultURL = resultURL
	}
	if errorMsg, ok := payload["error"].(string); ok {
		update.ErrorMsg = errorMsg
	}
	service.UpdateGenerationTaskByUpstreamID(task.TaskID, update)
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
