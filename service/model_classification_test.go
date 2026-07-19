package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestValidateVideoModelConfigInputLimits(t *testing.T) {
	tests := []struct {
		name    string
		config  *model.VideoModelConfig
		wantErr string
	}{
		{
			name:   "nil config is accepted",
			config: nil,
		},
		{
			name:   "nil limits inherit channel settings",
			config: &model.VideoModelConfig{},
		},
		{
			name: "zero maximum explicitly disables material",
			config: &model.VideoModelConfig{
				ImageInput: &model.VideoModelInputLimit{Min: 0, Max: 0},
			},
		},
		{
			name: "valid limits are accepted",
			config: &model.VideoModelConfig{
				ImageInput: &model.VideoModelInputLimit{Min: 1, Max: 20},
				VideoInput: &model.VideoModelInputLimit{Min: 0, Max: 9},
				AudioInput: &model.VideoModelInputLimit{Min: 1, Max: 2},
			},
		},
		{
			name: "minimum cannot exceed maximum",
			config: &model.VideoModelConfig{
				ImageInput: &model.VideoModelInputLimit{Min: 2, Max: 1},
			},
			wantErr: "最小数量不能大于最大数量",
		},
		{
			name: "image maximum is bounded",
			config: &model.VideoModelConfig{
				ImageInput: &model.VideoModelInputLimit{Min: 0, Max: 21},
			},
			wantErr: "不能超过 20",
		},
		{
			name: "video maximum is bounded",
			config: &model.VideoModelConfig{
				VideoInput: &model.VideoModelInputLimit{Min: 0, Max: 10},
			},
			wantErr: "不能超过 9",
		},
		{
			name: "audio maximum is bounded",
			config: &model.VideoModelConfig{
				AudioInput: &model.VideoModelInputLimit{Min: 0, Max: 10},
			},
			wantErr: "不能超过 9",
		},
		{
			name: "negative values are rejected",
			config: &model.VideoModelConfig{
				AudioInput: &model.VideoModelInputLimit{Min: -1, Max: 1},
			},
			wantErr: "不能小于 0",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateVideoModelConfig(test.config)
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("validateVideoModelConfig() error = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), test.wantErr) {
				t.Fatalf("validateVideoModelConfig() error = %v, want containing %q", err, test.wantErr)
			}
		})
	}
}

func TestValidateImageModelConfigAsyncTask(t *testing.T) {
	valid := &model.ImageAsyncTaskConfig{
		Enabled:            true,
		TaskIDField:        "task_id",
		StatusEndpointPath: "/v1/images/generations/{taskId}",
		StatusMethod:       "GET",
		StatusField:        "status",
		ImageURLPath:       "data.0.url",
		PendingValues:      []string{"pending", "processing"},
		SuccessValues:      []string{"success"},
		FailedValues:       []string{"failed"},
		PollIntervalMs:     15000,
		PollTimeoutMs:      900000,
	}

	tests := []struct {
		name    string
		mutate  func(*model.ImageAsyncTaskConfig)
		wantErr string
	}{
		{name: "valid config"},
		{name: "missing task id", mutate: func(task *model.ImageAsyncTaskConfig) { task.TaskIDField = "" }, wantErr: "任务 ID 字段"},
		{name: "invalid method", mutate: func(task *model.ImageAsyncTaskConfig) { task.StatusMethod = "PUT" }, wantErr: "GET 或 POST"},
		{name: "empty statuses", mutate: func(task *model.ImageAsyncTaskConfig) { task.SuccessValues = nil }, wantErr: "状态值均不能为空"},
		{name: "interval too short", mutate: func(task *model.ImageAsyncTaskConfig) { task.PollIntervalMs = 499 }, wantErr: "500 ms"},
		{name: "timeout before interval", mutate: func(task *model.ImageAsyncTaskConfig) { task.PollTimeoutMs = 10000 }, wantErr: "不能小于轮询间隔"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			copyTask := *valid
			copyTask.PendingValues = append([]string(nil), valid.PendingValues...)
			copyTask.SuccessValues = append([]string(nil), valid.SuccessValues...)
			copyTask.FailedValues = append([]string(nil), valid.FailedValues...)
			if test.mutate != nil {
				test.mutate(&copyTask)
			}
			err := validateImageModelConfig(&model.ImageModelConfig{AsyncTask: &copyTask})
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("validateImageModelConfig() error = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), test.wantErr) {
				t.Fatalf("validateImageModelConfig() error = %v, want containing %q", err, test.wantErr)
			}
		})
	}
}
