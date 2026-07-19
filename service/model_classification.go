package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func validateRequestFields(fields model.RequestFields) error {
	for index, field := range fields {
		template := strings.TrimSpace(field.JSONTemplate)
		if template == "" {
			continue
		}
		var value any
		if err := json.Unmarshal([]byte(template), &value); err != nil {
			return fmt.Errorf("第 %d 条请求字段映射的 JSON 模板无效: %w", index+1, err)
		}
		if field.DataType == "object" {
			if _, ok := value.(map[string]any); !ok {
				return fmt.Errorf("第 %d 条请求字段映射的模板根节点必须是 object", index+1)
			}
		}
		if field.DataType == "array" {
			if _, ok := value.([]any); !ok {
				return fmt.Errorf("第 %d 条请求字段映射的模板根节点必须是 array", index+1)
			}
		}
	}
	return nil
}

func validateVideoModelInputLimit(label string, limit *model.VideoModelInputLimit, maxAllowed int) error {
	if limit == nil {
		return nil
	}
	if limit.Min < 0 || limit.Max < 0 {
		return fmt.Errorf("%s素材数量不能小于 0", label)
	}
	if limit.Max > maxAllowed {
		return fmt.Errorf("%s素材最大数量不能超过 %d", label, maxAllowed)
	}
	if limit.Min > limit.Max {
		return fmt.Errorf("%s素材最小数量不能大于最大数量", label)
	}
	return nil
}

func validateVideoModelConfig(config *model.VideoModelConfig) error {
	if config == nil {
		return nil
	}
	if err := validateVideoModelInputLimit("图片", config.ImageInput, 20); err != nil {
		return err
	}
	if err := validateVideoModelInputLimit("视频", config.VideoInput, 9); err != nil {
		return err
	}
	return validateVideoModelInputLimit("音频", config.AudioInput, 9)
}

func validateImageModelConfig(config *model.ImageModelConfig) error {
	if config == nil || config.AsyncTask == nil || !config.AsyncTask.Enabled {
		return nil
	}
	task := config.AsyncTask
	required := []struct {
		label string
		value string
	}{
		{"任务 ID 字段", task.TaskIDField},
		{"状态轮询端点", task.StatusEndpointPath},
		{"状态字段路径", task.StatusField},
		{"图片 URL 路径", task.ImageURLPath},
	}
	for _, field := range required {
		if strings.TrimSpace(field.value) == "" {
			return fmt.Errorf("开启图片异步任务后，%s不能为空", field.label)
		}
	}
	method := strings.ToUpper(strings.TrimSpace(task.StatusMethod))
	if method != "GET" && method != "POST" {
		return fmt.Errorf("状态查询方法只能是 GET 或 POST")
	}
	if len(task.PendingValues) == 0 || len(task.SuccessValues) == 0 || len(task.FailedValues) == 0 {
		return fmt.Errorf("等待中、成功和失败状态值均不能为空")
	}
	if task.PollIntervalMs < 500 {
		return fmt.Errorf("轮询间隔不能小于 500 ms")
	}
	if task.PollTimeoutMs < task.PollIntervalMs {
		return fmt.Errorf("轮询超时不能小于轮询间隔")
	}
	return nil
}

func ListModelClassifications(keyword string, page, pageSize int) (model.ModelClassificationList, error) {
	return repository.ListModelClassifications(keyword, page, pageSize)
}

func CreateModelClassification(classification model.ModelClassification) (model.ModelClassification, error) {
	if err := validateRequestFields(classification.RequestFields); err != nil {
		return model.ModelClassification{}, err
	}
	if err := validateVideoModelConfig(classification.VideoConfig); err != nil {
		return model.ModelClassification{}, err
	}
	if err := validateImageModelConfig(classification.ImageConfig); err != nil {
		return model.ModelClassification{}, err
	}
	now := time.Now().Format(time.RFC3339)
	classification.ID = newID("mc")
	classification.CreatedAt = now
	classification.UpdatedAt = now
	return repository.SaveModelClassification(classification)
}

func UpdateModelClassification(id string, classification model.ModelClassification) (model.ModelClassification, error) {
	if err := validateRequestFields(classification.RequestFields); err != nil {
		return model.ModelClassification{}, err
	}
	if err := validateVideoModelConfig(classification.VideoConfig); err != nil {
		return model.ModelClassification{}, err
	}
	if err := validateImageModelConfig(classification.ImageConfig); err != nil {
		return model.ModelClassification{}, err
	}
	db, dbErr := repository.DB()
	if dbErr != nil {
		return model.ModelClassification{}, dbErr
	}
	var existing model.ModelClassification
	if err := db.First(&existing, "id = ?", id).Error; err != nil {
		return model.ModelClassification{}, err
	}
	existing.ModelName = classification.ModelName
	existing.Capability = classification.Capability
	existing.RequestFields = classification.RequestFields
	existing.VideoConfig = classification.VideoConfig
	existing.ImageConfig = classification.ImageConfig
	existing.AudioConfig = classification.AudioConfig
	existing.ChatConfig = classification.ChatConfig
	existing.UpdatedAt = time.Now().Format(time.RFC3339)
	return repository.SaveModelClassification(existing)
}

func DeleteModelClassification(id string) error {
	return repository.DeleteModelClassification(id)
}

func BatchDeleteModelClassifications(ids []string) error {
	return repository.BatchDeleteModelClassifications(ids)
}

// GetModelClassificationsMap 返回 modelName -> capability 的映射
func GetModelClassificationsMap() (map[string]string, error) {
	items, err := repository.GetAllModelClassifications()
	if err != nil {
		return nil, err
	}
	result := make(map[string]string)
	for _, item := range items {
		result[item.ModelName] = item.Capability
	}
	return result, nil
}

// GetAllModelClassificationsList 返回所有模型分类列表
func GetAllModelClassificationsList() ([]model.ModelClassification, error) {
	return repository.GetAllModelClassifications()
}

// GetModelClassificationByModelName 根据模型名获取分类配置
func GetModelClassificationByModelName(modelName string) (*model.ModelClassification, error) {
	items, err := repository.GetAllModelClassifications()
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item.ModelName == modelName {
			return &item, nil
		}
	}
	return nil, nil
}
