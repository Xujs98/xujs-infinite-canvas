package repository

import (
	"github.com/basketikun/infinite-canvas/model"
)

func ListModelClassifications(keyword string, page, pageSize int) (model.ModelClassificationList, error) {
	db, err := DB()
	if err != nil {
		return model.ModelClassificationList{}, err
	}
	var total int64
	q := db.Model(&model.ModelClassification{})
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("model_name LIKE ? OR capability LIKE ?", like, like)
	}
	if err := q.Count(&total).Error; err != nil {
		return model.ModelClassificationList{}, err
	}
	var items []model.ModelClassification
	if err := q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error; err != nil {
		return model.ModelClassificationList{}, err
	}
	return model.ModelClassificationList{Items: items, Total: int(total)}, nil
}

func GetModelClassificationByModelName(modelName string) (model.ModelClassification, bool, error) {
	db, err := DB()
	if err != nil {
		return model.ModelClassification{}, false, err
	}
	var item model.ModelClassification
	if err := db.Where("model_name = ?", modelName).First(&item).Error; err != nil {
		return model.ModelClassification{}, false, err
	}
	return item, true, nil
}

func GetAllModelClassifications() ([]model.ModelClassification, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.ModelClassification
	if err := db.Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func SaveModelClassification(item model.ModelClassification) (model.ModelClassification, error) {
	db, err := DB()
	if err != nil {
		return model.ModelClassification{}, err
	}
	if err := db.Save(&item).Error; err != nil {
		return model.ModelClassification{}, err
	}
	return item, nil
}

func DeleteModelClassification(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.ModelClassification{}, "id = ?", id).Error
}

func BatchDeleteModelClassifications(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.ModelClassification{}, "id IN ?", ids).Error
}
