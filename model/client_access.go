package model

type AccessBanKind string

const (
	AccessBanIP     AccessBanKind = "ip"
	AccessBanDevice AccessBanKind = "device"
)

// ClientAccessRecord stores successful user access observations. DeviceCode is
// empty for browser clients that do not expose an App device identity.
type ClientAccessRecord struct {
	ID          string `json:"id" gorm:"primaryKey"`
	UserID      string `json:"userId" gorm:"index;uniqueIndex:idx_client_access_identity"`
	IPAddress   string `json:"ipAddress" gorm:"index;uniqueIndex:idx_client_access_identity"`
	DeviceCode  string `json:"deviceCode" gorm:"index;uniqueIndex:idx_client_access_identity"`
	ClientType  string `json:"clientType" gorm:"uniqueIndex:idx_client_access_identity"`
	AppVersion  string `json:"appVersion"`
	OSName      string `json:"osName"`
	OSVersion   string `json:"osVersion"`
	UserAgent   string `json:"userAgent" gorm:"type:text"`
	SeenCount   int    `json:"seenCount"`
	FirstSeenAt string `json:"firstSeenAt"`
	LastSeenAt  string `json:"lastSeenAt" gorm:"index"`
}

// AccessBan is global: once an IP or device code is blocked, it applies to
// every non-admin user until an administrator removes the ban.
type AccessBan struct {
	ID        string        `json:"id" gorm:"primaryKey"`
	Kind      AccessBanKind `json:"kind" gorm:"uniqueIndex:idx_access_ban_value"`
	Value     string        `json:"value" gorm:"uniqueIndex:idx_access_ban_value"`
	Reason    string        `json:"reason"`
	CreatedBy string        `json:"createdBy"`
	CreatedAt string        `json:"createdAt"`
	UpdatedAt string        `json:"updatedAt"`
}

type AdminUserIPRecord struct {
	IPAddress   string   `json:"ipAddress"`
	Blocked     bool     `json:"blocked"`
	ClientTypes []string `json:"clientTypes"`
	DeviceCount int      `json:"deviceCount"`
	SeenCount   int      `json:"seenCount"`
	FirstSeenAt string   `json:"firstSeenAt"`
	LastSeenAt  string   `json:"lastSeenAt"`
}

type AdminUserDeviceRecord struct {
	DeviceCode  string   `json:"deviceCode"`
	Blocked     bool     `json:"blocked"`
	IPAddresses []string `json:"ipAddresses"`
	AppVersion  string   `json:"appVersion"`
	OSName      string   `json:"osName"`
	OSVersion   string   `json:"osVersion"`
	SeenCount   int      `json:"seenCount"`
	FirstSeenAt string   `json:"firstSeenAt"`
	LastSeenAt  string   `json:"lastSeenAt"`
}

type ClientAccessDecision struct {
	Blocked bool          `json:"blocked"`
	Kind    AccessBanKind `json:"kind,omitempty"`
	Message string        `json:"message,omitempty"`
}
