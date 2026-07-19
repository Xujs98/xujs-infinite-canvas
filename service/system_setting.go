package service

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

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
	requestLogRetentionDays := intSetting(m, model.SettingRequestLogRetentionDays, defaultRequestLogRetentionDays)
	requestLogMaxRows := intSetting(m, model.SettingRequestLogMaxRows, defaultRequestLogMaxRows)
	callLogRetentionDays := intSetting(m, model.SettingCallLogRetentionDays, defaultCallLogRetentionDays)
	callLogMaxRows := intSetting(m, model.SettingCallLogMaxRows, defaultCallLogMaxRows)
	creditLogRetentionDays := intSetting(m, model.SettingCreditLogRetentionDays, defaultCreditLogRetentionDays)
	creditLogMaxRows := intSetting(m, model.SettingCreditLogMaxRows, defaultCreditLogMaxRows)
	userCreditLogVisibleRows, _ := strconv.Atoi(m[model.SettingUserCreditLogVisibleRows])
	appErrorMessages := model.DefaultAppErrorMessages()
	if raw := strings.TrimSpace(m[model.SettingAppErrorMessages]); raw != "" {
		var stored map[string]string
		if json.Unmarshal([]byte(raw), &stored) == nil {
			for key, value := range stored {
				if trimmed := strings.TrimSpace(value); trimmed != "" {
					appErrorMessages[key] = trimmed
				}
			}
		}
	}
	smtpPort, _ := strconv.Atoi(m[model.SettingSMTPPort])
	siteName := strings.TrimSpace(m[model.SettingSiteName])
	if siteName == "" {
		siteName = model.DefaultSiteName
	}
	siteLogo := strings.TrimSpace(m[model.SettingSiteLogo])
	if siteLogo == "" {
		siteLogo = model.DefaultSiteLogo
	}
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
	minioConfig := minIOStorageConfigFromMap(m)
	minioConfig.SecretConfigured = strings.TrimSpace(minioConfig.SecretKey) != ""
	minioConfig.SecretKey = ""
	return model.SystemSettings{
		SiteName:                 siteName,
		SiteSubtitle:             m[model.SettingSiteSubtitle],
		SiteLogo:                 siteLogo,
		ServiceContact:           m[model.SettingServiceContact],
		RegisterGiftCredits:      giftCredits,
		InviteRewardCredits:      inviteRewardCredits,
		CheckInEnabled:           m[model.SettingCheckInEnabled] == "true" || m[model.SettingCheckInEnabled] == "",
		CheckInRewardMin:         checkInRewardMin,
		CheckInRewardMax:         checkInRewardMax,
		VideoMaxTimeoutSeconds:   videoMaxTimeoutSeconds,
		AppErrorMessagePrefix:    m[model.SettingAppErrorMessagePrefix],
		AppErrorShowDetails:      m[model.SettingAppErrorShowDetails] == "true" || m[model.SettingAppErrorShowDetails] == "",
		AppErrorMessages:         appErrorMessages,
		RequestLogCleanupEnabled: m[model.SettingRequestLogCleanupEnabled] == "true" || m[model.SettingRequestLogCleanupEnabled] == "",
		RequestLogRetentionDays:  requestLogRetentionDays,
		RequestLogMaxRows:        requestLogMaxRows,
		CallLogCleanupEnabled:    m[model.SettingCallLogCleanupEnabled] == "true",
		CallLogRetentionDays:     callLogRetentionDays,
		CallLogMaxRows:           callLogMaxRows,
		CreditLogCleanupEnabled:  m[model.SettingCreditLogCleanupEnabled] == "true",
		CreditLogRetentionDays:   creditLogRetentionDays,
		CreditLogMaxRows:         creditLogMaxRows,
		UserCreditLogVisibleRows: userCreditLogVisibleRows,
		AllowCustomChannel:       allowCustomChannel,
		AllowRegister:            allowRegister,
		AgentEnabled:             m[model.SettingAgentEnabled] == "true",
		AgentVisible:             m[model.SettingAgentVisible] == "true",
		AgentAccessLevel:         m[model.SettingAgentAccessLevel],
		AssistantEnabled:         m[model.SettingAssistantEnabled] == "true" || m[model.SettingAssistantEnabled] == "",
		EmailEnabled:             m[model.SettingEmailEnabled] == "true",
		SMTPHost:                 m[model.SettingSMTPHost],
		SMTPPort:                 smtpPort,
		SMTPUsername:             m[model.SettingSMTPUsername],
		SMTPPassword:             m[model.SettingSMTPPassword],
		SMTPFrom:                 m[model.SettingSMTPFrom],
		SMTPTLS:                  m[model.SettingSMTPTLS] == "true",
		MembershipReminder:       m[model.SettingMembershipReminder] == "true",
		EmailTemplateWelcome:     m[model.SettingEmailTemplateWelcome],
		EmailTemplateReminder:    m[model.SettingEmailTemplateReminder],
		MinIOStorage:             minioConfig,
	}, nil
}

