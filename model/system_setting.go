package model

// SystemSetting 系统配置键值对。
type SystemSetting struct {
	Key       string `json:"key" gorm:"primaryKey"`
	Value     string `json:"value" gorm:"type:text"`
	UpdatedAt string `json:"updatedAt"`
}

// 预定义的系统配置键。
const (
	SettingSiteName                 = "site_name"
	SettingSiteSubtitle             = "site_subtitle"
	SettingSiteLogo                 = "site_logo"
	SettingServiceContact           = "service_contact"
	SettingRegisterGiftCredits      = "register_gift_credits"
	SettingInviteRewardCredits      = "invite_reward_credits"
	SettingEmailEnabled             = "email_enabled"
	SettingSMTPHost                 = "smtp_host"
	SettingSMTPPort                 = "smtp_port"
	SettingSMTPUsername             = "smtp_username"
	SettingSMTPPassword             = "smtp_password"
	SettingSMTPFrom                 = "smtp_from"
	SettingSMTPTLS                  = "smtp_tls"
	SettingMembershipReminder       = "membership_reminder"
	SettingEmailTemplateWelcome     = "email_template_welcome"
	SettingEmailTemplateReminder    = "email_template_reminder"
	SettingAllowCustomChannel       = "allow_custom_channel"
	SettingAllowRegister            = "allow_register"
	SettingAgentEnabled             = "agent_enabled"
	SettingAgentVisible             = "agent_visible"
	SettingAgentAccessLevel         = "agent_access_level" // "all" | "registered" | "member"
	SettingAssistantEnabled         = "assistant_enabled"
	SettingCheckInEnabled           = "check_in_enabled"
	SettingCheckInRewardMin         = "check_in_reward_min"
	SettingCheckInRewardMax         = "check_in_reward_max"
	SettingVideoMaxTimeoutSeconds   = "video_max_timeout_seconds"
	SettingAppErrorMessagePrefix    = "app_error_message_prefix"
	SettingAppErrorShowDetails      = "app_error_show_details"
	SettingAppErrorMessages         = "app_error_messages"
	SettingRequestLogCleanupEnabled = "request_log_cleanup_enabled"
	SettingRequestLogRetentionDays  = "request_log_retention_days"
	SettingRequestLogMaxRows        = "request_log_max_rows"
	SettingCallLogCleanupEnabled    = "call_log_cleanup_enabled"
	SettingCallLogRetentionDays     = "call_log_retention_days"
	SettingCallLogMaxRows           = "call_log_max_rows"
	SettingCreditLogCleanupEnabled  = "credit_log_cleanup_enabled"
	SettingCreditLogRetentionDays   = "credit_log_retention_days"
	SettingCreditLogMaxRows         = "credit_log_max_rows"
	SettingUserCreditLogVisibleRows = "user_credit_log_visible_rows"
)

const (
	DefaultSiteName = "矩龙画布"
	DefaultSiteLogo = "/logo.png"
)

// SystemSettings 所有配置的聚合结构，方便前端一次性读取。
type SystemSettings struct {
	SiteName                 string            `json:"siteName"`
	SiteSubtitle             string            `json:"siteSubtitle"`
	SiteLogo                 string            `json:"siteLogo"`
	ServiceContact           string            `json:"serviceContact"`
	RegisterGiftCredits      int               `json:"registerGiftCredits"`
	InviteRewardCredits      int               `json:"inviteRewardCredits"`
	AllowCustomChannel       bool              `json:"allowCustomChannel"`
	AllowRegister            bool              `json:"allowRegister"`
	AgentEnabled             bool              `json:"agentEnabled"`
	AgentVisible             bool              `json:"agentVisible"`
	AgentAccessLevel         string            `json:"agentAccessLevel"`
	AssistantEnabled         bool              `json:"assistantEnabled"`
	CheckInEnabled           bool              `json:"checkInEnabled"`
	CheckInRewardMin         int               `json:"checkInRewardMin"`
	CheckInRewardMax         int               `json:"checkInRewardMax"`
	VideoMaxTimeoutSeconds   int               `json:"videoMaxTimeoutSeconds"`
	AppErrorMessagePrefix    string            `json:"appErrorMessagePrefix"`
	AppErrorShowDetails      bool              `json:"appErrorShowDetails"`
	AppErrorMessages         map[string]string `json:"appErrorMessages"`
	RequestLogCleanupEnabled bool              `json:"requestLogCleanupEnabled"`
	RequestLogRetentionDays  int               `json:"requestLogRetentionDays"`
	RequestLogMaxRows        int               `json:"requestLogMaxRows"`
	CallLogCleanupEnabled    bool              `json:"callLogCleanupEnabled"`
	CallLogRetentionDays     int               `json:"callLogRetentionDays"`
	CallLogMaxRows           int               `json:"callLogMaxRows"`
	CreditLogCleanupEnabled  bool              `json:"creditLogCleanupEnabled"`
	CreditLogRetentionDays   int               `json:"creditLogRetentionDays"`
	CreditLogMaxRows         int               `json:"creditLogMaxRows"`
	UserCreditLogVisibleRows int               `json:"userCreditLogVisibleRows"`
	EmailEnabled             bool              `json:"emailEnabled"`
	SMTPHost                 string            `json:"smtpHost"`
	SMTPPort                 int               `json:"smtpPort"`
	SMTPUsername             string            `json:"smtpUsername"`
	SMTPPassword             string            `json:"smtpPassword"`
	SMTPFrom                 string            `json:"smtpFrom"`
	SMTPTLS                  bool              `json:"smtpTLS"`
	MembershipReminder       bool              `json:"membershipReminder"`
	EmailTemplateWelcome     string            `json:"emailTemplateWelcome"`
	EmailTemplateReminder    string            `json:"emailTemplateReminder"`
}

// DefaultAppErrorMessages 是 App 客户可见错误文案的服务端默认值。
func DefaultAppErrorMessages() map[string]string {
	return map[string]string{
		"default":        "操作失败，请稍后重试或联系管理员",
		"generation":     "生成失败，请联系管理员",
		"network":        "网络连接失败，请检查网络后重试",
		"timeout":        "请求超时，请稍后重试",
		"authentication": "登录状态已失效，请重新登录",
		"permission":     "当前账号没有执行此操作的权限",
		"credits":        "算力点不足，请充值或购买订阅套餐",
		"validation":     "提交内容不符合要求，请检查后重试",
		"upload":         "素材上传失败，请稍后重试",
		"download":       "结果下载失败，请稍后重试",
		"service":        "服务暂时不可用，请稍后重试",
	}
}
