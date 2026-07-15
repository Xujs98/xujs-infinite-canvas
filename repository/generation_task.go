package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func SaveGenerationTask(task model.GenerationTask) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&task).Error
}

func GetGenerationTask(id string) (model.GenerationTask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.GenerationTask{}, false, err
	}
	var task model.GenerationTask
	result := db.Where("id = ? OR upstream_task_id = ?", id, id).First(&task)
	if result.Error != nil {
		return model.GenerationTask{}, false, result.Error
	}
	return task, true, nil
}

func ListGenerationTasks(q model.Query, userID string) (model.GenerationTaskList, error) {
	db, err := DB()
	if err != nil {
		return model.GenerationTaskList{}, err
	}
	q.Normalize()
	tx := db.Model(&model.GenerationTask{}).Where("persistent = ?", true)
	if userID != "" {
		tx = tx.Where("user_id = ?", userID)
	}
	if q.Type != "" {
		tx = tx.Where("type = ?", q.Type)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("username LIKE ? OR user_id LIKE ? OR model LIKE ? OR upstream_task_id LIKE ? OR canvas_id LIKE ? OR node_id LIKE ? OR error_msg LIKE ?", like, like, like, like, like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return model.GenerationTaskList{}, err
	}
	var items []model.GenerationTask
	if err := tx.Order("updated_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return model.GenerationTaskList{}, err
	}
	return model.GenerationTaskList{Items: items, Total: int(total)}, nil
}
