package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

// GetSystemSettings 读取所有系统配置。
func GetSystemSettings() (map[string]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var settings []model.SystemSetting
	if err := db.Find(&settings).Error; err != nil {
		return nil, err
	}
	result := make(map[string]string, len(settings))
	for _, s := range settings {
		result[s.Key] = s.Value
	}
	return result, nil
}

// SaveSystemSetting 保存单个配置项。
func SaveSystemSetting(key string, value string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	ts := time.Now().Format(time.RFC3339)
	return db.Save(&model.SystemSetting{
		Key:       key,
		Value:     value,
		UpdatedAt: ts,
	}).Error
}

// SaveSystemSettings 批量保存配置项。
func SaveSystemSettings(settings map[string]string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	ts := time.Now().Format(time.RFC3339)
	tx := db.Begin()
	for key, value := range settings {
		if err := tx.Save(&model.SystemSetting{
			Key:       key,
			Value:     value,
			UpdatedAt: ts,
		}).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit().Error
}
