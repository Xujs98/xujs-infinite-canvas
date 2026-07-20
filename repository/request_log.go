package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func ListRequestLogs(q model.RequestLogQuery) (model.RequestLogList, error) {
	var list model.RequestLogList
	db, err := DB()
	if err != nil {
		return list, err
	}
	db = applyRequestLogFilters(db.Model(&model.RequestLog{}), q)
	statsDB := applyRequestLogFilters(db.Session(&gorm.Session{NewDB: true}).Model(&model.RequestLog{}), q)

	if err := db.Count(&list.Total).Error; err != nil {
		return list, err
	}
	if err := statsDB.Select(
		"COUNT(*) AS total, "+
			"COALESCE(SUM(CASE WHEN success = ? THEN 1 ELSE 0 END), 0) AS success, "+
			"COALESCE(SUM(CASE WHEN success = ? AND (status_code > 0 OR error_msg <> '') THEN 1 ELSE 0 END), 0) AS failed, "+
			"COALESCE(SUM(credits), 0) AS credits, COALESCE(AVG(CASE WHEN elapsed_ms > 0 THEN elapsed_ms END), 0) AS average_ms",
		true, false,
	).Scan(&list.Stats).Error; err != nil {
		return list, err
	}

	q.Normalize()
	err = db.Select(
		"id", "user_id", "username", "event_type", "operation", "model", "channel_name", "provider_id", "method", "path", "url", "request_body_size", "status_code", "success", "is_polling", "source", "elapsed_ms", "credits", "wallet_credits", "subscription_credits", "billing_mode", "charge_status", "requested_count", "generated_count", "task_id", "error_stage", "created_at",
	).Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Scan(&list.Items).Error
	return list, err
}

func applyRequestLogFilters(db *gorm.DB, q model.RequestLogQuery) *gorm.DB {
	if q.Keyword != "" {
		keyword := "%" + q.Keyword + "%"
		db = db.Where("username LIKE ? OR user_id LIKE ? OR model LIKE ? OR channel_name LIKE ? OR provider_id LIKE ? OR task_id LIKE ? OR request_id LIKE ? OR path LIKE ? OR error_msg LIKE ?", keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword)
	}
	if q.Model != "" {
		db = db.Where("model LIKE ?", "%"+q.Model+"%")
	}
	if q.Channel != "" {
		db = db.Where("channel_name LIKE ? OR provider_id LIKE ?", "%"+q.Channel+"%", "%"+q.Channel+"%")
	}
	if q.Method != "" {
		db = db.Where("method = ?", q.Method)
	}
	if q.Source != "" {
		db = db.Where("source = ?", q.Source)
	}
	if q.EventType != "" {
		db = db.Where("event_type = ?", q.EventType)
	}
	if q.Operation != "" {
		db = db.Where("operation = ?", q.Operation)
	}
	switch q.Status {
	case "success":
		db = db.Where("success = ?", true)
	case "failed":
		db = db.Where("success = ? AND (status_code > 0 OR error_msg <> '')", false)
	case "pending":
		db = db.Where("success = ? AND status_code = 0 AND error_msg = ''", false)
	}
	if q.StartTime != nil {
		db = db.Where("created_at >= ?", *q.StartTime)
	}
	if q.EndTime != nil {
		db = db.Where("created_at <= ?", *q.EndTime)
	}
	return db
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

func UpdateRequestLogsByChargeID(chargeID string, updates map[string]interface{}) error {
	if chargeID == "" {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.RequestLog{}).Where("credit_charge_id = ?", chargeID).Updates(updates).Error
}

func UpdateRequestLogsByTaskID(taskID string, updates map[string]interface{}) error {
	if taskID == "" {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.RequestLog{}).Where("task_id = ?", taskID).Updates(updates).Error
}

func BatchDeleteRequestLogs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.RequestLog{}).Error
}

func ClearRequestLogs() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	result := db.Where("1 = 1").Delete(&model.RequestLog{})
	return result.RowsAffected, result.Error
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
