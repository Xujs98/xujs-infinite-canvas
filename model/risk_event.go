package model

import "time"

type RiskLevel string
type RiskStatus string

const (
	RiskLevelLow      RiskLevel = "low"
	RiskLevelMedium   RiskLevel = "medium"
	RiskLevelHigh     RiskLevel = "high"
	RiskLevelCritical RiskLevel = "critical"

	RiskStatusOpen     RiskStatus = "open"
	RiskStatusResolved RiskStatus = "resolved"
	RiskStatusIgnored  RiskStatus = "ignored"
)

// RiskEvent stores a sanitized security signal. Detail must never contain
// passwords, verification codes, API keys, prompts, or media payloads.
type RiskEvent struct {
	ID              string     `json:"id" gorm:"primaryKey"`
	UserID          string     `json:"userId" gorm:"index"`
	Username        string     `json:"username" gorm:"index"`
	EventType       string     `json:"eventType" gorm:"index"`
	Level           RiskLevel  `json:"level" gorm:"index"`
	Status          RiskStatus `json:"status" gorm:"index"`
	Source          string     `json:"source" gorm:"index"`
	IPAddress       string     `json:"ipAddress" gorm:"index"`
	DeviceCode      string     `json:"deviceCode" gorm:"index"`
	ClientType      string     `json:"clientType"`
	AppVersion      string     `json:"appVersion"`
	Path            string     `json:"path" gorm:"index"`
	Summary         string     `json:"summary"`
	Detail          string     `json:"detail" gorm:"type:text"`
	OccurrenceCount int        `json:"occurrenceCount"`
	FirstSeenAt     time.Time  `json:"firstSeenAt" gorm:"index"`
	LastSeenAt      time.Time  `json:"lastSeenAt" gorm:"index"`
	ResolvedBy      string     `json:"resolvedBy"`
	ResolvedAt      *time.Time `json:"resolvedAt"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type RiskEventList struct {
	Items []RiskEvent `json:"items"`
	Total int64       `json:"total"`
}

type RiskEventStats struct {
	Open     int64 `json:"open"`
	HighRisk int64 `json:"highRisk"`
	Today    int64 `json:"today"`
}
