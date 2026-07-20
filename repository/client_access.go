package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func UpsertClientAccess(record model.ClientAccessRecord) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	created := false
	err = db.Transaction(func(tx *gorm.DB) error {
		var existing model.ClientAccessRecord
		result := tx.Where(
			"user_id = ? AND ip_address = ? AND device_code = ? AND client_type = ?",
			record.UserID,
			record.IPAddress,
			record.DeviceCode,
			record.ClientType,
		).First(&existing)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			created = true
			return tx.Create(&record).Error
		}
		if result.Error != nil {
			return result.Error
		}
		return tx.Model(&model.ClientAccessRecord{}).Where("id = ?", existing.ID).Updates(map[string]any{
			"app_version":  record.AppVersion,
			"os_name":      record.OSName,
			"os_version":   record.OSVersion,
			"user_agent":   record.UserAgent,
			"seen_count":   gorm.Expr("seen_count + 1"),
			"last_seen_at": record.LastSeenAt,
		}).Error
	})
	return created, err
}

func ListUserClientAccess(userID string) ([]model.ClientAccessRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var records []model.ClientAccessRecord
	err = db.Where("user_id = ?", userID).Order("last_seen_at desc").Find(&records).Error
	return records, err
}

func ListAccessBans() ([]model.AccessBan, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var bans []model.AccessBan
	err = db.Find(&bans).Error
	return bans, err
}

func FindMatchingAccessBans(deviceCode string, ipAddress string) ([]model.AccessBan, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var bans []model.AccessBan
	query := db.Model(&model.AccessBan{})
	switch {
	case deviceCode != "" && ipAddress != "":
		query = query.Where(
			"(kind = ? AND value = ?) OR (kind = ? AND value = ?)",
			model.AccessBanDevice,
			deviceCode,
			model.AccessBanIP,
			ipAddress,
		)
	case deviceCode != "":
		query = query.Where("kind = ? AND value = ?", model.AccessBanDevice, deviceCode)
	case ipAddress != "":
		query = query.Where("kind = ? AND value = ?", model.AccessBanIP, ipAddress)
	default:
		return bans, nil
	}
	err = query.Find(&bans).Error
	return bans, err
}

func SaveAccessBan(ban model.AccessBan) error {
	db, err := DB()
	if err != nil {
		return err
	}
	var existing model.AccessBan
	result := db.Where("kind = ? AND value = ?", ban.Kind, ban.Value).First(&existing)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return db.Create(&ban).Error
	}
	if result.Error != nil {
		return result.Error
	}
	return db.Model(&model.AccessBan{}).Where("id = ?", existing.ID).Updates(map[string]any{
		"reason":     ban.Reason,
		"created_by": ban.CreatedBy,
		"updated_at": ban.UpdatedAt,
	}).Error
}

func DeleteAccessBan(kind model.AccessBanKind, value string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("kind = ? AND value = ?", kind, value).Delete(&model.AccessBan{}).Error
}
