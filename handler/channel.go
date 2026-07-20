package handler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

// PublicChannelInfo only contains the non-secret model metadata needed by the
// App. Requests for these channels are always proxied by this service.
type PublicChannelInfo struct {
	ConfigHash             string                     `json:"configHash,omitempty"`
	Protocol               string                     `json:"protocol"`
	Name                   string                     `json:"name"`
	BaseURL                string                     `json:"baseUrl,omitempty"`
	APIKey                 string                     `json:"apiKey,omitempty"`
	Models                 []string                   `json:"models"`
	Enabled                bool                       `json:"enabled"`
	PathPrefix             string                     `json:"pathPrefix,omitempty"`
	ExtraHeaders           map[string]string          `json:"extraHeaders,omitempty"`
	ExtraBody              map[string]any             `json:"extraBody,omitempty"`
	ImageFormat            string                     `json:"imageFormat,omitempty"`
	FieldMapping           *model.ChannelFieldMapping `json:"fieldMapping,omitempty"`
	VideoConfig            *model.ChannelVideoConfig  `json:"videoConfig,omitempty"`
	MediaType              string                     `json:"mediaType,omitempty"`
	ApiStyle               string                     `json:"apiStyle,omitempty"`
	EndpointPath           string                     `json:"endpointPath,omitempty"`
	ResponseFormat         string                     `json:"responseFormat,omitempty"`
	SupportedResolutions   []string                   `json:"supportedResolutions,omitempty"`
	SupportedModelVersions []string                   `json:"supportedModelVersions,omitempty"`
	SupportsWebSearch      bool                       `json:"supportsWebSearch,omitempty"`
}

// PublicAvailableModels 返回模型列表和默认模型配置。
type PublicAvailableModels struct {
	AvailableModels   []string          `json:"availableModels"`
	ModelCosts        []model.ModelCost `json:"modelCosts"`
	DefaultModel      string            `json:"defaultModel"`
	DefaultImageModel string            `json:"defaultImageModel"`
	DefaultVideoModel string            `json:"defaultVideoModel"`
	DefaultTextModel  string            `json:"defaultTextModel"`
}

// channelToPublic deliberately excludes credentials, upstream origins and
// custom headers/body values. Those values never need to cross the trust
// boundary because the Go service performs the upstream request.
func channelToPublic(ch model.ModelChannel) PublicChannelInfo {
	var videoConfig *model.ChannelVideoConfig
	if ch.VideoConfig != nil {
		copy := *ch.VideoConfig
		copy.Path = ""
		copy.StatusEndpointPath = ""
		copy.ContentEndpointPath = ""
		copy.Method = "POST"
		copy.StatusMethod = "GET"
		videoConfig = &copy
	}
	result := PublicChannelInfo{
		Protocol:               ch.Protocol,
		Name:                   ch.Name,
		Models:                 ch.Models,
		Enabled:                ch.Enabled,
		ImageFormat:            ch.ImageFormat,
		FieldMapping:           ch.FieldMapping,
		VideoConfig:            videoConfig,
		MediaType:              ch.MediaType,
		ApiStyle:               ch.ApiStyle,
		ResponseFormat:         ch.ResponseFormat,
		SupportedResolutions:   ch.SupportedResolutions,
		SupportedModelVersions: ch.SupportedModelVersions,
		SupportsWebSearch:      ch.SupportsWebSearch,
	}
	publicJSON, _ := json.Marshal(result)
	result.ConfigHash = fmt.Sprintf("%x", sha256.Sum256(publicJSON))
	return result
}

// GetPublicChannels 获取已登录用户可使用的模型渠道列表。
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
		ModelCosts:        public.ModelChannel.ModelCosts,
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
