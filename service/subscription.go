package service

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/ws"
	"gorm.io/gorm"
)

func ListSubscriptionPlans(q model.Query, enabledOnly bool) (model.SubscriptionPlanList, error) {
	return repository.ListSubscriptionPlans(q, enabledOnly)
}

func CreateSubscriptionPlan(plan model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	if err := normalizeSubscriptionPlan(&plan); err != nil {
		return model.SubscriptionPlan{}, err
	}
	plan.ID = newID("plan")
	plan.CreatedAt = now()
	plan.UpdatedAt = plan.CreatedAt
	return repository.SaveSubscriptionPlan(plan)
}

func UpdateSubscriptionPlan(id string, update model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	current, ok, err := repository.GetSubscriptionPlan(id)
	if err != nil || !ok {
		if errors.Is(err, gorm.ErrRecordNotFound) || !ok {
			return model.SubscriptionPlan{}, safeMessageError{message: "订阅套餐不存在"}
		}
		return model.SubscriptionPlan{}, err
	}
	current.Title = update.Title
	current.Subtitle = update.Subtitle
	current.PriceCredits = update.PriceCredits
	current.UpgradeRole = update.UpgradeRole
	current.DowngradeRole = update.DowngradeRole
	current.PurchaseLimit = update.PurchaseLimit
	current.Sort = update.Sort
	current.Enabled = update.Enabled
	current.DurationUnit = update.DurationUnit
	current.DurationValue = update.DurationValue
	current.DurationCustomSeconds = update.DurationCustomSeconds
	current.QuotaCredits = update.QuotaCredits
	current.ResetCycle = update.ResetCycle
	current.ResetCustomSeconds = update.ResetCustomSeconds
	current.AllowWalletFallback = update.AllowWalletFallback
	if err := normalizeSubscriptionPlan(&current); err != nil {
		return model.SubscriptionPlan{}, err
	}
	current.UpdatedAt = now()
	return repository.SaveSubscriptionPlan(current)
}

func DeleteSubscriptionPlan(id string) error {
	err := repository.DeleteSubscriptionPlan(id)
	if errors.Is(err, repository.ErrSubscriptionPlanHasSubscribers) {
		return safeMessageError{message: "套餐仍有生效中的订阅用户，请先全部作废或删除用户订阅"}
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return safeMessageError{message: "订阅套餐不存在"}
	}
	return err
}

func ListSubscriptionSubscribers(planID string, q model.Query) (model.SubscriptionSubscriberList, error) {
	if _, ok, err := repository.GetSubscriptionPlan(planID); err != nil || !ok {
		if errors.Is(err, gorm.ErrRecordNotFound) || !ok {
			return model.SubscriptionSubscriberList{}, safeMessageError{message: "订阅套餐不存在"}
		}
		return model.SubscriptionSubscriberList{}, err
	}
	return repository.ListSubscriptionSubscribers(planID, q)
}

func ListUserSubscriptions(userID string, q model.Query) (model.UserSubscriptionList, error) {
	if err := ExpireUserSubscriptionIfNeeded(userID); err != nil {
		return model.UserSubscriptionList{}, err
	}
	if err := ResetSubscriptionCreditsIfNeeded(userID); err != nil {
		return model.UserSubscriptionList{}, err
	}
	return repository.ListUserSubscriptions(userID, q)
}

