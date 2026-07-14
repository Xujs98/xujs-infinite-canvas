package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

// AdminGetSystemSettings 获取系统配置。
func AdminGetSystemSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

// PublicSystemSettings 公开的系统设置（不需要鉴权）。
type PublicSystemSettings struct {
	SiteName               string `json:"siteName"`
	SiteSubtitle           string `json:"siteSubtitle"`
	SiteLogo               string `json:"siteLogo"`
	ServiceContact         string `json:"serviceContact"`
	InviteRewardCredits    int    `json:"inviteRewardCredits"`
	AllowCustomChannel     bool   `json:"allowCustomChannel"`
	CheckInEnabled         bool   `json:"checkInEnabled"`
	CheckInRewardMin       int    `json:"checkInRewardMin"`
	CheckInRewardMax       int    `json:"checkInRewardMax"`
	VideoMaxTimeoutSeconds int    `json:"videoMaxTimeoutSeconds"`
	AgentEnabled           bool   `json:"agentEnabled"`
	AgentVisible           bool   `json:"agentVisible"`
	AgentAccessLevel       string `json:"agentAccessLevel"`
	AssistantEnabled       bool   `json:"assistantEnabled"`
	AppErrorMessagePrefix  string `json:"appErrorMessagePrefix"`
	AppErrorShowDetails    bool   `json:"appErrorShowDetails"`
}

// GetPublicSystemSettings 获取公开的系统设置。
func GetPublicSystemSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, PublicSystemSettings{
		SiteName:               settings.SiteName,
		SiteSubtitle:           settings.SiteSubtitle,
		SiteLogo:               settings.SiteLogo,
		ServiceContact:         settings.ServiceContact,
		InviteRewardCredits:    settings.InviteRewardCredits,
		AllowCustomChannel:     settings.AllowCustomChannel,
		CheckInEnabled:         settings.CheckInEnabled,
		CheckInRewardMin:       settings.CheckInRewardMin,
		CheckInRewardMax:       settings.CheckInRewardMax,
		VideoMaxTimeoutSeconds: settings.VideoMaxTimeoutSeconds,
		AgentEnabled:           settings.AgentEnabled,
		AgentVisible:           settings.AgentVisible,
		AgentAccessLevel:       settings.AgentAccessLevel,
		AssistantEnabled:       settings.AssistantEnabled,
		AppErrorMessagePrefix:  settings.AppErrorMessagePrefix,
		AppErrorShowDetails:    settings.AppErrorShowDetails,
	})
}

// AdminSaveSystemSettings 保存系统配置。
func AdminSaveSystemSettings(w http.ResponseWriter, r *http.Request) {
	var request model.SystemSettings
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if err := service.SaveSystemSettings(request); err != nil {
		FailError(w, err)
		return
	}

	// 保存后推送最新设置给所有 WebSocket 客户端
	settings, settingsErr := service.GetSystemSettings()
	if settingsErr == nil {
		ws.DefaultHub.BroadcastJSON(map[string]any{
			"type": "system-settings-changed",
			"data": PublicSystemSettings{
				SiteName:               settings.SiteName,
				SiteSubtitle:           settings.SiteSubtitle,
				SiteLogo:               settings.SiteLogo,
				ServiceContact:         settings.ServiceContact,
				InviteRewardCredits:    settings.InviteRewardCredits,
				AllowCustomChannel:     settings.AllowCustomChannel,
				CheckInEnabled:         settings.CheckInEnabled,
				CheckInRewardMin:       settings.CheckInRewardMin,
				CheckInRewardMax:       settings.CheckInRewardMax,
				VideoMaxTimeoutSeconds: settings.VideoMaxTimeoutSeconds,
				AgentEnabled:           settings.AgentEnabled,
				AgentVisible:           settings.AgentVisible,
				AgentAccessLevel:       settings.AgentAccessLevel,
				AssistantEnabled:       settings.AssistantEnabled,
				AppErrorMessagePrefix:  settings.AppErrorMessagePrefix,
				AppErrorShowDetails:    settings.AppErrorShowDetails,
			},
		})
	}
	// 推送渠道变更
	rawChannels, channelsErr := service.GetRawPrivateChannels()
	if channelsErr == nil {
		var channels []PublicChannelInfo
		for _, ch := range rawChannels {
			if !ch.Enabled {
				continue
			}
			channels = append(channels, channelToPublic(ch))
		}
		ws.DefaultHub.BroadcastJSON(map[string]any{
			"type": "channels-changed",
			"data": channels,
		})
	}
	// 推送模型分类变更
	classifications, clsErr := service.GetAllModelClassificationsList()
	if clsErr == nil {
		ws.DefaultHub.BroadcastJSON(map[string]any{
			"type": "model-classifications-changed",
			"data": classifications,
		})
	}

	OK(w, true)
}
