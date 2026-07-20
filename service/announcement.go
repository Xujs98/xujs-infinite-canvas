package service

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListAnnouncements(q model.Query) (model.AnnouncementList, error) {
	items, total, err := repository.ListAnnouncements(q)
	if err != nil {
		return model.AnnouncementList{}, err
	}
	return model.AnnouncementList{
		Items: items,
		Total: total,
	}, nil
}

func SaveAnnouncement(item model.Announcement) (model.Announcement, error) {
	if item.Status == "" {
		item.Status = model.AnnouncementStatusDraft
	}
	if item.NotifyType == "" {
		item.NotifyType = model.AnnouncementNotifySilent
	}
	if item.Target == "" {
		item.Target = model.AnnouncementTargetAll
	}
	if item.ID == "" {
		item.ID = newID("ann")
		item.CreatedAt = time.Now()
	}
	item.UpdatedAt = time.Now()
	return repository.SaveAnnouncement(item)
}

func DeleteAnnouncement(id string) error {
	return repository.DeleteAnnouncement(id)
}

func GetActiveAnnouncements(platform string, subscribed bool) ([]model.Announcement, error) {
	return repository.GetActiveAnnouncements(platform, subscribed)
}

func BatchDeleteAnnouncements(ids []string) error {
	return repository.BatchDeleteAnnouncements(ids)
}

func BatchUpdateAnnouncementPinned(ids []string, pinned bool) error {
	return repository.BatchUpdateAnnouncementPinned(ids, pinned)
}