func PurchaseSubscription(userID, planID string) (model.SubscriptionPurchaseResult, error) {
	db, err := repository.DB()
	if err != nil {
		return model.SubscriptionPurchaseResult{}, err
	}
	var purchased model.UserSubscription
	err = db.Transaction(func(tx *gorm.DB) error {
		var plan model.SubscriptionPlan
		if err := tx.Where("id = ? AND enabled = ?", strings.TrimSpace(planID), true).First(&plan).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return safeMessageError{message: "订阅套餐不存在或已停用"}
			}
			return err
		}
		var user model.User
		if err := tx.First(&user, "id = ?", userID).Error; err != nil {
			return safeMessageError{message: "用户不存在"}
		}
		if user.Role == model.UserRoleAdmin {
			return safeMessageError{message: "管理员无需购买订阅"}
		}
		if plan.PurchaseLimit > 0 {
			var count int64
			if err := tx.Model(&model.UserSubscription{}).Where("user_id = ? AND plan_id = ?", userID, plan.ID).Count(&count).Error; err != nil {
				return err
			}
			if count >= int64(plan.PurchaseLimit) {
				return safeMessageError{message: "已达到该套餐的购买次数上限"}
			}
		}

		nowTime := time.Now()
		base := nowTime
		var active model.UserSubscription
		activeResult := tx.Where("user_id = ? AND status = ?", userID, model.UserSubscriptionActive).Order("expires_at desc").First(&active)
		if activeResult.Error == nil && active.PlanID == plan.ID {
			if expiresAt, parseErr := time.Parse(time.RFC3339, active.ExpiresAt); parseErr == nil && expiresAt.After(base) {
				base = expiresAt
			}
		}
		if err := tx.Model(&model.UserSubscription{}).Where("user_id = ? AND status = ?", userID, model.UserSubscriptionActive).Updates(map[string]any{
			"status":     model.UserSubscriptionReplaced,
			"updated_at": nowTime.Format(time.RFC3339),
		}).Error; err != nil {
			return err
		}

		if plan.PriceCredits > 0 {
			result := tx.Model(&model.User{}).Where("id = ? AND credits >= ?", userID, plan.PriceCredits).Updates(map[string]any{
				"credits":    gorm.Expr("credits - ?", plan.PriceCredits),
				"role":       plan.UpgradeRole,
				"updated_at": nowTime.Format(time.RFC3339),
			})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return safeMessageError{message: "算力点不足"}
			}
		} else if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"role": plan.UpgradeRole, "updated_at": nowTime.Format(time.RFC3339)}).Error; err != nil {
			return err
		}

		expiresAt := addSubscriptionDuration(base, plan.DurationUnit, plan.DurationValue, plan.DurationCustomSeconds)
		var updatedUser model.User
		if err := tx.First(&updatedUser, "id = ?", userID).Error; err != nil {
			return err
		}
		purchaseBalance := updatedUser.Credits
		purchased = newUserSubscriptionSnapshot(userID, plan, model.UserSubscriptionSourcePurchase, nowTime, expiresAt)
		if err := tx.Create(&purchased).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.CreditLog{
			ID:        newID("credit"),
			UserID:    userID,
			Type:      model.CreditLogTypeSubscription,
			Amount:    -plan.PriceCredits,
			Balance:   purchaseBalance,
			RelatedID: purchased.ID,
			Remark:    "购买订阅套餐 " + plan.Title,
			CreatedAt: nowTime.Format(time.RFC3339),
		}).Error; err != nil {
			return err
		}
		if plan.QuotaCredits > 0 {
			if err := createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
				ID:             newID("sub-usage"),
				UserID:         userID,
				SubscriptionID: purchased.ID,
				Type:           model.SubscriptionUsageReset,
				Amount:         plan.QuotaCredits,
				Balance:        plan.QuotaCredits,
				Remark:         "订阅套餐首次发放额度 " + plan.Title,
				CreatedAt:      nowTime.Format(time.RFC3339),
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return model.SubscriptionPurchaseResult{}, err
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		return model.SubscriptionPurchaseResult{}, err
	}
	return model.SubscriptionPurchaseResult{User: publicUser(user), Subscription: purchased}, nil
}

func GrantUserSubscription(userID, planID string) (model.UserSubscription, error) {
	db, err := repository.DB()
	if err != nil {
		return model.UserSubscription{}, err
	}
	var granted model.UserSubscription
	err = db.Transaction(func(tx *gorm.DB) error {
		var plan model.SubscriptionPlan
		if err := tx.Where("id = ? AND enabled = ?", strings.TrimSpace(planID), true).First(&plan).Error; err != nil {
			return safeMessageError{message: "订阅套餐不存在或已停用"}
		}
		var user model.User
		if err := tx.First(&user, "id = ?", userID).Error; err != nil {
			return safeMessageError{message: "用户不存在"}
		}
		if user.Role == model.UserRoleAdmin {
			return safeMessageError{message: "管理员无需添加订阅"}
		}

		nowTime := time.Now()
		nowText := nowTime.Format(time.RFC3339)
		base := nowTime
		var active model.UserSubscription
		if result := tx.Where("user_id = ? AND status = ?", userID, model.UserSubscriptionActive).Order("expires_at desc").First(&active); result.Error == nil && active.PlanID == plan.ID {
			if expiresAt, parseErr := time.Parse(time.RFC3339, active.ExpiresAt); parseErr == nil && expiresAt.After(base) {
				base = expiresAt
			}
		}
		if err := tx.Model(&model.UserSubscription{}).Where("user_id = ? AND status = ?", userID, model.UserSubscriptionActive).Updates(map[string]any{
			"status": model.UserSubscriptionReplaced, "updated_at": nowText,
		}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"role": plan.UpgradeRole, "updated_at": nowText}).Error; err != nil {
			return err
		}

		granted = newUserSubscriptionSnapshot(userID, plan, model.UserSubscriptionSourceAdmin, nowTime, addSubscriptionDuration(base, plan.DurationUnit, plan.DurationValue, plan.DurationCustomSeconds))
		if err := tx.Create(&granted).Error; err != nil {
			return err
		}
		if granted.QuotaCredits > 0 {
			return createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
				ID: newID("sub-usage"), UserID: userID, SubscriptionID: granted.ID,
				Type: model.SubscriptionUsageReset, Amount: granted.QuotaCredits, Balance: granted.QuotaCredits,
				Remark: "管理员添加订阅套餐 " + granted.PlanTitle, CreatedAt: nowText,
			})
		}
		return nil
	})
	if err == nil {
		ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
	}
	return granted, err
}

