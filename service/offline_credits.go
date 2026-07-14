package service

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func SyncOfflineCredits(userID string, req model.OfflineCreditsSyncRequest) (model.OfflineCreditsSyncResponse, error) {
	clientID := strings.TrimSpace(req.ClientID)
	if clientID == "" {
		return model.OfflineCreditsSyncResponse{}, safeMessageError{message: "缺少客户端标识"}
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return model.OfflineCreditsSyncResponse{}, err
	}
	if !ok {
		return model.OfflineCreditsSyncResponse{}, safeMessageError{message: "用户不存在"}
	}
	if !IsRoleAllowedOffline(string(user.Role)) {
		return model.OfflineCreditsSyncResponse{}, safeMessageError{message: "当前角色不允许离线使用"}
	}
	offlineCreditLimit := GetRoleOfflineCreditLimit(string(user.Role))

	items := append([]model.OfflineCreditItem(nil), req.Items...)
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].CreatedAt < items[j].CreatedAt
	})

	db, err := repository.DB()
	if err != nil {
		return model.OfflineCreditsSyncResponse{}, err
	}

	processedIDs := make([]string, 0, len(items))
	err = db.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			item.ID = strings.TrimSpace(item.ID)
			if item.ID == "" || item.Amount <= 0 {
				continue
			}
			relatedID := "offline:" + clientID + ":" + item.ID
			var existing model.CreditLog
			err := tx.Where("related_id = ?", relatedID).First(&existing).Error
			if err == nil {
				processedIDs = append(processedIDs, item.ID)
				continue
			}
			if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}

			amount := item.Amount
			logType := model.CreditLogTypeOfflineRefund
			remark := "离线结算返还 " + item.Model
			if item.Type == "consume" {
				amount = -item.Amount
				logType = model.CreditLogTypeOfflineConsume
				remark = "离线结算调用模型 " + item.Model
			} else if item.Type != "refund" {
				continue
			}

			var current model.User
			if err := tx.First(&current, "id = ?", userID).Error; err != nil {
				return err
			}
			nextBalance := current.Credits + amount
			if item.Type == "consume" && offlineCreditLimit > 0 && nextBalance < -offlineCreditLimit {
				return safeMessageError{message: "离线消费超过当前角色最大预支额度"}
			}
			if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
				"credits":    nextBalance,
				"updated_at": now(),
			}).Error; err != nil {
				return err
			}
			extra, _ := json.Marshal(map[string]string{
				"clientId":  clientID,
				"offlineId": item.ID,
				"model":     item.Model,
				"mediaType": item.MediaType,
				"createdAt": item.CreatedAt,
			})
			logCreatedAt := item.CreatedAt
			if strings.TrimSpace(logCreatedAt) == "" {
				logCreatedAt = now()
			}
			if err := tx.Save(&model.CreditLog{
				ID:        newID("credit"),
				UserID:    userID,
				Type:      logType,
				Amount:    amount,
				Balance:   nextBalance,
				RelatedID: relatedID,
				Remark:    remark,
				Extra:     string(extra),
				CreatedAt: logCreatedAt,
			}).Error; err != nil {
				return err
			}
			processedIDs = append(processedIDs, item.ID)
		}
		return nil
	})
	if err != nil {
		return model.OfflineCreditsSyncResponse{}, err
	}

	refreshed, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return model.OfflineCreditsSyncResponse{}, err
	}
	if !ok {
		return model.OfflineCreditsSyncResponse{}, safeMessageError{message: "用户不存在"}
	}
	return model.OfflineCreditsSyncResponse{
		Balance:      refreshed.Credits,
		Blocked:      refreshed.Credits < 0,
		ProcessedIDs: processedIDs,
	}, nil
}
