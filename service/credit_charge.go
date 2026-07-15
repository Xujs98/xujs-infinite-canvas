package service

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func ChargeUserCredits(userID, modelName string, credits int, path string) (model.CreditCharge, error) {
	if credits <= 0 {
		return model.CreditCharge{}, nil
	}
	if err := ExpireUserSubscriptionIfNeeded(userID); err != nil {
		return model.CreditCharge{}, err
	}
	if err := ResetSubscriptionCreditsIfNeeded(userID); err != nil {
		return model.CreditCharge{}, err
	}
	db, err := repository.DB()
	if err != nil {
		return model.CreditCharge{}, err
	}
	nowText := time.Now().Format(time.RFC3339)
	charge := model.CreditCharge{
		ID:           newID("charge"),
		UserID:       userID,
		TotalCredits: credits,
		Model:        modelName,
		Path:         path,
		Status:       model.CreditChargePending,
		CreatedAt:    nowText,
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", userID).Error; err != nil {
			return safeMessageError{message: "用户不存在"}
		}

		var subscription model.UserSubscription
		subResult := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(
			"user_id = ? AND status = ? AND expires_at > ?", userID, model.UserSubscriptionActive, nowText,
		).Order("expires_at desc").First(&subscription)
		if subResult.Error != nil && !errors.Is(subResult.Error, gorm.ErrRecordNotFound) {
			return subResult.Error
		}

		if subResult.Error == nil {
			charge.SubscriptionID = subscription.ID
			var splitErr error
			charge.SubscriptionCredits, charge.WalletCredits, splitErr = splitSubscriptionCharge(credits, subscription.QuotaRemaining, subscription.AllowWalletFallback)
			if splitErr != nil {
				return splitErr
			}
		} else {
			charge.WalletCredits = credits
		}

		if user.Credits < charge.WalletCredits {
			return safeMessageError{message: "算力点不足"}
		}
		if charge.SubscriptionCredits > 0 {
			nextQuota := subscription.QuotaRemaining - charge.SubscriptionCredits
			if err := tx.Model(&model.UserSubscription{}).Where("id = ?", subscription.ID).Updates(map[string]any{
				"quota_remaining": nextQuota,
				"updated_at":      nowText,
			}).Error; err != nil {
				return err
			}
			if err := createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
				ID:             newID("sub-usage"),
				UserID:         userID,
				SubscriptionID: subscription.ID,
				Type:           model.SubscriptionUsageConsume,
				Amount:         -charge.SubscriptionCredits,
				Balance:        nextQuota,
				Model:          modelName,
				Path:           path,
				Remark:         "订阅额度调用模型 " + modelName,
				CreatedAt:      nowText,
			}); err != nil {
				return err
			}
		}
		if charge.WalletCredits > 0 {
			nextWallet := user.Credits - charge.WalletCredits
			if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
				"credits":    nextWallet,
				"updated_at": nowText,
			}).Error; err != nil {
				return err
			}
			extra, _ := json.Marshal(map[string]any{"model": modelName, "path": path, "chargeId": charge.ID, "subscriptionCredits": charge.SubscriptionCredits})
			if err := tx.Create(&model.CreditLog{
				ID:        newID("credit"),
				UserID:    userID,
				Type:      model.CreditLogTypeAIConsume,
				Amount:    -charge.WalletCredits,
				Balance:   nextWallet,
				RelatedID: charge.ID,
				Remark:    "调用模型 " + modelName,
				Extra:     string(extra),
				CreatedAt: nowText,
			}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&charge).Error
	})
	return charge, err
}

func splitSubscriptionCharge(required, remaining int, allowWalletFallback bool) (int, int, error) {
	subscriptionCredits := min(required, max(0, remaining))
	walletCredits := required - subscriptionCredits
	if walletCredits > 0 && !allowWalletFallback {
		return 0, 0, safeMessageError{message: "订阅套餐额度不足，且未开启钱包余额补扣"}
	}
	return subscriptionCredits, walletCredits, nil
}

func RefundCreditCharge(userID, chargeID, modelName, path string) error {
	if chargeID == "" {
		return nil
	}
	db, err := repository.DB()
	if err != nil {
		return err
	}
	nowText := time.Now().Format(time.RFC3339)
	return db.Transaction(func(tx *gorm.DB) error {
		var charge model.CreditCharge
		result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", chargeID, userID).First(&charge)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return safeMessageError{message: "扣费记录不存在"}
		}
		if result.Error != nil {
			return result.Error
		}
		if charge.Status == model.CreditChargeRefunded {
			return nil
		}

		if charge.SubscriptionCredits > 0 && charge.SubscriptionID != "" {
			var subscription model.UserSubscription
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&subscription, "id = ?", charge.SubscriptionID).Error; err == nil {
				nextQuota := min(subscription.QuotaCredits, subscription.QuotaRemaining+charge.SubscriptionCredits)
				refundAmount := nextQuota - subscription.QuotaRemaining
				if err := tx.Model(&model.UserSubscription{}).Where("id = ?", subscription.ID).Updates(map[string]any{
					"quota_remaining": nextQuota,
					"updated_at":      nowText,
				}).Error; err != nil {
					return err
				}
				if refundAmount > 0 {
					if err := createSubscriptionUsageLog(tx, model.SubscriptionUsageLog{
						ID:             newID("sub-usage"),
						UserID:         userID,
						SubscriptionID: subscription.ID,
						Type:           model.SubscriptionUsageRefund,
						Amount:         refundAmount,
						Balance:        nextQuota,
						Model:          modelName,
						Path:           path,
						Remark:         "模型调用失败返还订阅额度 " + modelName,
						CreatedAt:      nowText,
					}); err != nil {
						return err
					}
				}
			}
		}
		if charge.WalletCredits > 0 {
			var user model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", userID).Error; err != nil {
				return err
			}
			nextWallet := user.Credits + charge.WalletCredits
			if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"credits": nextWallet, "updated_at": nowText}).Error; err != nil {
				return err
			}
			extra, _ := json.Marshal(map[string]any{"model": modelName, "path": path, "chargeId": charge.ID})
			if err := tx.Create(&model.CreditLog{
				ID:        newID("credit"),
				UserID:    userID,
				Type:      model.CreditLogTypeAIRefund,
				Amount:    charge.WalletCredits,
				Balance:   nextWallet,
				RelatedID: charge.ID,
				Remark:    "模型调用失败返还 " + modelName,
				Extra:     string(extra),
				CreatedAt: nowText,
			}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.CreditCharge{}).Where("id = ? AND status = ?", charge.ID, model.CreditChargePending).Updates(map[string]any{
			"status":      model.CreditChargeRefunded,
			"refunded_at": nowText,
		}).Error
	})
}
