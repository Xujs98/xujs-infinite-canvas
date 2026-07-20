package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

type AnalyticsCallRecord struct {
	UserID    string
	Username  string
	Model     string
	Success   bool
	CreatedAt time.Time
}

type AnalyticsUserRecord struct {
	ID          string
	Username    string
	DisplayName string
	CreatedAt   string
	LastLoginAt string
}

type AnalyticsUsageRecord struct {
	UserID    string
	Amount    int
	CreatedAt string
}

func ListAnalyticsCalls(since time.Time) ([]AnalyticsCallRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var records []AnalyticsCallRecord
	err = db.Model(&model.RequestLog{}).
		Select("user_id", "username", "model", "success", "created_at").
		Where("created_at >= ?", since).
		Where("TRIM(model) <> '' AND model <> ?", "app-error").
		Where("is_polling = ? OR is_polling IS NULL", false).
		Order("created_at ASC").
		Scan(&records).Error
	return records, err
}

func ListAnalyticsUsers() ([]AnalyticsUserRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var records []AnalyticsUserRecord
	err = db.Model(&model.User{}).
		Select("id", "username", "display_name", "created_at", "last_login_at").
		Scan(&records).Error
	return records, err
}

func ListAnalyticsWalletUsage(since time.Time) ([]AnalyticsUsageRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var records []AnalyticsUsageRecord
	err = db.Model(&model.CreditLog{}).
		Select("user_id", "amount", "created_at").
		Where("created_at >= ?", since.Format(time.RFC3339)).
		Where("amount < 0 AND type IN ?", []model.CreditLogType{model.CreditLogTypeAIConsume, model.CreditLogTypeOfflineConsume}).
		Scan(&records).Error
	return records, err
}

func ListAnalyticsSubscriptionUsage(since time.Time) ([]AnalyticsUsageRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var records []AnalyticsUsageRecord
	err = db.Model(&model.SubscriptionUsageLog{}).
		Select("user_id", "amount", "created_at").
		Where("created_at >= ?", since.Format(time.RFC3339)).
		Where("amount < 0 AND type = ?", model.SubscriptionUsageConsume).
		Scan(&records).Error
	return records, err
}
