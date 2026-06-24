package service

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListModelClassifications(keyword string, page, pageSize int) (model.ModelClassificationList, error) {
	return repository.ListModelClassifications(keyword, page, pageSize)
}

func CreateModelClassification(classification model.ModelClassification) (model.ModelClassification, error) {
	now := time.Now().Format(time.RFC3339)
	classification.ID = newID("mc")
	classification.CreatedAt = now
	classification.UpdatedAt = now
	return repository.SaveModelClassification(classification)
}

func UpdateModelClassification(id string, classification model.ModelClassification) (model.ModelClassification, error) {
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
	existing.VideoConfig = classification.VideoConfig
	existing.ImageConfig = classification.ImageConfig
	existing.AudioConfig = classification.AudioConfig
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
