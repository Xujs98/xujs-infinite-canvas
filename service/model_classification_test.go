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
