package model

import (
	"testing"
	"time"
)

func TestCheckInDateFromTimestampUsesShanghaiBusinessDate(t *testing.T) {
	tests := map[string]string{
		"2026-07-16T20:30:00Z":      "2026-07-17",
		"2026-07-17T04:30:00+08:00": "2026-07-17",
		"2026-07-17":                "2026-07-17",
	}
	for input, expected := range tests {
		if got := CheckInDateFromTimestamp(input); got != expected {
			t.Fatalf("CheckInDateFromTimestamp(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestCheckInDateUsesShanghaiTimezone(t *testing.T) {
	value := time.Date(2026, 7, 16, 20, 30, 0, 0, time.UTC)
	if got := CheckInDate(value); got != "2026-07-17" {
		t.Fatalf("CheckInDate() = %q, want 2026-07-17", got)
	}
}
