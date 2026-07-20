package repository

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestListRequestLogsIncludesTotalInStats(t *testing.T) {
	withRiskEventTestDB(t)
	now := time.Now()
	entries := []model.RequestLog{
		{ID: "usage-1", Success: true, StatusCode: 200, CreatedAt: now},
		{ID: "usage-2", Success: true, StatusCode: 200, CreatedAt: now},
		{ID: "usage-3", Success: false, StatusCode: 400, ErrorMsg: "failed", CreatedAt: now},
	}
	for index := range entries {
		if err := CreateRequestLog(&entries[index]); err != nil {
			t.Fatalf("create request log: %v", err)
		}
	}

	result, err := ListRequestLogs(model.RequestLogQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("list request logs: %v", err)
	}
	if result.Total != 3 || result.Stats.Total != 3 || result.Stats.Success != 2 || result.Stats.Failed != 1 {
		t.Fatalf("unexpected list statistics: %+v", result)
	}
}