func ResetUserSubscription(subscriptionID string) (model.UserSubscription, error) {
	db, err := repository.DB()
	if err != nil {
		return model.UserSubscription{}, err
	}
	var reset model.UserSubscription
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&reset, "id = ?", subscriptionID).Error; err != nil {
			return safeMessageError{message: "用户订阅不存在"}
		}
		nowTime := time.Now()
		if reset.Status != model.UserSubscriptionActive || reset.ExpiresAt <= nowTime.Format(time.RFC3339) {
			return safeMessageError{message: "只有生效中的订阅可以重置额度"}
		}
		before := reset.QuotaRemaining
		reset.QuotaRemaining = reset.QuotaCredits
		reset.LastResetAt, reset.NextResetAt = subscriptionResetTimes(nowTime, reset.ResetCycle, reset.ResetCustomSeconds)
		reset.UpdatedAt = nowTime.Format(time.RFC3339)
		if err := tx.Save(&reset).Error; err != nil {
			return err
		}
		return createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
			ID: newID("sub-usage"), UserID: reset.UserID, SubscriptionID: reset.ID,
			Type: model.SubscriptionUsageReset, Amount: reset.QuotaCredits - before, Balance: reset.QuotaCredits,
			Remark: "管理员重置订阅额度 " + reset.PlanTitle, CreatedAt: reset.UpdatedAt,
		})
	})
	if err == nil {
		ws.DefaultHub.SendToUser(reset.UserID, map[string]any{"type": "credits-changed"})
	}
	return reset, err
}

func VoidUserSubscription(subscriptionID string) error {
	return endUserSubscription(subscriptionID, false)
}

func DeleteUserSubscription(subscriptionID string) error {
	return endUserSubscription(subscriptionID, true)
}

func endUserSubscription(subscriptionID string, deleteRecord bool) error {
	db, err := repository.DB()
	if err != nil {
		return err
	}
	var subscription model.UserSubscription
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&subscription, "id = ?", subscriptionID).Error; err != nil {
			return safeMessageError{message: "用户订阅不存在"}
		}
		nowText := time.Now().Format(time.RFC3339)
		if subscription.Status == model.UserSubscriptionActive {
			if err := tx.Model(&model.User{}).Where("id = ? AND role = ?", subscription.UserID, subscription.UpgradeRole).Updates(map[string]any{
				"role": subscription.DowngradeRole, "updated_at": nowText,
			}).Error; err != nil {
				return err
			}
		}
		if deleteRecord {
			return tx.Delete(&model.UserSubscription{}, "id = ?", subscription.ID).Error
		}
		return tx.Model(&model.UserSubscription{}).Where("id = ?", subscription.ID).Updates(map[string]any{
			"status": model.UserSubscriptionVoided, "updated_at": nowText,
		}).Error
	})
	if err == nil {
		ws.DefaultHub.SendToUser(subscription.UserID, map[string]any{"type": "credits-changed"})
	}
	return err
}

func subscriptionResetTimes(base time.Time, cycle model.SubscriptionResetCycle, customSeconds int) (string, string) {
	if cycle == model.SubscriptionResetNone || cycle == "" {
		return "", ""
	}
	return base.Format(time.RFC3339), addSubscriptionResetCycle(base, cycle, customSeconds).Format(time.RFC3339)
}

