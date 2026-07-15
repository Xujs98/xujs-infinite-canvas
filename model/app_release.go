package model

import "time"

type AppReleaseStatus string

const (
	AppReleaseStatusDraft     AppReleaseStatus = "draft"
	AppReleaseStatusPublished AppReleaseStatus = "published"
)

type AppRelease struct {
	ID          string               `json:"id" gorm:"primaryKey"`
	Version     string               `json:"version" gorm:"uniqueIndex"`
	Title       string               `json:"title"`
	Notes       string               `json:"notes" gorm:"type:text"`
	Status      AppReleaseStatus     `json:"status" gorm:"index"`
	PublishedAt *time.Time           `json:"publishedAt" gorm:"index"`
	CreatedAt   time.Time            `json:"createdAt"`
	UpdatedAt   time.Time            `json:"updatedAt"`
	Artifacts   []AppReleaseArtifact `json:"artifacts" gorm:"foreignKey:ReleaseID"`
}

type AppReleaseArtifact struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	ReleaseID   string    `json:"releaseId" gorm:"uniqueIndex:idx_release_platform_arch;index"`
	Platform    string    `json:"platform" gorm:"uniqueIndex:idx_release_platform_arch"`
	Arch        string    `json:"arch" gorm:"uniqueIndex:idx_release_platform_arch"`
	FileName    string    `json:"fileName"`
	StorageName string    `json:"-"`
	ContentType string    `json:"contentType"`
	FileSize    int64     `json:"fileSize"`
	SHA256      string    `json:"sha256"`
	DownloadURL string    `json:"downloadUrl" gorm:"-"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type AppReleaseList struct {
	Items []AppRelease `json:"items"`
	Total int64        `json:"total"`
}

func (AppRelease) TableName() string {
	return "app_releases"
}

func (AppReleaseArtifact) TableName() string {
	return "app_release_artifacts"
}
