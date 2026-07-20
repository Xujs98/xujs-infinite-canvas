package repository

import (
	"errors"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

const riskEventMergeWindow = 15 * time.Minute

func SaveRiskEvent(event model.RiskEvent) (model.RiskEvent, error) {
	db, err := DB()
	if err != nil {
		return event, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var existing model.RiskEvent
		result := tx.Where(
			"status = ? AND event_type = ? AND user_id = ? AND ip_address = ? AND device_code = ? AND path = ? AND last_seen_at >= ?",
			model.RiskStatusOpen,
			event.EventType,
			event.UserID,
			event.IPAddress,
			event.DeviceCode,
			event.Path,
			event.LastSeenAt.Add(-riskEventMergeWindow),
		).Order("last_seen_at DESC").First(&existing)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return tx.Create(&event).Error
		}
		if result.Error != nil {
			return result.Error
		}
		if riskLevelRank(existing.Level) > riskLevelRank(event.Level) {
			event.Level = existing.Level
		}
		if err := tx.Model(&model.RiskEvent{}).Where("id = ?", existing.ID).Updates(map[string]any{
			"username":         event.Username,
			"level":            event.Level,
			"source":           event.Source,
			"client_type":      event.ClientType,
			"app_version":      event.AppVersion,
			"summary":          event.Summary,
			"detail":           event.Detail,
			"occurrence_count": gorm.Expr("occurrence_count + 1"),
			"last_seen_at":     event.LastSeenAt,
			"updated_at":       event.UpdatedAt,
		}).Error; err != nil {
			return err
		}
		event = model.RiskEvent{}
		return tx.First(&event, "id = ?", existing.ID).Error
	})
	return event, err
}

func ListRiskEvents(q model.Query, userID string, level model.RiskLevel, source string) (model.RiskEventList, error) {
	var list model.RiskEventList
	db, err := DB()
	if err != nil {
		return list, err
	}
	tx := db.Model(&model.RiskEvent{})
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		tx = tx.Where("username LIKE ? OR event_type LIKE ? OR summary LIKE ? OR ip_address LIKE ? OR device_code LIKE ?", like, like, like, like, like)
	}
	if userID != "" {
		tx = tx.Where("user_id = ?", userID)
	}
	if q.Type != "" {
		tx = tx.Where("event_type = ?", q.Type)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	if level != "" {
		tx = tx.Where("level = ?", level)
	}
	if source != "" {
		tx = tx.Where("source = ?", source)
	}
	if err := tx.Count(&list.Total).Error; err != nil {
		return list, err
	}
	q.Normalize()
	err = tx.Order("last_seen_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&list.Items).Error
	return list, err
}

func RiskEventStats() (model.RiskEventStats, error) {
	var stats model.RiskEventStats
	db, err := DB()
	if err != nil {
		return stats, err
	}
	if err := db.Model(&model.RiskEvent{}).Where("status = ?", model.RiskStatusOpen).Count(&stats.Open).Error; err != nil {
		return stats, err
	}
	if err := db.Model(&model.RiskEvent{}).Where("status = ? AND level IN ?", model.RiskStatusOpen, []model.RiskLevel{model.RiskLevelHigh, model.RiskLevelCritical}).Count(&stats.HighRisk).Error; err != nil {
		return stats, err
	}
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if err := db.Model(&model.RiskEvent{}).Where("last_seen_at >= ?", startOfDay).Count(&stats.Today).Error; err != nil {
		return stats, err
	}
	return stats, nil
}

func UpdateRiskEventStatus(id string, status model.RiskStatus, adminUserID string, now time.Time) error {
	db, err := DB()
	if err != nil {
		return err
	}
	updates := map[string]any{"status": status, "updated_at": now}
	if status == model.RiskStatusOpen {
		updates["resolved_by"] = ""
		updates["resolved_at"] = nil
	} else {
		updates["resolved_by"] = adminUserID
		updates["resolved_at"] = now
	}
	result := db.Model(&model.RiskEvent{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func BatchDeleteRiskEvents(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.RiskEvent{}).Error
}

func ClearRiskEvents() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	result := db.Where("1 = 1").Delete(&model.RiskEvent{})
	return result.RowsAffected, result.Error
}

func PruneRiskEvents(cutoff time.Time, maxRows int) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var deleted int64
	err = db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("last_seen_at < ?", cutoff).Delete(&model.RiskEvent{})
		if result.Error != nil {
			return result.Error
		}
		deleted += result.RowsAffected
		for maxRows > 0 {
			var ids []string
			if err := tx.Model(&model.RiskEvent{}).Select("id").Order("last_seen_at DESC").Offset(maxRows).Limit(500).Pluck("id", &ids).Error; err != nil {
				return err
			}
			if len(ids) == 0 {
				break
			}
			result = tx.Where("id IN ?", ids).Delete(&model.RiskEvent{})
			if result.Error != nil {
				return result.Error
			}
			deleted += result.RowsAffected
		}
		return nil
	})
	return deleted, err
}

func riskLevelRank(level model.RiskLevel) int {
	switch level {
	case model.RiskLevelCritical:
		return 4
	case model.RiskLevelHigh:
		return 3
	case model.RiskLevelMedium:
		return 2
	default:
		return 1
	}
}
