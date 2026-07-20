package service

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/repository"
)

func TestBuildAnalyticsResultAggregatesExistingData(t *testing.T) {
	location := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, 7, 20, 10, 30, 0, 0, location)
	window := newAnalyticsWindow("1d", now)
	calls := []repository.AnalyticsCallRecord{
		{UserID: "user-1", Username: "alice", Model: "gpt-image-2", Success: true, CreatedAt: time.Date(2026, 7, 19, 12, 10, 0, 0, location)},
		{UserID: "user-1", Username: "alice", Model: "gpt-image-2", Success: false, CreatedAt: time.Date(2026, 7, 19, 13, 10, 0, 0, location)},
		{UserID: "user-2", Username: "bob", Model: "grok-video", Success: true, CreatedAt: time.Date(2026, 7, 19, 14, 10, 0, 0, location)},
	}
	users := []repository.AnalyticsUserRecord{
		{ID: "user-1", Username: "alice", DisplayName: "Alice", CreatedAt: "2026-07-19T12:00:00+08:00"},
		{ID: "user-2", Username: "bob", DisplayName: "Bob", CreatedAt: "2026-06-01T12:00:00+08:00"},
	}
	usage := []repository.AnalyticsUsageRecord{
		{UserID: "user-1", Amount: -30, CreatedAt: "2026-07-19T12:20:00+08:00"},
		{UserID: "user-2", Amount: -20, CreatedAt: "2026-07-19T14:20:00+08:00"},
	}

	result := buildAnalyticsResult(window, calls, users, usage)
	if result.Range != "1d" || len(result.Model.Trend) != 24 {
		t.Fatalf("unexpected window: range=%s buckets=%d", result.Range, len(result.Model.Trend))
	}
	if result.Model.Summary.TotalCalls != 3 || result.Model.Summary.SuccessCalls != 2 || result.Model.Summary.FailedCalls != 1 {
		t.Fatalf("unexpected model summary: %+v", result.Model.Summary)
	}
	if result.Model.Summary.ActiveModels != 2 || result.Model.Summary.ConsumedCredits != 50 || result.Model.Summary.SuccessRate != 66.67 {
		t.Fatalf("unexpected model totals: %+v", result.Model.Summary)
	}
	if len(result.Model.Models) != 2 || result.Model.Models[0].Model != "gpt-image-2" || result.Model.Models[0].Calls != 2 {
		t.Fatalf("unexpected model ranking: %+v", result.Model.Models)
	}
	if result.Users.Summary.TotalUsers != 2 || result.Users.Summary.NewUsers != 1 || result.Users.Summary.ActiveUsers != 2 || result.Users.Summary.ConsumingUsers != 2 {
		t.Fatalf("unexpected user summary: %+v", result.Users.Summary)
	}
	if len(result.Users.Ranking) != 2 || result.Users.Ranking[0].Username != "alice" || result.Users.Ranking[0].ConsumedCredits != 30 {
		t.Fatalf("unexpected user ranking: %+v", result.Users.Ranking)
	}
	if result.Model.Trend[1].TotalCalls != 1 || result.Model.Trend[1].NewUsers != 1 || result.Model.Trend[1].ConsumedCredits != 30 {
		t.Fatalf("unexpected first populated bucket: %+v", result.Model.Trend[1])
	}
}

func TestNewAnalyticsWindowDefaultsToSevenDays(t *testing.T) {
	now := time.Date(2026, 7, 20, 10, 0, 0, 0, time.Local)
	window := newAnalyticsWindow("unexpected", now)
	if window.Key != "7d" || window.Count != 7 || window.Hourly {
		t.Fatalf("unexpected default window: %+v", window)
	}
}
