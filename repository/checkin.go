package repository

import (
	"sort"

	"github.com/basketikun/infinite-canvas/model"
)

func TodayCheckIn(userID string, date string) (model.CheckIn, bool, error) {
	db, err := DB()
	if err != nil {
		return model.CheckIn{}, false, err
	}
	var logs []model.CheckIn
	if err := db.Where("user_id = ?", userID).Order("created_at desc").Find(&logs).Error; err != nil {
		return model.CheckIn{}, false, err
	}
	for _, log := range logs {
		if model.CheckInDateFromTimestamp(log.CreatedAt) == date {
			return log, true, nil
		}
	}
	return model.CheckIn{}, false, nil
}

func MonthCheckIns(userID string, month string) ([]model.CheckIn, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var allLogs []model.CheckIn
	if err := db.Where("user_id = ?", userID).Find(&allLogs).Error; err != nil {
		return nil, err
	}
	logs := make([]model.CheckIn, 0, len(allLogs))
	for _, log := range allLogs {
		date := model.CheckInDateFromTimestamp(log.CreatedAt)
		if len(month) == 7 && len(date) >= 7 && date[:7] == month {
			logs = append(logs, log)
		}
	}
	sort.Slice(logs, func(i, j int) bool {
		return model.CheckInDateFromTimestamp(logs[i].CreatedAt) < model.CheckInDateFromTimestamp(logs[j].CreatedAt)
	})
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
