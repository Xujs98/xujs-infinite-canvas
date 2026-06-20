package service

import (
	"math/rand"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const redeemCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func GenerateRedeemCodes(count int, codeType model.RedeemCodeType, credits int, membershipDays int, batchName string, remark string) ([]model.RedeemCode, error) {
	if count < 1 {
		count = 1
	}
	if count > 500 {
		count = 500
	}
	now := now()
	items := make([]model.RedeemCode, count)
	for i := 0; i < count; i++ {
		items[i] = model.RedeemCode{
			ID:             newID("rc"),
			Code:           generateCode(16),
			Type:           codeType,
			Credits:        credits,
			MembershipDays: membershipDays,
			Status:         model.RedeemCodeStatusUnused,
			BatchName:      strings.TrimSpace(batchName),
			Remark:         strings.TrimSpace(remark),
			CreatedAt:      now,
			UpdatedAt:      now,
		}
	}
	if err := repository.BatchSaveRedeemCodes(items); err != nil {
		return nil, err
	}
	return items, nil
}

func ListRedeemCodes(q model.Query) (model.RedeemCodeList, error) {
	items, total, err := repository.ListRedeemCodes(q)
	if err != nil {
		return model.RedeemCodeList{}, err
	}
	// 收集已使用的用户 ID，批量查询用户名。
	ids := make([]string, 0)
	for _, item := range items {
		if item.UsedBy != "" {
			ids = append(ids, item.UsedBy)
		}
	}
	if len(ids) > 0 {
		nameMap, err := repository.GetUsersByIDs(ids)
		if err == nil {
			for i := range items {
				if name, ok := nameMap[items[i].UsedBy]; ok {
					items[i].UsedByName = name
				}
			}
		}
	}
	return model.RedeemCodeList{Items: items, Total: int(total)}, nil
}

func DeleteRedeemCode(id string) error {
	return repository.DeleteRedeemCode(id)
}

func BatchDeleteRedeemCodes(ids []string) error {
	return repository.BatchDeleteRedeemCodes(ids)
}

func RedeemCode(userID string, code string) (model.AuthUser, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return model.AuthUser{}, safeMessageError{message: "请输入卡密"}
	}
	item, ok, err := repository.GetRedeemCodeByCode(code)
	if err != nil {
		return model.AuthUser{}, err
	}
	if !ok {
		return model.AuthUser{}, safeMessageError{message: "卡密不存在"}
	}
	if item.Status == model.RedeemCodeStatusUsed {
		return model.AuthUser{}, safeMessageError{message: "卡密已被使用"}
	}

	user, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return model.AuthUser{}, err
	}
	if !ok {
		return model.AuthUser{}, safeMessageError{message: "用户不存在"}
	}

	now := now()

	if item.Type == model.RedeemCodeTypeCredits && item.Credits > 0 {
		oldCredits := user.Credits
		user.Credits += item.Credits
		user.UpdatedAt = now
		user, err = repository.SaveUser(user)
		if err != nil {
			return model.AuthUser{}, err
		}
		_, err = repository.SaveCreditLog(model.CreditLog{
			ID:        newID("credit"),
			UserID:    user.ID,
			Type:      model.CreditLogTypeRedeem,
			Amount:    item.Credits,
			Balance:   user.Credits,
			RelatedID: item.ID,
			Remark:    "兑换卡密 " + code,
			CreatedAt: now,
		})
		if err != nil {
			return model.AuthUser{}, err
		}
		_ = oldCredits
	} else if item.Type == model.RedeemCodeTypeMembership && item.MembershipDays > 0 {
		base := time.Now()
		if user.MembershipExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, user.MembershipExpiresAt); err == nil && t.After(base) {
				base = t
			}
		}
		user.MembershipExpiresAt = base.AddDate(0, 0, item.MembershipDays).Format(time.RFC3339)
		user.UpdatedAt = now
		user, err = repository.SaveUser(user)
		if err != nil {
			return model.AuthUser{}, err
		}
	}

	item.Status = model.RedeemCodeStatusUsed
	item.UsedBy = userID
	item.UsedAt = now
	item.UpdatedAt = now
	_, err = repository.SaveRedeemCode(item)
	if err != nil {
		return model.AuthUser{}, err
	}

	return model.PublicUser(user), nil
}

func generateCode(length int) string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, length)
	for i := range b {
		b[i] = redeemCodeChars[r.Intn(len(redeemCodeChars))]
	}
	return string(b)
}