// SaveSystemSettings 保存系统配置。
func SaveSystemSettings(input model.SystemSettings) error {
	existingSettings, err := repository.GetSystemSettings()
	if err != nil {
		return err
	}
	minioConfig := input.MinIOStorage
	if strings.TrimSpace(minioConfig.SecretKey) == "" {
		minioConfig.SecretKey = existingSettings[model.SettingMinIOSecretKey]
	}
	applyMinIOStorageDefaults(&minioConfig)
	if err := validateMinIOStorageConfig(minioConfig, minioConfig.Enabled); err != nil {
		return err
	}
	if err := normalizeLogCleanupSettings(&input); err != nil {
		return err
	}
	if err := normalizeAppErrorMessages(&input); err != nil {
		return err
	}
	appErrorMessagesJSON, err := json.Marshal(input.AppErrorMessages)
	if err != nil {
		return fmt.Errorf("序列化 App 错误文案失败: %w", err)
	}
	m := map[string]string{
		model.SettingSiteName:                 input.SiteName,
		model.SettingSiteSubtitle:             input.SiteSubtitle,
		model.SettingSiteLogo:                 input.SiteLogo,
		model.SettingServiceContact:           input.ServiceContact,
		model.SettingRegisterGiftCredits:      strconv.Itoa(input.RegisterGiftCredits),
		model.SettingInviteRewardCredits:      strconv.Itoa(input.InviteRewardCredits),
		model.SettingCheckInEnabled:           boolStr(input.CheckInEnabled),
		model.SettingCheckInRewardMin:         strconv.Itoa(input.CheckInRewardMin),
		model.SettingCheckInRewardMax:         strconv.Itoa(input.CheckInRewardMax),
		model.SettingVideoMaxTimeoutSeconds:   strconv.Itoa(input.VideoMaxTimeoutSeconds),
		model.SettingAppErrorMessagePrefix:    input.AppErrorMessagePrefix,
		model.SettingAppErrorShowDetails:      boolStr(input.AppErrorShowDetails),
		model.SettingAppErrorMessages:         string(appErrorMessagesJSON),
		model.SettingRequestLogCleanupEnabled: boolStr(input.RequestLogCleanupEnabled),
		model.SettingRequestLogRetentionDays:  strconv.Itoa(input.RequestLogRetentionDays),
		model.SettingRequestLogMaxRows:        strconv.Itoa(input.RequestLogMaxRows),
		model.SettingCallLogCleanupEnabled:    boolStr(input.CallLogCleanupEnabled),
		model.SettingCallLogRetentionDays:     strconv.Itoa(input.CallLogRetentionDays),
		model.SettingCallLogMaxRows:           strconv.Itoa(input.CallLogMaxRows),
		model.SettingCreditLogCleanupEnabled:  boolStr(input.CreditLogCleanupEnabled),
		model.SettingCreditLogRetentionDays:   strconv.Itoa(input.CreditLogRetentionDays),
		model.SettingCreditLogMaxRows:         strconv.Itoa(input.CreditLogMaxRows),
		model.SettingUserCreditLogVisibleRows: strconv.Itoa(input.UserCreditLogVisibleRows),
		model.SettingAllowCustomChannel:       boolStr(input.AllowCustomChannel),
		model.SettingAllowRegister:            boolStr(input.AllowRegister),
		model.SettingAgentEnabled:             boolStr(input.AgentEnabled),
		model.SettingAgentVisible:             boolStr(input.AgentVisible),
		model.SettingAgentAccessLevel:         input.AgentAccessLevel,
		model.SettingAssistantEnabled:         boolStr(input.AssistantEnabled),
		model.SettingEmailEnabled:             boolStr(input.EmailEnabled),
		model.SettingSMTPHost:                 input.SMTPHost,
		model.SettingSMTPPort:                 strconv.Itoa(input.SMTPPort),
		model.SettingSMTPUsername:             input.SMTPUsername,
		model.SettingSMTPPassword:             input.SMTPPassword,
		model.SettingSMTPFrom:                 input.SMTPFrom,
		model.SettingSMTPTLS:                  boolStr(input.SMTPTLS),
		model.SettingMembershipReminder:       boolStr(input.MembershipReminder),
		model.SettingEmailTemplateWelcome:     input.EmailTemplateWelcome,
		model.SettingEmailTemplateReminder:    input.EmailTemplateReminder,
		model.SettingMinIOEnabled:             boolStr(minioConfig.Enabled),
		model.SettingMinIOEndpoint:            minioConfig.Endpoint,
		model.SettingMinIOBucket:              minioConfig.Bucket,
		model.SettingMinIORegion:              minioConfig.Region,
		model.SettingMinIOAccessKey:           minioConfig.AccessKey,
		model.SettingMinIOSecretKey:           minioConfig.SecretKey,
		model.SettingMinIOUseSSL:              boolStr(minioConfig.UseSSL),
		model.SettingMinIOUsePathStyle:        boolStr(minioConfig.UsePathStyle),
		model.SettingMinIOGeneratedPrefix:     minioConfig.GeneratedPrefix,
		model.SettingMinIOCanvasPrefix:        minioConfig.CanvasPrefix,
		model.SettingMinIOPresignedURLExpiry:  strconv.Itoa(minioConfig.PresignedURLExpirySeconds),
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

func normalizeAppErrorMessages(input *model.SystemSettings) error {
	defaults := model.DefaultAppErrorMessages()
	if input.AppErrorMessages == nil {
		input.AppErrorMessages = defaults
		return nil
	}
	for key, fallback := range defaults {
		value := strings.TrimSpace(input.AppErrorMessages[key])
		if value == "" {
			value = fallback
		}
		if len([]rune(value)) > 200 {
			return fmt.Errorf("App 错误文案 %s 不能超过 200 个字符", key)
		}
		input.AppErrorMessages[key] = value
	}
	for key := range input.AppErrorMessages {
		if _, ok := defaults[key]; !ok {
			delete(input.AppErrorMessages, key)
		}
	}
	return nil
}

func normalizeLogCleanupSettings(input *model.SystemSettings) error {
	if input.RequestLogRetentionDays == 0 {
		input.RequestLogRetentionDays = defaultRequestLogRetentionDays
	}
	if input.RequestLogMaxRows == 0 {
		input.RequestLogMaxRows = defaultRequestLogMaxRows
	}
	if input.CallLogRetentionDays == 0 {
		input.CallLogRetentionDays = defaultCallLogRetentionDays
	}
	if input.CallLogMaxRows == 0 {
		input.CallLogMaxRows = defaultCallLogMaxRows
	}
	if input.CreditLogRetentionDays == 0 {
		input.CreditLogRetentionDays = defaultCreditLogRetentionDays
	}
	if input.CreditLogMaxRows == 0 {
		input.CreditLogMaxRows = defaultCreditLogMaxRows
	}
	if input.RequestLogRetentionDays < 1 || input.RequestLogRetentionDays > 3650 || input.CallLogRetentionDays < 1 || input.CallLogRetentionDays > 3650 || input.CreditLogRetentionDays < 1 || input.CreditLogRetentionDays > 3650 {
		return safeMessageError{message: "日志保留天数必须在 1 到 3650 天之间"}
	}
	if input.RequestLogMaxRows < 100 || input.RequestLogMaxRows > 1000000 || input.CallLogMaxRows < 100 || input.CallLogMaxRows > 1000000 || input.CreditLogMaxRows < 100 || input.CreditLogMaxRows > 1000000 {
		return safeMessageError{message: "日志最大保留条数必须在 100 到 1000000 条之间"}
	}
	if input.UserCreditLogVisibleRows < 0 || input.UserCreditLogVisibleRows > 1000000 {
		return safeMessageError{message: "用户可查看算力点明细条数必须在 0 到 1000000 之间"}
	}
	return nil
}

func intSetting(settings map[string]string, key string, fallback int) int {
	value, err := strconv.Atoi(settings[key])
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
