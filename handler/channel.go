package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

// PublicChannelInfo 返回给 App 端的模型渠道配置（含 API Key）。
type PublicChannelInfo struct {
	Protocol               string                       `json:"protocol"`
	Name                   string                       `json:"name"`
	BaseURL                string                       `json:"baseUrl"`
	APIKey                 string                       `json:"apiKey"`
	Models                 []string                     `json:"models"`
	Enabled                bool                         `json:"enabled"`
	PathPrefix             string                       `json:"pathPrefix,omitempty"`
	ExtraHeaders           map[string]string            `json:"extraHeaders,omitempty"`
	ExtraBody              map[string]any               `json:"extraBody,omitempty"`
	ImageFormat            string                       `json:"imageFormat,omitempty"`
	FieldMapping           *model.ChannelFieldMapping   `json:"fieldMapping,omitempty"`
	VideoConfig            *model.ChannelVideoConfig    `json:"videoConfig,omitempty"`
	MediaType              string                       `json:"mediaType,omitempty"`
	ApiStyle               string                       `json:"apiStyle,omitempty"`
	EndpointPath           string                       `json:"endpointPath,omitempty"`
	ResponseFormat         string                       `json:"responseFormat,omitempty"`
	SupportedResolutions   []string                     `json:"supportedResolutions,omitempty"`
	SupportedModelVersions []string                     `json:"supportedModelVersions,omitempty"`
	SupportsWebSearch      bool                         `json:"supportsWebSearch,omitempty"`
}

// PublicAvailableModels 返回模型列表和默认模型配置。
type PublicAvailableModels struct {
	AvailableModels   []string `json:"availableModels"`
	DefaultModel      string   `json:"defaultModel"`
	DefaultImageModel string   `json:"defaultImageModel"`
	DefaultVideoModel string   `json:"defaultVideoModel"`
	DefaultTextModel  string   `json:"defaultTextModel"`
}

// channelToPublic 将内部渠道转为公开格式（含全部字段）。
func channelToPublic(ch model.ModelChannel) PublicChannelInfo {
	return PublicChannelInfo{
		Protocol:               ch.Protocol,
		Name:                   ch.Name,
		BaseURL:                ch.BaseURL,
		APIKey:                 ch.APIKey,
		Models:                 ch.Models,
		Enabled:                ch.Enabled,
		PathPrefix:             ch.PathPrefix,
		ExtraHeaders:           ch.ExtraHeaders,
		ExtraBody:              ch.ExtraBody,
		ImageFormat:            ch.ImageFormat,
		FieldMapping:           ch.FieldMapping,
		VideoConfig:            ch.VideoConfig,
		MediaType:              ch.MediaType,
		ApiStyle:               ch.ApiStyle,
		EndpointPath:           ch.EndpointPath,
		ResponseFormat:         ch.ResponseFormat,
		SupportedResolutions:   ch.SupportedResolutions,
		SupportedModelVersions: ch.SupportedModelVersions,
		SupportsWebSearch:      ch.SupportsWebSearch,
	}
}

// GetPublicChannels 获取已登录用户的模型渠道列表（含 API Key）。
// 注意：不使用 AdminSettings（会隐藏 API Key），直接读取原始配置。
func GetPublicChannels(w http.ResponseWriter, r *http.Request) {
	channels, err := service.GetRawPrivateChannels()
	if err != nil {
		FailError(w, err)
		return
	}

	var result []PublicChannelInfo
	for _, ch := range channels {
		if !ch.Enabled {
			continue
		}
		result = append(result, channelToPublic(ch))
	}

	OK(w, result)
}

// GetPublicAvailableModels 获取公开的模型列表和默认模型配置。
func GetPublicAvailableModels(w http.ResponseWriter, r *http.Request) {
	public, err := service.PublicSettings()
	if err != nil {
		FailError(w, err)
		return
	}

	OK(w, PublicAvailableModels{
		AvailableModels:   public.ModelChannel.AvailableModels,
		DefaultModel:      public.ModelChannel.DefaultModel,
		DefaultImageModel: public.ModelChannel.DefaultImageModel,
		DefaultVideoModel: public.ModelChannel.DefaultVideoModel,
		DefaultTextModel:  public.ModelChannel.DefaultTextModel,
	})
}

// GetPublicModelClassifications 获取模型分类列表（需要登录）。
func GetPublicModelClassifications(w http.ResponseWriter, r *http.Request) {
	classifications, err := service.GetAllModelClassificationsList()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, classifications)
}
