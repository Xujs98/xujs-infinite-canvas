package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// ListAITextAgents returns server-managed AI text agents.
func ListAITextAgents(q model.Query) ([]model.AITextAgent, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyAITextAgentFilters(db.Model(&model.AITextAgent{}), q)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.AITextAgent
	err = tx.Order("updated_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

// SaveAITextAgent creates or updates a server-managed AI text agent.
func SaveAITextAgent(item model.AITextAgent) (model.AITextAgent, error) {
	db, err := DB()
	if err != nil {
		return model.AITextAgent{}, err
	}
	if saved, ok, err := findAITextAgent(db, item.ID); err != nil {
		return model.AITextAgent{}, err
	} else if ok && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	}
	return item, db.Save(&item).Error
}

// DeleteAITextAgent deletes an AI text agent by id.
func DeleteAITextAgent(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.AITextAgent{}, "id = ?", id).Error
}

// DeleteAITextAgents deletes AI text agents by ids.
func DeleteAITextAgents(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.AITextAgent{}, "id IN ?", ids).Error
}

func applyAITextAgentFilters(tx *gorm.DB, q model.Query) *gorm.DB {
	keyword := strings.TrimSpace(q.Keyword)
	if keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("name LIKE ? OR prompt LIKE ? OR default_model LIKE ?", like, like, like)
	}
	return tx
}

func findAITextAgent(db *gorm.DB, id string) (model.AITextAgent, bool, error) {
	item := model.AITextAgent{}
	if strings.TrimSpace(id) == "" {
		return item, false, nil
	}
	err := db.First(&item, "id = ?", id).Error
	if err == gorm.ErrRecordNotFound {
		return model.AITextAgent{}, false, nil
	}
	if err != nil {
		return model.AITextAgent{}, false, err
	}
	return item, true, nil
}
