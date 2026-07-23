package repository

import (
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

func withDatabaseTestConfig(t *testing.T, dsn string) {
	t.Helper()
	previousConfig := config.Cfg
	previousDB, previousErr, previousOnce := db, dbErr, dbOnce
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = dsn
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

func TestSQLiteDatabaseUsesSerializedWALPool(t *testing.T) {
	withDatabaseTestConfig(t, filepath.Join(t.TempDir(), "concurrency.db"))
	database, err := DB()
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("read database pool: %v", err)
	}
	if maxOpen := sqlDB.Stats().MaxOpenConnections; maxOpen != 1 {
		t.Fatalf("MaxOpenConnections = %d, want 1", maxOpen)
	}
	var busyTimeout int
	if err := database.Raw("PRAGMA busy_timeout").Scan(&busyTimeout).Error; err != nil {
		t.Fatalf("read busy_timeout: %v", err)
	}
	if busyTimeout != sqliteBusyTimeoutMS {
		t.Fatalf("busy_timeout = %d, want %d", busyTimeout, sqliteBusyTimeoutMS)
	}
	var journalMode string
	if err := database.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil {
		t.Fatalf("read journal_mode: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("journal_mode = %q, want WAL", journalMode)
	}

	tx := database.Begin()
	if tx.Error != nil {
		t.Fatalf("begin write transaction: %v", tx.Error)
	}
	if err := tx.Create(&model.CallLog{ID: "held-write"}).Error; err != nil {
		_ = tx.Rollback()
		t.Fatalf("create held write: %v", err)
	}
	writeDone := make(chan error, 1)
	go func() {
		writeDone <- database.Create(&model.RequestLog{ID: "queued-write"}).Error
	}()
	select {
	case err := <-writeDone:
		_ = tx.Rollback()
		t.Fatalf("queued write returned before transaction completed: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err := tx.Commit().Error; err != nil {
		t.Fatalf("commit held write: %v", err)
	}
	select {
	case err := <-writeDone:
		if err != nil {
			t.Fatalf("queued write failed after transaction completed: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("queued write did not resume after transaction completed")
	}
}

func TestSQLiteDSNPreservesConfiguredBusyTimeout(t *testing.T) {
	dsn := sqliteDSNWithConcurrencyDefaults("custom.db?_pragma=busy_timeout(2500)")
	if strings.Contains(dsn, "busy_timeout(15000)") {
		t.Fatalf("custom busy timeout was overridden: %s", dsn)
	}
	if !strings.Contains(dsn, "journal_mode(WAL)") {
		t.Fatalf("WAL default missing: %s", dsn)
	}
}
