package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func ListCallLogs(q model.Query, status string) (model.CallLogList, error) {
	var result model.CallLogList
	db, err := DB()
	if err != nil {
		return result, err
	}
	db = db.Model(&model.CallLog{})
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("username LIKE ? OR model LIKE ? OR error_msg LIKE ?", like, like, like)
	}
	if status == "success" {
		db = db.Where("success = ?", true)
	} else if status == "fail" {
		db = db.Where("success = ?", false)
	}
	if err := db.Count(&result.Total).Error; err != nil {
		return result, err
	}
	q.Normalize()
	err = db.Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&result.Items).Error
	return result, err
}

func CreateCallLog(log *model.CallLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(log).Error
}

func BatchDeleteCallLogs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.CallLog{}).Error
}

func ClearCallLogs() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	result := db.Where("1 = 1").Delete(&model.CallLog{})
	return result.RowsAffected, result.Error
}

func PruneCallLogs(cutoff time.Time, maxRows int) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var deleted int64
	err = db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("created_at < ?", cutoff).Delete(&model.CallLog{})
		if result.Error != nil {
			return result.Error
		}
		deleted += result.RowsAffected
		if maxRows <= 0 {
			return nil
		}
		for {
			var ids []string
			if err := tx.Model(&model.CallLog{}).Select("id").Order("created_at DESC").Offset(maxRows).Limit(500).Pluck("id", &ids).Error; err != nil {
				return err
			}
			if len(ids) == 0 {
				return nil
			}
			result = tx.Where("id IN ?", ids).Delete(&model.CallLog{})
			if result.Error != nil {
				return result.Error
			}
			deleted += result.RowsAffected
		}
	})
	return deleted, err
}
