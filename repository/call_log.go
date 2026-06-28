package repository

import (
	"github.com/basketikun/infinite-canvas/model"
)

func ListCallLogs(q model.Query, status string) (model.CallLogList, error) {
	var result model.CallLogList
	db, err := DB()
	if err != nil {
		return result, err
	}
	db = db.Model(&model.CallLog{})
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("username LIKE ? OR model LIKE ? OR error_msg LIKE ?", like, like, like)
	}
	if status == "success" {
		db = db.Where("success = ?", true)
	} else if status == "fail" {
		db = db.Where("success = ?", false)
	}
	if err := db.Count(&result.Total).Error; err != nil {
		return result, err
	}
	q.Normalize()
	err = db.Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&result.Items).Error
	return result, err
}

func CreateCallLog(log *model.CallLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(log).Error
}

func BatchDeleteCallLogs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.CallLog{}).Error
}
