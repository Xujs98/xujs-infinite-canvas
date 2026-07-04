package service

import (
	"strconv"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// GetSystemSettings 读取所有系统配置并聚合为结构体。
func GetSystemSettings() (model.SystemSettings, error) {
	m, err := repository.GetSystemSettings()
	if err != nil {
		return model.SystemSettings{}, err
	}
	giftCredits, _ := strconv.Atoi(m[model.SettingRegisterGiftCredits])
	inviteRewardCredits, _ := strconv.Atoi(m[model.SettingInviteRewardCredits])
	checkInRewardMin, _ := strconv.Atoi(m[model.SettingCheckInRewardMin])
	checkInRewardMax, _ := strconv.Atoi(m[model.SettingCheckInRewardMax])
	videoMaxTimeoutSeconds, _ := strconv.Atoi(m[model.SettingVideoMaxTimeoutSeconds])
	smtpPort, _ := strconv.Atoi(m[model.SettingSMTPPort])
	// 如果 system_settings 中没有这两个字段，则从 public settings 读取。
	allowCustomChannel := m[model.SettingAllowCustomChannel] == "true"
	allowRegister := m[model.SettingAllowRegister] == "true"
	if m[model.SettingAllowCustomChannel] == "" || m[model.SettingAllowRegister] == "" {
		settings, err := repository.GetSettings()
		if err == nil {
			if m[model.SettingAllowCustomChannel] == "" && settings.Public.ModelChannel.AllowCustomChannel != nil {
				allowCustomChannel = *settings.Public.ModelChannel.AllowCustomChannel
			}
			if m[model.SettingAllowRegister] == "" && settings.Public.Auth.AllowRegister != nil {
				allowRegister = *settings.Public.Auth.AllowRegister
			}
		}
	}
	return model.SystemSettings{
		SiteName:               m[model.SettingSiteName],
		SiteSubtitle:           m[model.SettingSiteSubtitle],
		SiteLogo:               m[model.SettingSiteLogo],
		ServiceContact:         m[model.SettingServiceContact],
		RegisterGiftCredits:    giftCredits,
		InviteRewardCredits:    inviteRewardCredits,
		CheckInEnabled:         m[model.SettingCheckInEnabled] == "true" || m[model.SettingCheckInEnabled] == "",
		CheckInRewardMin:       checkInRewardMin,
		CheckInRewardMax:       checkInRewardMax,
		VideoMaxTimeoutSeconds: videoMaxTimeoutSeconds,
		AppErrorMessagePrefix:  m[model.SettingAppErrorMessagePrefix],
		AppErrorShowDetails:    m[model.SettingAppErrorShowDetails] == "true" || m[model.SettingAppErrorShowDetails] == "",
		AllowCustomChannel:     allowCustomChannel,
		AllowRegister:          allowRegister,
		AgentEnabled:           m[model.SettingAgentEnabled] == "true",
		AgentVisible:           m[model.SettingAgentVisible] == "true",
		AgentAccessLevel:       m[model.SettingAgentAccessLevel],
		AssistantEnabled:       m[model.SettingAssistantEnabled] == "true" || m[model.SettingAssistantEnabled] == "",
		EmailEnabled:           m[model.SettingEmailEnabled] == "true",
		SMTPHost:               m[model.SettingSMTPHost],
		SMTPPort:               smtpPort,
		SMTPUsername:           m[model.SettingSMTPUsername],
		SMTPPassword:           m[model.SettingSMTPPassword],
		SMTPFrom:               m[model.SettingSMTPFrom],
		SMTPTLS:                m[model.SettingSMTPTLS] == "true",
		MembershipReminder:     m[model.SettingMembershipReminder] == "true",
		EmailTemplateWelcome:   m[model.SettingEmailTemplateWelcome],
		EmailTemplateReminder:  m[model.SettingEmailTemplateReminder],
	}, nil
}

// SaveSystemSettings 保存系统配置。
func SaveSystemSettings(input model.SystemSettings) error {
	m := map[string]string{
		model.SettingSiteName:               input.SiteName,
		model.SettingSiteSubtitle:           input.SiteSubtitle,
		model.SettingSiteLogo:               input.SiteLogo,
		model.SettingServiceContact:         input.ServiceContact,
		model.SettingRegisterGiftCredits:    strconv.Itoa(input.RegisterGiftCredits),
		model.SettingInviteRewardCredits:    strconv.Itoa(input.InviteRewardCredits),
		model.SettingCheckInEnabled:         boolStr(input.CheckInEnabled),
		model.SettingCheckInRewardMin:       strconv.Itoa(input.CheckInRewardMin),
		model.SettingCheckInRewardMax:       strconv.Itoa(input.CheckInRewardMax),
		model.SettingVideoMaxTimeoutSeconds: strconv.Itoa(input.VideoMaxTimeoutSeconds),
		model.SettingAppErrorMessagePrefix:  input.AppErrorMessagePrefix,
		model.SettingAppErrorShowDetails:    boolStr(input.AppErrorShowDetails),
		model.SettingAllowCustomChannel:     boolStr(input.AllowCustomChannel),
		model.SettingAllowRegister:          boolStr(input.AllowRegister),
		model.SettingAgentEnabled:           boolStr(input.AgentEnabled),
		model.SettingAgentVisible:           boolStr(input.AgentVisible),
		model.SettingAgentAccessLevel:       input.AgentAccessLevel,
		model.SettingAssistantEnabled:       boolStr(input.AssistantEnabled),
		model.SettingEmailEnabled:           boolStr(input.EmailEnabled),
		model.SettingSMTPHost:               input.SMTPHost,
		model.SettingSMTPPort:               strconv.Itoa(input.SMTPPort),
		model.SettingSMTPUsername:           input.SMTPUsername,
		model.SettingSMTPPassword:           input.SMTPPassword,
		model.SettingSMTPFrom:               input.SMTPFrom,
		model.SettingSMTPTLS:                boolStr(input.SMTPTLS),
		model.SettingMembershipReminder:     boolStr(input.MembershipReminder),
		model.SettingEmailTemplateWelcome:   input.EmailTemplateWelcome,
		model.SettingEmailTemplateReminder:  input.EmailTemplateReminder,
	}
	if err := repository.SaveSystemSettings(m); err != nil {
		return err
	}
	// 同步更新 public settings 中的对应字段。
	settings, err := repository.GetSettings()
	if err != nil {
		return err
	}
	settings.Public.ModelChannel.AllowCustomChannel = &input.AllowCustomChannel
	settings.Public.Auth.AllowRegister = &input.AllowRegister
	_, err = repository.SaveSettings(settings, now())
	return err
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
