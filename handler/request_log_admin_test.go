package handler

import (
	"testing"
	"time"
)

func TestParseRequestLogTimeConvertsRFC3339ToLocalTime(t *testing.T) {
	previousLocation := time.Local
	time.Local = time.FixedZone("UTC+8", 8*60*60)
	t.Cleanup(func() { time.Local = previousLocation })

	parsed := parseRequestLogTime("2026-07-20T07:30:00Z")
	if parsed == nil {
		t.Fatal("expected RFC3339 time to parse")
	}
	if parsed.Hour() != 15 || parsed.Location() != time.Local {
		t.Fatalf("expected 15:30 in local time, got %s", parsed)
	}
}