func newUserSubscriptionSnapshot(userID string, plan model.SubscriptionPlan, source model.UserSubscriptionSource, startsAt, expiresAt time.Time) model.UserSubscription {
	startsText := startsAt.Format(time.RFC3339)
	lastResetAt, nextResetAt := subscriptionResetTimes(startsAt, plan.ResetCycle, plan.ResetCustomSeconds)
	return model.UserSubscription{
		ID: newID("sub"), UserID: userID, PlanID: plan.ID, PlanTitle: plan.Title,
		PriceCredits: plan.PriceCredits, UpgradeRole: plan.UpgradeRole, DowngradeRole: plan.DowngradeRole,
		QuotaCredits: plan.QuotaCredits, QuotaRemaining: plan.QuotaCredits, ResetCycle: plan.ResetCycle,
		ResetCustomSeconds: plan.ResetCustomSeconds, AllowWalletFallback: plan.AllowWalletFallback,
		Source: source, Status: model.UserSubscriptionActive, StartsAt: startsText, ExpiresAt: expiresAt.Format(time.RFC3339),
		LastResetAt: lastResetAt, NextResetAt: nextResetAt, CreatedAt: startsText, UpdatedAt: startsText,
	}
}

func ResetSubscriptionCreditsIfNeeded(userID string) error {
	db, err := repository.DB()
	if err != nil {
		return err
	}
	nowTime := time.Now()
	nowText := nowTime.Format(time.RFC3339)
	resetApplied := false
	err = db.Transaction(func(tx *gorm.DB) error {
		var subscription model.UserSubscription
		result := tx.Where(
			"user_id = ? AND status = ? AND reset_cycle != ? AND next_reset_at != '' AND next_reset_at <= ? AND expires_at > ?",
			userID, model.UserSubscriptionActive, model.SubscriptionResetNone, nowText, nowText,
		).Order("next_reset_at asc").First(&subscription)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil
		}
		if result.Error != nil {
			return result.Error
		}

		nextResetAt, parseErr := time.Parse(time.RFC3339, subscription.NextResetAt)
		if parseErr != nil {
			nextResetAt = nowTime
		}
		for !nextResetAt.After(nowTime) {
			nextResetAt = addSubscriptionResetCycle(nextResetAt, subscription.ResetCycle, subscription.ResetCustomSeconds)
		}

		claim := tx.Model(&model.UserSubscription{}).Where("id = ? AND next_reset_at = ?", subscription.ID, subscription.NextResetAt).Updates(map[string]any{
			"last_reset_at": nowText,
			"next_reset_at": nextResetAt.Format(time.RFC3339),
			"updated_at":    nowText,
		})
		if claim.Error != nil {
			return claim.Error
		}
		if claim.RowsAffected == 0 {
			return nil
		}
		resetApplied = true
		if err := tx.Model(&model.UserSubscription{}).Where("id = ?", subscription.ID).Update("quota_remaining", subscription.QuotaCredits).Error; err != nil {
			return err
		}
		return createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
			ID:             newID("sub-usage"),
			UserID:         userID,
			SubscriptionID: subscription.ID,
			Type:           model.SubscriptionUsageReset,
			Amount:         subscription.QuotaCredits - subscription.QuotaRemaining,
			Balance:        subscription.QuotaCredits,
			Remark:         "订阅套餐周期额度重置 " + subscription.PlanTitle,
			CreatedAt:      nowText,
		})
	})
	if err == nil && resetApplied {
		ws.DefaultHub.SendToUser(userID, map[string]any{"type": "credits-changed"})
	}
	return err
}

func createSubscriptionUsageLog(tx *gorm.DB, log model.SubscriptionUsageLog) error {
	return tx.Create(&log).Error
}

func ExpireUserSubscriptionIfNeeded(userID string) error {
	db, err := repository.DB()
	if err != nil {
		return err
	}
	nowText := time.Now().Format(time.RFC3339)
	return db.Transaction(func(tx *gorm.DB) error {
		var subscriptions []model.UserSubscription
		if err := tx.Where("user_id = ? AND status = ? AND expires_at <= ?", userID, model.UserSubscriptionActive, nowText).Order("expires_at desc").Find(&subscriptions).Error; err != nil {
			return err
		}
		if len(subscriptions) == 0 {
			return nil
		}
		latest := subscriptions[0]
		if err := tx.Model(&model.UserSubscription{}).Where("user_id = ? AND status = ? AND expires_at <= ?", userID, model.UserSubscriptionActive, nowText).Updates(map[string]any{
			"status":     model.UserSubscriptionExpired,
			"updated_at": nowText,
		}).Error; err != nil {
			return err
		}
		return tx.Model(&model.User{}).Where("id = ? AND role = ?", userID, latest.UpgradeRole).Updates(map[string]any{
			"role":       latest.DowngradeRole,
			"updated_at": nowText,
		}).Error
	})
}

