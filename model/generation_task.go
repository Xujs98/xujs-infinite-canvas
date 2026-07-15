package model

import "time"

type GenerationTaskType string

const (
	GenerationTaskTypeImage GenerationTaskType = "image"
	GenerationTaskTypeVideo GenerationTaskType = "video"
)

type GenerationTaskStatus string

const (
	GenerationTaskStatusRunning   GenerationTaskStatus = "running"
	GenerationTaskStatusSucceeded GenerationTaskStatus = "succeeded"
	GenerationTaskStatusFailed    GenerationTaskStatus = "failed"
)

type GenerationTask struct {
	ID             string               `json:"id" gorm:"primaryKey"`
	UpstreamTaskID string               `json:"upstreamTaskId" gorm:"index"`
	Type           GenerationTaskType   `json:"type"`
	Status         GenerationTaskStatus `json:"status"`
	UserID         string               `json:"userId" gorm:"index"`
	Username       string               `json:"username"`
	Model          string               `json:"model"`
	Prompt         string               `json:"prompt" gorm:"type:text"`
	Path           string               `json:"path"`
	CanvasID       string               `json:"canvasId"`
	NodeID         string               `json:"nodeId"`
	Progress       int                  `json:"progress"`
	ResultURL      string               `json:"resultUrl"`
	ResultImages   []string             `json:"resultImages,omitempty" gorm:"serializer:json"`
	ErrorMsg       string               `json:"errorMsg"`
	Persistent     bool                 `json:"persistent" gorm:"default:false;index"`
	CreditChargeID string               `json:"creditChargeId" gorm:"index"`
	CreatedAt      time.Time            `json:"createdAt"`
	UpdatedAt      time.Time            `json:"updatedAt"`
	CompletedAt    *time.Time           `json:"completedAt,omitempty"`
}

type GenerationTaskList struct {
	Items []GenerationTask `json:"items"`
	Total int              `json:"total"`
}
