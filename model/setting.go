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
}

// ChannelVideoConfig 渠道视频接口配置，用于适配不同 API 的视频生成接口。
type ChannelVideoConfig struct {
	// 视频接口路径，如 /video/generations；留空使用默认 /videos。
	Path string `json:"path,omitempty"`
	// 请求格式："" (默认 Ark 格式) 或 "openai" (OpenAI 兼容格式)。
	RequestFormat string `json:"requestFormat,omitempty"`
	// 响应格式："" (默认自动检测) 或 "openai" (OpenAI 兼容格式)。
	ResponseFormat string `json:"responseFormat,omitempty"`
	// 任务 ID 字段路径，如 "id"、"task_id"；留空自动检测。
	TaskIDField string `json:"taskIdField,omitempty"`
	// 状态字段路径，如 "status"、"data.status"；留空自动检测。
	StatusField string `json:"statusField,omitempty"`
	// 视频 URL 字段路径，如 "data.result_url"、"data.result.video_url"；留空自动检测。
	VideoURLField string `json:"videoUrlField,omitempty"`
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
