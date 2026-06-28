package repository

import "github.com/basketikun/infinite-canvas/model"

func TodayCheckIn(userID string, date string) (model.CheckIn, bool, error) {
	db, err := DB()
	if err != nil {
		return model.CheckIn{}, false, err
	}
	var log model.CheckIn
	tx := db.Where("user_id = ? AND created_at LIKE ?", userID, date+"%").First(&log)
	if tx.Error != nil {
		return model.CheckIn{}, false, tx.Error
	}
	return log, tx.RowsAffected > 0, nil
}

func MonthCheckIns(userID string, month string) ([]model.CheckIn, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var logs []model.CheckIn
	tx := db.Where("user_id = ? AND created_at LIKE ?", userID, month+"%").Order("created_at asc").Find(&logs)
	if tx.Error != nil {
		return nil, tx.Error
	}
	return logs, nil
}

func SaveCheckIn(log model.CheckIn) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&log).Error
}

func TotalCheckInCount(userID string) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var count int64
	tx := db.Model(&model.CheckIn{}).Where("user_id = ?", userID).Count(&count)
	return count, tx.Error
}

func TotalCheckInReward(userID string) (int, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int
	tx := db.Model(&model.CheckIn{}).Where("user_id = ?", userID).Select("COALESCE(SUM(reward), 0)").Scan(&total)
	return total, tx.Error
}
