package model

import "encoding/json"

type SettingKey string

const (
	SettingKeyPublic  SettingKey = "public"
	SettingKeyPrivate SettingKey = "private"
)

// ModelChannel 模型渠道配置。
type ModelChannel struct {
	Protocol      string            `json:"protocol"`
	Name          string            `json:"name"`
	BaseURL       string            `json:"baseUrl"`
	APIKey        string            `json:"apiKey"`
	Models        []string          `json:"models"`
	Weight        int               `json:"weight"`
	Enabled       bool              `json:"enabled"`
	Remark        string            `json:"remark"`
	ExtraHeaders  map[string]string `json:"extraHeaders,omitempty"`
	ExtraBody     map[string]any    `json:"extraBody,omitempty"`
	PathPrefix    string            `json:"pathPrefix,omitempty"`
	VideoConfig   *ChannelVideoConfig `json:"videoConfig,omitempty"`
	// 素材字段映射：自定义请求体中素材字段的名称，留空使用默认值。
	FieldMapping *ChannelFieldMapping `json:"fieldMapping,omitempty"`
	// 图片格式：base64 或 url；留空默认 base64。
	ImageFormat string `json:"imageFormat,omitempty"`
	// 以下字段用于 App 端完整配置
	// 媒体类型：image / video / chat；留空默认 image
	MediaType string `json:"mediaType,omitempty"`
	// API 风格：openai-compatible / google-gemini / stability / generic-json；留空根据 protocol 推断
	ApiStyle string `json:"apiStyle,omitempty"`
	// 接口路径，如 /v1/images/generations；留空使用默认值
	EndpointPath string `json:"endpointPath,omitempty"`
	// 响应格式：openai-images / url-array / data-url / generic
	ResponseFormat string `json:"responseFormat,omitempty"`
	// 支持的分辨率列表
	SupportedResolutions []string `json:"supportedResolutions,omitempty"`
	// 支持的模型版本列表
	SupportedModelVersions []string `json:"supportedModelVersions,omitempty"`
	// 是否支持联网搜索
	SupportsWebSearch bool `json:"supportsWebSearch,omitempty"`
}

// ChannelVideoConfig 渠道视频接口配置，用于适配不同 API 的视频生成接口。
// 覆盖 App 端视频生成所需的全部配置。
type ChannelVideoConfig struct {
	// === 基础配置 ===
	// 视频接口路径，如 /v1/videos、/video/generations
	Path string `json:"path,omitempty"`
	// HTTP 方法：POST（默认）或 GET
	Method string `json:"method,omitempty"`
	// 请求体模式：json（默认）或 multipart
	RequestBodyMode string `json:"requestBodyMode,omitempty"`
	// 请求格式："" (默认 Ark 格式)、"openai" (OpenAI 兼容格式)、"generic-json"
	RequestFormat string `json:"requestFormat,omitempty"`
	// 响应格式："" (默认自动检测) 或 "openai" (OpenAI 兼容格式)
	ResponseFormat string `json:"responseFormat,omitempty"`

	// === 任务管理（异步轮询） ===
	// 创建任务后返回的任务 ID 字段路径，如 "id"、"task_id"、"data.task_no"
	TaskIDField string `json:"taskIdField,omitempty"`
	// 状态轮询端点，如 /v1/videos/{taskId}，{taskId} 会被替换
	StatusEndpointPath string `json:"statusEndpointPath,omitempty"`
	// 内容/结果端点，如 /v1/videos/{taskId}/content
	ContentEndpointPath string `json:"contentEndpointPath,omitempty"`
	// 状态查询方法：GET（默认）或 POST
	StatusMethod string `json:"statusMethod,omitempty"`
	// 状态字段路径，如 "status"、"data.status"、"done"
	StatusField string `json:"statusField,omitempty"`
	// 视频 URL 字段路径，支持多个兜底路径
	VideoURLPaths []string `json:"videoUrlPaths,omitempty"`
	// 视频下载字段路径，用于从响应中提取可下载的视频 URL（如 video_file.url、data.download_url）
	VideoDownloadField string `json:"videoDownloadField,omitempty"`
	// 视频进度字段路径，用于从轮询响应中提取生成进度（如 "progress"、"data.progress"）
	VideoProgressField string `json:"videoProgressField,omitempty"`

	// === 状态值定义 ===
	// 等待中的状态值列表
	PendingValues []string `json:"pendingValues,omitempty"`
	// 成功的状态值列表
	SuccessValues []string `json:"successValues,omitempty"`
	// 失败的状态值列表
	FailedValues []string `json:"failedValues,omitempty"`

	// === 轮询控制 ===
	// 轮询间隔（毫秒），默认 5000
	PollIntervalMs int `json:"pollIntervalMs,omitempty"`
	// 轮询超时（毫秒），默认 960000（16分钟）
	PollTimeoutMs int `json:"pollTimeoutMs,omitempty"`

	// === 请求体字段映射 ===
	// 模型字段名，默认 "model"
	ModelField string `json:"modelField,omitempty"`
	// 提示词字段名，默认 "prompt"
	PromptField string `json:"promptField,omitempty"`
	// 尺寸字段名，默认 "size"
	SizeField string `json:"sizeField,omitempty"`
	// 时长字段名，默认 "seconds"
	SecondsField string `json:"secondsField,omitempty"`
	// 时长是否使用字符串类型
	SecondsAsString bool `json:"secondsAsString,omitempty"`
	// 宽高比字段名，默认 "aspect_ratio"
	AspectRatioField string `json:"aspectRatioField,omitempty"`
	// 分辨率字段名
	ResolutionField string `json:"resolutionField,omitempty"`

	// === 参考素材字段 ===
	// 参考图字段名，默认 "images" 或 "input_reference"
	ReferenceImagesField string `json:"referenceImagesField,omitempty"`
	// 参考视频字段名
	ReferenceVideosField string `json:"referenceVideosField,omitempty"`
	// 参考音频字段名
	ReferenceAudiosField string `json:"referenceAudiosField,omitempty"`
	// 首帧字段名
	FirstFrameField string `json:"firstFrameField,omitempty"`
	// 尾帧字段名
	LastFrameField string `json:"lastFrameField,omitempty"`
	// 模式字段名（如 "mode"，用于区分 references/frames 模式）
	ModeField string `json:"modeField,omitempty"`
	// frames 模式的值
	FramesModeValue string `json:"framesModeValue,omitempty"`

	// === 默认参数 ===
	// 默认请求参数（JSON），会合并到每个请求体中
	DefaultRequestParams map[string]any `json:"defaultRequestParams,omitempty"`

	// === 输入 Schema ===
	// 图片输入配置
	ImageInput *VideoChannelInputConfig `json:"imageInput,omitempty"`
	// 视频输入配置
	VideoInput *VideoChannelInputConfig `json:"videoInput,omitempty"`
	// 音频输入配置
	AudioInput *VideoChannelInputConfig `json:"audioInput,omitempty"`
}

