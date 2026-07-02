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
	ID             string               `json:"id"`
	UpstreamTaskID string               `json:"upstreamTaskId"`
	Type           GenerationTaskType   `json:"type"`
	Status         GenerationTaskStatus `json:"status"`
	UserID         string               `json:"userId"`
	Username       string               `json:"username"`
	Model          string               `json:"model"`
	Path           string               `json:"path"`
	CanvasID       string               `json:"canvasId"`
	NodeID         string               `json:"nodeId"`
	Progress       int                  `json:"progress"`
	ResultURL      string               `json:"resultUrl"`
	ResultImages   []string             `json:"resultImages,omitempty"`
	ErrorMsg       string               `json:"errorMsg"`
	CreatedAt      time.Time            `json:"createdAt"`
	UpdatedAt      time.Time            `json:"updatedAt"`
	CompletedAt    *time.Time           `json:"completedAt,omitempty"`
}

type GenerationTaskList struct {
	Items []GenerationTask `json:"items"`
	Total int              `json:"total"`
}
