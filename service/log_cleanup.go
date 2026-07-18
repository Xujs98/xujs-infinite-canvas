package service

import (
	"log"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/repository"
)

var logCleanupMu sync.Mutex

const (
	defaultRequestLogRetentionDays = 30
	defaultRequestLogMaxRows       = 5000
	defaultCallLogRetentionDays    = 30
	defaultCallLogMaxRows          = 5000
	defaultCreditLogRetentionDays  = 365
	defaultCreditLogMaxRows        = 100000
)

func RunConfiguredLogCleanup() {
	logCleanupMu.Lock()
	defer logCleanupMu.Unlock()

	settings, err := GetSystemSettings()
	if err != nil {
		log.Printf("log cleanup settings read failed: %v", err)
		return
	}
	nowTime := time.Now()
	if settings.RequestLogCleanupEnabled {
		deleted, cleanupErr := repository.PruneRequestLogs(nowTime.AddDate(0, 0, -settings.RequestLogRetentionDays), settings.RequestLogMaxRows)
		if cleanupErr != nil {
			log.Printf("request log cleanup failed: %v", cleanupErr)
		} else if deleted > 0 {
			log.Printf("request log cleanup removed %d expired or excess records", deleted)
		}
	}
	if settings.CallLogCleanupEnabled {
		deleted, cleanupErr := repository.PruneCallLogs(nowTime.AddDate(0, 0, -settings.CallLogRetentionDays), settings.CallLogMaxRows)
		if cleanupErr != nil {
			log.Printf("call log cleanup failed: %v", cleanupErr)
		} else if deleted > 0 {
			log.Printf("call log cleanup removed %d expired or excess records", deleted)
		}
	}
	if settings.CreditLogCleanupEnabled {
		deleted, cleanupErr := repository.PruneCreditLogs(nowTime.AddDate(0, 0, -settings.CreditLogRetentionDays), settings.CreditLogMaxRows)
		if cleanupErr != nil {
			log.Printf("credit log cleanup failed: %v", cleanupErr)
		} else if deleted > 0 {
			log.Printf("credit log cleanup removed %d expired or excess records", deleted)
		}
	}
}

func StartLogCleanupScheduler() {
	go func() {
		RunConfiguredLogCleanup()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			RunConfiguredLogCleanup()
		}
	}()
}
