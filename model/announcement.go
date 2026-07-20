package model

import "time"

type AnnouncementStatus string

const (
	AnnouncementStatusDraft    AnnouncementStatus = "draft"
	AnnouncementStatusActive   AnnouncementStatus = "active"
	AnnouncementStatusArchived AnnouncementStatus = "archived"
)

type AnnouncementNotifyType string

const (
	AnnouncementNotifySilent AnnouncementNotifyType = "silent"
	AnnouncementNotifyPopup  AnnouncementNotifyType = "popup"
)

type AnnouncementTarget string

const (
	AnnouncementTargetAll          AnnouncementTarget = "all"
	AnnouncementTargetWeb          AnnouncementTarget = "web"
	AnnouncementTargetApp          AnnouncementTarget = "app"
	AnnouncementTargetSubscription AnnouncementTarget = "subscription"
	// AnnouncementTargetMember is retained for announcements created before
	// the audience label was renamed to subscription users.
	AnnouncementTargetMember AnnouncementTarget = "member"
)

type Announcement struct {
	ID         string                 `json:"id" gorm:"primaryKey"`
	Title      string                 `json:"title"`
	Content    string                 `json:"content"`
	Status     AnnouncementStatus     `json:"status" gorm:"index"`
	NotifyType AnnouncementNotifyType `json:"notifyType"`
	Target     AnnouncementTarget     `json:"target" gorm:"default:'all'"`
	Pinned     bool                   `json:"pinned" gorm:"default:false"`
	StartTime  *time.Time             `json:"startTime"`
	EndTime    *time.Time             `json:"endTime"`
	CreatedAt  time.Time              `json:"createdAt"`
	UpdatedAt  time.Time              `json:"updatedAt"`
}

type AnnouncementList struct {
	Items []Announcement `json:"items"`
	Total int64          `json:"total"`
}

func (Announcement) TableName() string {
	return "announcements"
}
