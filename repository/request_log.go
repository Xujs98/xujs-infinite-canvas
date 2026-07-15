package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func ListRequestLogs(q model.Query, method string, source string) (model.RequestLogList, error) {
	var list model.RequestLogList
	db, err := DB()
	if err != nil {
		return list, err
	}
	db = db.Model(&model.RequestLog{})

	if q.Keyword != "" {
		keyword := "%" + q.Keyword + "%"
		db = db.Where("username LIKE ? OR model LIKE ? OR url LIKE ? OR error_msg LIKE ?", keyword, keyword, keyword, keyword)
	}
	if method != "" {
		db = db.Where("method = ?", method)
	}
	if source != "" {
		db = db.Where("source = ?", source)
	}

	if err := db.Count(&list.Total).Error; err != nil {
		return list, err
	}

	q.Normalize()
	err = db.Select("id", "user_id", "username", "model", "method", "path", "url", "request_body_size", "status_code", "success", "is_polling", "source", "created_at").Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Scan(&list.Items).Error
	return list, err
}

func GetRequestLog(id string) (model.RequestLog, error) {
	db, err := DB()
	if err != nil {
		return model.RequestLog{}, err
	}
	var item model.RequestLog
	err = db.First(&item, "id = ?", id).Error
	return item, err
}

func CreateRequestLog(log *model.RequestLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(log).Error
}

func UpdateRequestLog(id string, updates map[string]interface{}) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.RequestLog{}).Where("id = ?", id).Updates(updates).Error
}

func BatchDeleteRequestLogs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.RequestLog{}).Error
}

// PruneRequestLogs 保留指定天数内且最新的 maxRows 条日志。
func PruneRequestLogs(cutoff time.Time, maxRows int) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var deleted int64
	err = db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("created_at < ?", cutoff).Delete(&model.RequestLog{})
		if result.Error != nil {
			return result.Error
		}
		deleted += result.RowsAffected
		if maxRows <= 0 {
			return nil
		}
		for {
			var ids []string
			if err := tx.Model(&model.RequestLog{}).Select("id").Order("created_at DESC").Offset(maxRows).Limit(500).Pluck("id", &ids).Error; err != nil {
				return err
			}
			if len(ids) == 0 {
				return nil
			}
			result = tx.Where("id IN ?", ids).Delete(&model.RequestLog{})
			if result.Error != nil {
				return result.Error
			}
			deleted += result.RowsAffected
		}
	})
	return deleted, err
}
