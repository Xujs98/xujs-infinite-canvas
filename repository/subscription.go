package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var ErrSubscriptionPlanHasSubscribers = errors.New("subscription plan has active subscribers")

func ListSubscriptionPlans(q model.Query, enabledOnly bool) (model.SubscriptionPlanList, error) {
	db, err := DB()
	if err != nil {
		return model.SubscriptionPlanList{}, err
	}
	q.Normalize()
	tx := db.Model(&model.SubscriptionPlan{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("title LIKE ? OR subtitle LIKE ? OR upgrade_role LIKE ?", like, like, like)
	}
	if enabledOnly {
		tx = tx.Where("enabled = ?", true)
	} else if q.Status == "enabled" {
		tx = tx.Where("enabled = ?", true)
	} else if q.Status == "disabled" {
		tx = tx.Where("enabled = ?", false)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return model.SubscriptionPlanList{}, err
	}
	var items []model.SubscriptionPlan
	if err := tx.Order("sort asc, created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return model.SubscriptionPlanList{}, err
	}
	if len(items) > 0 {
		ids := make([]string, 0, len(items))
		for _, item := range items {
			ids = append(ids, item.ID)
		}
		type planCount struct {
			PlanID string
			Count  int
		}
		var counts []planCount
		if err := db.Model(&model.UserSubscription{}).
			Select("plan_id, COUNT(*) AS count").
			Where("plan_id IN ? AND status = ? AND expires_at > ?", ids, model.UserSubscriptionActive, time.Now().Format(time.RFC3339)).
			Group("plan_id").Scan(&counts).Error; err != nil {
			return model.SubscriptionPlanList{}, err
		}
		countByPlan := make(map[string]int, len(counts))
		for _, count := range counts {
			countByPlan[count.PlanID] = count.Count
		}
		for index := range items {
			items[index].SubscriberCount = countByPlan[items[index].ID]
		}
	}
	return model.SubscriptionPlanList{Items: items, Total: int(total)}, nil
}

func GetActiveUserSubscription(userID string) (model.UserSubscription, bool, error) {
	db, err := DB()
	if err != nil {
		return model.UserSubscription{}, false, err
	}
	var item model.UserSubscription
	result := db.Where("user_id = ? AND status = ? AND expires_at > ?", userID, model.UserSubscriptionActive, time.Now().Format(time.RFC3339)).Order("expires_at desc").First(&item)
	if result.Error != nil {
		return model.UserSubscription{}, false, result.Error
	}
	return item, true, nil
}

func GetSubscriptionPlan(id string) (model.SubscriptionPlan, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SubscriptionPlan{}, false, err
	}
	var item model.SubscriptionPlan
	result := db.First(&item, "id = ?", id)
	if result.Error != nil {
		return model.SubscriptionPlan{}, false, result.Error
	}
	return item, true, nil
}

func SaveSubscriptionPlan(item model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Save(&item).Error
}

func DeleteSubscriptionPlan(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	var activeCount int64
	if err := db.Model(&model.UserSubscription{}).Where("plan_id = ? AND status = ? AND expires_at > ?", id, model.UserSubscriptionActive, time.Now().Format(time.RFC3339)).Count(&activeCount).Error; err != nil {
		return err
	}
	if activeCount > 0 {
		return ErrSubscriptionPlanHasSubscribers
	}
	result := db.Delete(&model.SubscriptionPlan{}, "id = ?", id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ListUserSubscriptions(userID string, q model.Query) (model.UserSubscriptionList, error) {
	db, err := DB()
	if err != nil {
		return model.UserSubscriptionList{}, err
	}
	q.Normalize()
	tx := db.Model(&model.UserSubscription{}).Where("user_id = ?", userID)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return model.UserSubscriptionList{}, err
	}
	var items []model.UserSubscription
	if err := tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return model.UserSubscriptionList{}, err
	}
	return model.UserSubscriptionList{Items: items, Total: int(total)}, nil
}

func ListSubscriptionSubscribers(planID string, q model.Query) (model.SubscriptionSubscriberList, error) {
	db, err := DB()
	if err != nil {
		return model.SubscriptionSubscriberList{}, err
	}
	q.Normalize()
	nowText := time.Now().Format(time.RFC3339)
	tx := db.Table("user_subscriptions AS subscriptions").
		Joins("JOIN users ON users.id = subscriptions.user_id").
		Where("subscriptions.plan_id = ? AND subscriptions.status = ? AND subscriptions.expires_at > ?", planID, model.UserSubscriptionActive, nowText)
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("users.username LIKE ? OR users.display_name LIKE ? OR users.id LIKE ?", like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return model.SubscriptionSubscriberList{}, err
	}
	var items []model.SubscriptionSubscriber
	if err := tx.Select("subscriptions.id AS subscription_id, subscriptions.user_id, users.username, users.display_name, subscriptions.quota_credits, subscriptions.quota_remaining, subscriptions.status, subscriptions.starts_at, subscriptions.expires_at").
		Order("subscriptions.created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Scan(&items).Error; err != nil {
		return model.SubscriptionSubscriberList{}, err
	}
	return model.SubscriptionSubscriberList{Items: items, Total: int(total)}, nil
}

func GetUserSubscription(id string) (model.UserSubscription, bool, error) {
	db, err := DB()
	if err != nil {
		return model.UserSubscription{}, false, err
	}
	var item model.UserSubscription
	result := db.First(&item, "id = ?", id)
	if result.Error != nil {
		return model.UserSubscription{}, false, result.Error
	}
	return item, true, nil
}
