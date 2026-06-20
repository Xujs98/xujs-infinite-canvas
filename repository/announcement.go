package repository

import (
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func ListAnnouncements(q model.Query) ([]model.Announcement, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.Announcement{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("title LIKE ? OR content LIKE ?", like, like)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.Announcement
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

func GetAnnouncementByID(id string) (model.Announcement, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Announcement{}, false, err
	}
	item := model.Announcement{}
	err = db.Where("id = ?", id).First(&item).Error
	if err != nil {
		return model.Announcement{}, false, nil
	}
	return item, true, nil
}

func SaveAnnouncement(item model.Announcement) (model.Announcement, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Save(&item).Error
}

func DeleteAnnouncement(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Announcement{}, "id = ?", id).Error
}

func GetActiveAnnouncements(target string) ([]model.Announcement, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tx := db.Model(&model.Announcement{}).Where("status = ?", model.AnnouncementStatusActive)
	tx = tx.Where("(start_time IS NULL OR start_time <= ?)", now)
	tx = tx.Where("(end_time IS NULL OR end_time >= ?)", now)
	if target == "member" {
		tx = tx.Where("target IN ('all', 'member')")
	} else {
		tx = tx.Where("target = 'all'")
	}
	var items []model.Announcement
	err = tx.Order("pinned desc, created_at desc").Find(&items).Error
	return items, err
}

func BatchDeleteAnnouncements(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Announcement{}, "id IN ?", ids).Error
}

func BatchUpdateAnnouncementPinned(ids []string, pinned bool) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.Announcement{}).Where("id IN ?", ids).Update("pinned", pinned).Error
}