func normalizeSubscriptionPlan(plan *model.SubscriptionPlan) error {
	plan.Title = strings.TrimSpace(plan.Title)
	plan.Subtitle = strings.TrimSpace(plan.Subtitle)
	plan.UpgradeRole = strings.TrimSpace(plan.UpgradeRole)
	plan.DowngradeRole = strings.TrimSpace(plan.DowngradeRole)
	if plan.Title == "" {
		return safeMessageError{message: "套餐标题不能为空"}
	}
	if plan.PriceCredits < 0 {
		return safeMessageError{message: "套餐价格不能小于 0"}
	}
	if plan.PurchaseLimit < 0 {
		plan.PurchaseLimit = 0
	}
	if plan.DurationUnit != model.SubscriptionDurationCustom && plan.DurationValue < 1 {
		return safeMessageError{message: "有效期数值必须大于 0"}
	}
	switch plan.DurationUnit {
	case model.SubscriptionDurationDay, model.SubscriptionDurationMonth, model.SubscriptionDurationYear, model.SubscriptionDurationHour:
	case model.SubscriptionDurationCustom:
		if plan.DurationCustomSeconds < 1 {
			return safeMessageError{message: "有效期自定义秒数必须大于 0"}
		}
	default:
		return safeMessageError{message: "有效期单位无效"}
	}
	if plan.QuotaCredits < 0 {
		return safeMessageError{message: "套餐额度不能小于 0"}
	}
	switch plan.ResetCycle {
	case "", model.SubscriptionResetNone:
		plan.ResetCycle = model.SubscriptionResetNone
		plan.ResetCustomSeconds = 0
	case model.SubscriptionResetDaily, model.SubscriptionResetWeekly, model.SubscriptionResetMonthly:
		if plan.QuotaCredits < 1 {
			return safeMessageError{message: "启用额度重置时，套餐额度必须大于 0"}
		}
		plan.ResetCustomSeconds = 0
	case model.SubscriptionResetCustom:
		if plan.QuotaCredits < 1 {
			return safeMessageError{message: "启用额度重置时，套餐额度必须大于 0"}
		}
		if plan.ResetCustomSeconds < 1 {
			return safeMessageError{message: "重置周期自定义秒数必须大于 0"}
		}
	default:
		return safeMessageError{message: "重置周期无效"}
	}
	if plan.UpgradeRole == "" {
		return safeMessageError{message: "请选择升级角色"}
	}
	if plan.DowngradeRole == "" {
		plan.DowngradeRole = string(model.UserRoleUser)
	}
	if _, ok, err := repository.GetRoleByName(plan.UpgradeRole); err != nil || !ok {
		return safeMessageError{message: "升级角色不存在"}
	}
	if _, ok, err := repository.GetRoleByName(plan.DowngradeRole); err != nil || !ok {
		return safeMessageError{message: "到期回退角色不存在"}
	}
	return nil
}

func addSubscriptionDuration(base time.Time, unit model.SubscriptionDurationUnit, value, customSeconds int) time.Time {
	switch unit {
	case model.SubscriptionDurationYear:
		return base.AddDate(value, 0, 0)
	case model.SubscriptionDurationMonth:
		return base.AddDate(0, value, 0)
	case model.SubscriptionDurationHour:
		return base.Add(time.Duration(value) * time.Hour)
	case model.SubscriptionDurationCustom:
		return base.Add(time.Duration(customSeconds) * time.Second)
	default:
		return base.AddDate(0, 0, value)
	}
}

func addSubscriptionResetCycle(base time.Time, cycle model.SubscriptionResetCycle, customSeconds int) time.Time {
	switch cycle {
	case model.SubscriptionResetMonthly:
		return base.AddDate(0, 1, 0)
	case model.SubscriptionResetWeekly:
		return base.AddDate(0, 0, 7)
	case model.SubscriptionResetCustom:
		return base.Add(time.Duration(customSeconds) * time.Second)
	default:
		return base.AddDate(0, 0, 1)
	}
}
