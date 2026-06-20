package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// ListRedeemCodes 分页查询卡密。
func ListRedeemCodes(q model.Query) ([]model.RedeemCode, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.RedeemCode{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("code LIKE ? OR batch_name LIKE ? OR remark LIKE ? OR used_by LIKE ?", like, like, like, like)
	}
	if t := strings.TrimSpace(q.Type); t != "" {
		tx = tx.Where("type = ?", t)
	}
	if s := strings.TrimSpace(q.Status); s != "" {
		tx = tx.Where("status = ?", s)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.RedeemCode
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

// GetRedeemCodeByCode 根据卡密码查询卡密。
func GetRedeemCodeByCode(code string) (model.RedeemCode, bool, error) {
	db, err := DB()
	if err != nil {
		return model.RedeemCode{}, false, err
	}
	item := model.RedeemCode{}
	err = db.Where("code = ?", code).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.RedeemCode{}, false, nil
	}
	return item, err == nil, err
}

// SaveRedeemCode 保存卡密。
func SaveRedeemCode(item model.RedeemCode) (model.RedeemCode, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Save(&item).Error
}

// BatchSaveRedeemCodes 批量保存卡密。
func BatchSaveRedeemCodes(items []model.RedeemCode) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.CreateInBatches(items, 100).Error
}

// DeleteRedeemCode 删除卡密。
func DeleteRedeemCode(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.RedeemCode{}, "id = ?", id).Error
}

// BatchDeleteRedeemCodes 批量删除卡密。
func BatchDeleteRedeemCodes(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.RedeemCode{}, "id IN ?", ids).Error
}
