package repository

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestGetActiveAnnouncementsFiltersPlatformAndSubscription(t *testing.T) {
	withRiskEventTestDB(t)
	now := time.Now()
	targets := []model.AnnouncementTarget{
		model.AnnouncementTargetAll,
		model.AnnouncementTargetWeb,
		model.AnnouncementTargetApp,
		model.AnnouncementTargetSubscription,
		model.AnnouncementTargetMember,
	}
	for index, target := range targets {
		item := model.Announcement{
			ID:        "announcement-" + string(target),
			Title:     string(target),
			Content:   "content",
			Status:    model.AnnouncementStatusActive,
			Target:    target,
			CreatedAt: now.Add(time.Duration(index) * time.Second),
			UpdatedAt: now,
		}
		if _, err := SaveAnnouncement(item); err != nil {
			t.Fatalf("save %s announcement: %v", target, err)
		}
	}

	assertTargets := func(platform string, subscribed bool, expected ...model.AnnouncementTarget) {
		t.Helper()
		items, err := GetActiveAnnouncements(platform, subscribed)
		if err != nil {
			t.Fatalf("list %s announcements: %v", platform, err)
		}
		actual := make(map[model.AnnouncementTarget]bool, len(items))
		for _, item := range items {
			actual[item.Target] = true
		}
		if len(actual) != len(expected) {
			t.Fatalf("platform=%s subscribed=%v targets=%v, expected=%v", platform, subscribed, actual, expected)
		}
		for _, target := range expected {
			if !actual[target] {
				t.Fatalf("platform=%s subscribed=%v missing target %s", platform, subscribed, target)
			}
		}
	}

	assertTargets("web", false, model.AnnouncementTargetAll, model.AnnouncementTargetWeb)
	assertTargets("app", false, model.AnnouncementTargetAll, model.AnnouncementTargetApp)
	assertTargets("app", true,
		model.AnnouncementTargetAll,
		model.AnnouncementTargetApp,
		model.AnnouncementTargetSubscription,
		model.AnnouncementTargetMember,
	)
}
