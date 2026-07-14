package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// ListPromptPresets returns server-managed prompt presets.
func ListPromptPresets(q model.Query) ([]model.PromptPreset, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyPromptPresetFilters(db.Model(&model.PromptPreset{}), q)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.PromptPreset
	err = tx.Order("updated_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

// SavePromptPreset creates or updates a server-managed prompt preset.
func SavePromptPreset(item model.PromptPreset) (model.PromptPreset, error) {
	db, err := DB()
	if err != nil {
		return model.PromptPreset{}, err
	}
	if saved, ok, err := findPromptPreset(db, item.ID); err != nil {
		return model.PromptPreset{}, err
	} else if ok && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	}
	return item, db.Save(&item).Error
}

// DeletePromptPreset deletes a prompt preset by id.
func DeletePromptPreset(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.PromptPreset{}, "id = ?", id).Error
}

// DeletePromptPresets deletes prompt presets by ids.
func DeletePromptPresets(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.PromptPreset{}, "id IN ?", ids).Error
}

func applyPromptPresetFilters(tx *gorm.DB, q model.Query) *gorm.DB {
	keyword := strings.TrimSpace(q.Keyword)
	if keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("name LIKE ? OR prompt LIKE ?", like, like)
	}
	return tx
}

func findPromptPreset(db *gorm.DB, id string) (model.PromptPreset, bool, error) {
	item := model.PromptPreset{}
	if strings.TrimSpace(id) == "" {
		return item, false, nil
	}
	err := db.First(&item, "id = ?", id).Error
	if err == gorm.ErrRecordNotFound {
		return model.PromptPreset{}, false, nil
	}
	if err != nil {
		return model.PromptPreset{}, false, err
	}
	return item, true, nil
}
