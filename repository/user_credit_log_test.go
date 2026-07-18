package repository

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

func withCreditLogTestDB(t *testing.T) {
	t.Helper()
	previousConfig := config.Cfg
	previousDB, previousErr, previousOnce := db, dbErr, dbOnce
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "credit-logs.db")
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

func seedCreditLogs(t *testing.T, count int) {
	t.Helper()
	database, err := DB()
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := database.Create(&model.User{ID: "user-1", Username: "user-1"}).Error; err != nil {
		t.Fatalf("create test user: %v", err)
	}
	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	for index := 1; index <= count; index++ {
		logType := model.CreditLogTypeAIConsume
		if index%2 == 0 {
			logType = model.CreditLogTypeCheckIn
		}
		entry := model.CreditLog{
			ID:        fmt.Sprintf("log-%02d", index),
			UserID:    "user-1",
			Type:      logType,
			Amount:    -1,
			CreatedAt: base.Add(time.Duration(index) * time.Hour).Format(time.RFC3339),
		}
		if err := database.Create(&entry).Error; err != nil {
			t.Fatalf("create credit log %d: %v", index, err)
		}
	}
}

func TestListVisibleUserCreditLogsRestrictsLatestRows(t *testing.T) {
	withCreditLogTestDB(t)
	seedCreditLogs(t, 6)

	logs, total, err := ListVisibleUserCreditLogs("user-1", model.Query{Page: 1, PageSize: 10}, 3)
	if err != nil {
		t.Fatalf("list visible logs: %v", err)
	}
	if total != 3 || len(logs) != 3 {
		t.Fatalf("expected exactly 3 visible rows, got total=%d rows=%d", total, len(logs))
	}
	if logs[0].ID != "log-06" || logs[2].ID != "log-04" {
		t.Fatalf("expected latest rows 06..04, got %+v", logs)
	}

	filtered, filteredTotal, err := ListVisibleUserCreditLogs("user-1", model.Query{Page: 1, PageSize: 10, Type: string(model.CreditLogTypeAIConsume)}, 3)
	if err != nil {
		t.Fatalf("list filtered visible logs: %v", err)
	}
	if filteredTotal != 1 || len(filtered) != 1 || filtered[0].ID != "log-05" {
		t.Fatalf("filter must stay inside latest 3 rows, got total=%d rows=%+v", filteredTotal, filtered)
	}
}

func TestPruneCreditLogsAppliesAgeAndMaximumRows(t *testing.T) {
	withCreditLogTestDB(t)
	seedCreditLogs(t, 6)

	cutoff := time.Date(2026, 7, 1, 3, 30, 0, 0, time.UTC)
	deleted, err := PruneCreditLogs(cutoff, 2)
	if err != nil {
		t.Fatalf("prune credit logs: %v", err)
	}
	if deleted != 4 {
		t.Fatalf("expected 4 deleted rows, got %d", deleted)
	}
	logs, total, err := ListUserCreditLogs("user-1", model.Query{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list remaining logs: %v", err)
	}
	if total != 2 || len(logs) != 2 || logs[0].ID != "log-06" || logs[1].ID != "log-05" {
		t.Fatalf("unexpected remaining logs total=%d rows=%+v", total, logs)
	}
}