// VideoChannelInputConfig 渠道输入素材配置。
type VideoChannelInputConfig struct {
	Enabled bool   `json:"enabled"`
	Min     int    `json:"min"`
	Max     int    `json:"max"`
	Field   string `json:"field,omitempty"`
	// 图片角色：reference、firstFrame、lastFrame、keyframe
	Roles []string `json:"roles,omitempty"`
	// 是否需要图床（base64→URL 转换）
	RequireImageHost bool `json:"requireImageHost,omitempty"`
}

// ChannelFieldMapping 自定义请求体中素材字段的名称。
type ChannelFieldMapping struct {
	// 单图片字段名，如 "image"；默认 "image"。
	Image string `json:"image,omitempty"`
	// 多图片字段名，如 "images"、"image_urls"；默认 "image_urls"。
	Images string `json:"images,omitempty"`
	// 视频参考字段名，如 "reference_videos"；默认 "reference_videos"。
	ReferenceVideos string `json:"referenceVideos,omitempty"`
	// 音频参考字段名，如 "reference_audios"；默认 "reference_audios"。
	ReferenceAudios string `json:"referenceAudios,omitempty"`
	// 多图片字段数据类型："string"（单个字符串）或 "array"（数组），默认 "array"。
	ImagesType string `json:"imagesType,omitempty"`
}

// ModelCost 模型算力点配置。
type ModelCost struct {
	Model   string `json:"model"`
	Credits int    `json:"credits"`
	Alias   string `json:"alias"`
}

// PublicModelChannelSetting 公开模型渠道配置。
type PublicModelChannelSetting struct {
	AvailableModels    []string    `json:"availableModels"`
	ModelCosts         []ModelCost `json:"modelCosts"`
	DefaultModel       string      `json:"defaultModel"`
	DefaultImageModel  string      `json:"defaultImageModel"`
	DefaultVideoModel  string      `json:"defaultVideoModel"`
	DefaultTextModel   string      `json:"defaultTextModel"`
	SystemPrompt       string      `json:"systemPrompt"`
	AllowCustomChannel *bool       `json:"allowCustomChannel"`
}

// PublicSetting 公开配置。
type PublicSetting struct {
	ModelChannel PublicModelChannelSetting `json:"modelChannel"`
	Auth         PublicAuthSetting         `json:"auth"`
}

type PublicAuthSetting struct {
	AllowRegister *bool                    `json:"allowRegister"`
	LinuxDo       PublicLinuxDoAuthSetting `json:"linuxDo"`
}

type PublicLinuxDoAuthSetting struct {
	Enabled bool `json:"enabled"`
}

// PrivateSetting 私有配置。
type PrivateSetting struct {
	Channels   []ModelChannel     `json:"channels"`
	PromptSync PromptSyncSetting  `json:"promptSync"`
	Auth       PrivateAuthSetting `json:"auth"`
}

// PromptSyncSetting 提示词定时同步配置。
type PromptSyncSetting struct {
	Enabled *bool  `json:"enabled"`
	Cron    string `json:"cron"`
}

type PrivateAuthSetting struct {
	LinuxDo PrivateLinuxDoAuthSetting `json:"linuxDo"`
}

type PrivateLinuxDoAuthSetting struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// Setting 系统配置。
type Setting struct {
	Key       SettingKey      `json:"key" gorm:"primaryKey"`
	Value     json.RawMessage `json:"value" gorm:"serializer:json"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// Settings 系统公开和私有配置。
type Settings struct {
	Public  PublicSetting  `json:"public"`
	Private PrivateSetting `json:"private"`
}
