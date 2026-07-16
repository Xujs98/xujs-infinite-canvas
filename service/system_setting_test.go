package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestIntSettingUsesFallbackForMissingOrInvalidValues(t *testing.T) {
	settings := map[string]string{"valid": "90", "invalid": "0", "text": "abc"}
	if got := intSetting(settings, "valid", 30); got != 90 {
		t.Fatalf("expected configured value 90, got %d", got)
	}
	for _, key := range []string{"missing", "invalid", "text"} {
		if got := intSetting(settings, key, 30); got != 30 {
			t.Fatalf("expected fallback for %s, got %d", key, got)
		}
	}
}

func TestSaveSystemSettingsRejectsInvalidLogCleanupLimits(t *testing.T) {
	input := model.SystemSettings{
		RequestLogRetentionDays: 30,
		RequestLogMaxRows:       5000,
		CallLogRetentionDays:    30,
		CallLogMaxRows:          99,
	}
	if err := SaveSystemSettings(input); err == nil {
		t.Fatal("expected invalid call log maximum to be rejected")
	}
}

func TestNormalizeLogCleanupSettingsSupportsLegacyPayload(t *testing.T) {
	input := model.SystemSettings{}
	if err := normalizeLogCleanupSettings(&input); err != nil {
		t.Fatalf("expected legacy payload defaults to be accepted: %v", err)
	}
	if input.RequestLogRetentionDays != 30 || input.RequestLogMaxRows != 5000 || input.CallLogRetentionDays != 30 || input.CallLogMaxRows != 5000 {
		t.Fatalf("unexpected cleanup defaults: %+v", input)
	}
}
