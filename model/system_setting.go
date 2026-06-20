package model

// SystemSetting 系统配置键值对。
type SystemSetting struct {
	Key       string `json:"key" gorm:"primaryKey"`
	Value     string `json:"value" gorm:"type:text"`
	UpdatedAt string `json:"updatedAt"`
}

// 预定义的系统配置键。
const (
	SettingSiteName              = "site_name"
	SettingSiteSubtitle          = "site_subtitle"
	SettingSiteLogo              = "site_logo"
	SettingServiceContact        = "service_contact"
	SettingRegisterGiftCredits   = "register_gift_credits"
	SettingEmailEnabled          = "email_enabled"
	SettingSMTPHost              = "smtp_host"
	SettingSMTPPort              = "smtp_port"
	SettingSMTPUsername          = "smtp_username"
	SettingSMTPPassword          = "smtp_password"
	SettingSMTPFrom              = "smtp_from"
	SettingSMTPTLS               = "smtp_tls"
	SettingMembershipReminder    = "membership_reminder"
	SettingEmailTemplateWelcome  = "email_template_welcome"
	SettingEmailTemplateReminder = "email_template_reminder"
	SettingAllowCustomChannel    = "allow_custom_channel"
	SettingAllowRegister         = "allow_register"
	SettingAgentEnabled          = "agent_enabled"
	SettingAgentVisible          = "agent_visible"
	SettingAgentAccessLevel      = "agent_access_level" // "all" | "registered" | "member"
	SettingAssistantEnabled      = "assistant_enabled"
)

// SystemSettings 所有配置的聚合结构，方便前端一次性读取。
type SystemSettings struct {
	SiteName              string `json:"siteName"`
	SiteSubtitle          string `json:"siteSubtitle"`
	SiteLogo              string `json:"siteLogo"`
	ServiceContact        string `json:"serviceContact"`
	RegisterGiftCredits   int    `json:"registerGiftCredits"`
	AllowCustomChannel    bool   `json:"allowCustomChannel"`
	AllowRegister         bool   `json:"allowRegister"`
	AgentEnabled          bool   `json:"agentEnabled"`
	AgentVisible          bool   `json:"agentVisible"`
	AgentAccessLevel      string `json:"agentAccessLevel"`
	AssistantEnabled      bool   `json:"assistantEnabled"`
	EmailEnabled          bool   `json:"emailEnabled"`
	SMTPHost              string `json:"smtpHost"`
	SMTPPort              int    `json:"smtpPort"`
	SMTPUsername          string `json:"smtpUsername"`
	SMTPPassword          string `json:"smtpPassword"`
	SMTPFrom              string `json:"smtpFrom"`
	SMTPTLS               bool   `json:"smtpTLS"`
	MembershipReminder    bool   `json:"membershipReminder"`
	EmailTemplateWelcome  string `json:"emailTemplateWelcome"`
	EmailTemplateReminder string `json:"emailTemplateReminder"`
}
