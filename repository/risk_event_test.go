package repository

import (
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

func withRiskEventTestDB(t *testing.T) {
	t.Helper()
	previousConfig := config.Cfg
	previousDB, previousErr, previousOnce := db, dbErr, dbOnce
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "risk-events.db")
	db, dbErr, dbOnce = nil, nil, sync.Once{}
	t.Cleanup(func() {
		if db != nil {
			if sqlDB, err := db.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		config.Cfg = previousConfig
		db, dbErr, dbOnce = previousDB, previousErr, previousOnce
	})
}

func TestSaveRiskEventAggregatesMatchingOpenEvents(t *testing.T) {
	withRiskEventTestDB(t)
	base := time.Date(2026, 7, 20, 12, 0, 0, 0, time.Local)
	first := model.RiskEvent{
		ID: "risk-1", EventType: "login_failed", Level: model.RiskLevelMedium, Status: model.RiskStatusOpen,
		IPAddress: "198.51.100.10", Path: "/api/auth/login", OccurrenceCount: 1,
		FirstSeenAt: base, LastSeenAt: base, CreatedAt: base, UpdatedAt: base,
	}
	if _, err := SaveRiskEvent(first); err != nil {
		t.Fatalf("save first event: %v", err)
	}
	second := first
	second.ID = "risk-2"
	second.Level = model.RiskLevelHigh
	second.LastSeenAt = base.Add(time.Minute)
	second.UpdatedAt = second.LastSeenAt
	merged, err := SaveRiskEvent(second)
	if err != nil {
		t.Fatalf("save matching event: %v", err)
	}
	if merged.ID != first.ID || merged.OccurrenceCount != 2 || merged.Level != model.RiskLevelHigh {
		t.Fatalf("unexpected merged event: %+v", merged)
	}
	list, err := ListRiskEvents(model.Query{Page: 1, PageSize: 10}, "", "", "")
	if err != nil || list.Total != 1 || len(list.Items) != 1 {
		t.Fatalf("expected one aggregated event, list=%+v err=%v", list, err)
	}
}

func TestUpdateRiskEventStatus(t *testing.T) {
	withRiskEventTestDB(t)
	now := time.Now()
	event := model.RiskEvent{ID: "risk-status", EventType: "app_request_replay", Level: model.RiskLevelCritical, Status: model.RiskStatusOpen, OccurrenceCount: 1, FirstSeenAt: now, LastSeenAt: now, CreatedAt: now, UpdatedAt: now}
	if _, err := SaveRiskEvent(event); err != nil {
		t.Fatalf("save event: %v", err)
	}
	if err := UpdateRiskEventStatus(event.ID, model.RiskStatusResolved, "admin-1", now.Add(time.Minute)); err != nil {
		t.Fatalf("resolve event: %v", err)
	}
	list, err := ListRiskEvents(model.Query{Status: string(model.RiskStatusResolved), Page: 1, PageSize: 10}, "", "", "")
	if err != nil || len(list.Items) != 1 || list.Items[0].ResolvedBy != "admin-1" || list.Items[0].ResolvedAt == nil {
		t.Fatalf("unexpected resolved event: %+v err=%v", list, err)
	}
}
