package handler

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestIsVideoTaskDone(t *testing.T) {
	tests := []struct {
		name     string
		respText string
		want     bool
	}{
		{"SUCCESS status", `{"data":{"status":"SUCCESS"}}`, true},
		{"FAILURE status", `{"data":{"status":"FAILURE"}}`, true},
		{"processing status", `{"data":{"status":"processing"}}`, false},
		{"IN_PROGRESS status", `{"data":{"status":"IN_PROGRESS"}}`, false},
		{"empty response", ``, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isVideoTaskDone(tt.respText); got != tt.want {
				t.Errorf("isVideoTaskDone() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsVideoTaskFailed(t *testing.T) {
	tests := []struct {
		name     string
		respText string
		want     bool
	}{
		{"FAILURE", `{"data":{"status":"FAILURE"}}`, true},
		{"failure lowercase", `{"data":{"status":"failure"}}`, true},
		{"SUCCESS", `{"data":{"status":"SUCCESS"}}`, false},
		{"processing", `{"data":{"status":"processing"}}`, false},
		{"empty", ``, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isVideoTaskFailed(tt.respText); got != tt.want {
				t.Errorf("isVideoTaskFailed() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsVideoTaskCompleted(t *testing.T) {
	tests := []struct {
		name     string
		respText string
		want     bool
	}{
		{"submitted", `{"data":{"status":"submitted"}}`, true},
		{"SUBMITTED", `{"data":{"status":"SUBMITTED"}}`, true},
		{"completed", `{"data":{"status":"completed"}}`, true},
		{"SUCCESS", `{"data":{"status":"SUCCESS"}}`, true},
		{"processing", `{"data":{"status":"processing"}}`, false},
		{"FAILURE", `{"data":{"status":"FAILURE"}}`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isVideoTaskCompleted(tt.respText); got != tt.want {
				t.Errorf("isVideoTaskCompleted() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNormalizeVideoStatus(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"SUCCESS", "completed"},
		{"success", "completed"},
		{"SUBMITTED", "completed"},
		{"FAILURE", "failed"},
		{"failure", "failed"},
		{"processing", "pending"},
		{"IN_PROGRESS", "pending"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := normalizeVideoStatus(tt.input); got != tt.want {
				t.Errorf("normalizeVideoStatus(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestEmitVideoGenerationTaskUpdateUpdatesLocalTaskID(t *testing.T) {
	task := service.CreateGenerationTask(service.GenerationTaskCreate{
		UpstreamTaskID: "local-task-id",
		Type:           model.GenerationTaskTypeVideo,
		UserID:         "user-local-task",
		Username:       "user-local-task",
		Model:          "grok-imagine-video-1.5-preview",
		CanvasID:       "canvas-1",
		NodeID:         "video-1",
	})

	emitVideoGenerationTaskUpdate(
		"user-local-task",
		canvasGenerationTaskContext{TaskID: task.ID, CanvasID: "canvas-1", NodeID: "video-1"},
		`{"id":"upstream-task-id","status":"completed","result":{"video_url":"https://example.com/video.mp4"}}`,
		true,
		false,
		nil,
	)

	updated, ok := service.GetGenerationTask(task.ID)
	if !ok {
		t.Fatalf("task not found")
	}
	if updated.Status != model.GenerationTaskStatusSucceeded {
		t.Fatalf("status = %s, want %s", updated.Status, model.GenerationTaskStatusSucceeded)
	}
	if updated.ResultURL != "https://example.com/video.mp4" {
		t.Fatalf("resultURL = %q", updated.ResultURL)
	}
	if updated.UpstreamTaskID != "upstream-task-id" {
		t.Fatalf("upstreamTaskID = %q", updated.UpstreamTaskID)
	}
}
