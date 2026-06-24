package repository

import (
	"github.com/basketikun/infinite-canvas/model"
)

func ListRequestLogs(q model.Query, method string) (model.RequestLogList, error) {
	var list model.RequestLogList
	db, err := DB()
	if err != nil {
		return list, err
	}
	db = db.Model(&model.RequestLog{})

	if q.Keyword != "" {
		keyword := "%" + q.Keyword + "%"
		db = db.Where("username LIKE ? OR model LIKE ? OR url LIKE ? OR error_msg LIKE ?", keyword, keyword, keyword, keyword)
	}
	if method != "" {
		db = db.Where("method = ?", method)
	}

	if err := db.Count(&list.Total).Error; err != nil {
		return list, err
	}

	q.Normalize()
	err = db.Order("created_at DESC").Offset(q.Offset()).Limit(q.PageSize).Find(&list.Items).Error
	return list, err
}

func CreateRequestLog(log *model.RequestLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(log).Error
}

func UpdateRequestLog(id string, updates map[string]interface{}) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.RequestLog{}).Where("id = ?", id).Updates(updates).Error
}

func BatchDeleteRequestLogs(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("id IN ?", ids).Delete(&model.RequestLog{}).Error
}
