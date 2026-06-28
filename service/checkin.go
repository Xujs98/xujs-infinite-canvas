package service

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func DailyCheckIn(userID string) (model.CheckIn, bool, error) {
	now := time.Now()
	date := now.Format("2006-01-02")

	// 检查签到功能是否开启
	sysSettings, sysErr := repository.GetSystemSettings()
	if sysErr == nil {
		if enabled, ok := sysSettings[model.SettingCheckInEnabled]; ok && enabled == "false" {
			return model.CheckIn{}, false, fmt.Errorf("每日签到功能已关闭")
		}
	}

	// 检查今天是否已签到
	_, checked, err := repository.TodayCheckIn(userID, date)
	if err != nil && err != gorm.ErrRecordNotFound {
		return model.CheckIn{}, false, err
	}
	if checked {
		return model.CheckIn{}, false, fmt.Errorf("今日已签到")
	}

	// 获取奖励范围
	minReward := 5
	maxReward := 20
	if sysErr == nil {
		if v, ok := sysSettings[model.SettingCheckInRewardMin]; ok {
			fmt.Sscanf(v, "%d", &minReward)
		}
		if v, ok := sysSettings[model.SettingCheckInRewardMax]; ok {
			fmt.Sscanf(v, "%d", &maxReward)
		}
	}

	reward := rand.Intn(maxReward-minReward+1) + minReward

	// 更新用户算力点
	db, dbErr := repository.DB()
	if dbErr != nil {
		return model.CheckIn{}, false, dbErr
	}
	tx := db.Model(&model.User{}).Where("id = ?", userID).Update("credits", gorm.Expr("credits + ?", reward))
	if tx.Error != nil {
		return model.CheckIn{}, false, tx.Error
	}

	user, _, _ := repository.GetUserByID(userID)

	// 保存签到记录
	log := model.CheckIn{
		ID:        newID("checkin"),
		UserID:    userID,
		Reward:    reward,
		CreatedAt: now.Format(time.RFC3339),
	}
	if err := repository.SaveCheckIn(log); err != nil {
		return model.CheckIn{}, false, err
	}

	// 记录算力点流水
	repository.SaveCreditLog(model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeCheckIn,
		Amount:    reward,
		Balance:   user.Credits,
		Remark:    "每日签到奖励",
		CreatedAt: now.Format(time.RFC3339),
	})

	return log, true, nil
}

func GetCheckInMonth(userID string, month string) ([]model.CheckIn, int64, int, error) {
	logs, err := repository.MonthCheckIns(userID, month)
	if err != nil {
		return nil, 0, 0, err
	}

	totalCount, _ := repository.TotalCheckInCount(userID)
	totalReward, _ := repository.TotalCheckInReward(userID)

	return logs, totalCount, totalReward, nil
}


