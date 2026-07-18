package service

import (
	"strings"
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
	if input.RequestLogRetentionDays != 30 || input.RequestLogMaxRows != 5000 || input.CallLogRetentionDays != 30 || input.CallLogMaxRows != 5000 || input.CreditLogRetentionDays != 365 || input.CreditLogMaxRows != 100000 {
		t.Fatalf("unexpected cleanup defaults: %+v", input)
	}
}

func TestNormalizeLogCleanupSettingsAcceptsUnlimitedUserCreditLogVisibility(t *testing.T) {
	input := model.SystemSettings{UserCreditLogVisibleRows: 0}
	if err := normalizeLogCleanupSettings(&input); err != nil {
		t.Fatalf("expected zero visible rows to mean unlimited: %v", err)
	}
}

func TestNormalizeLogCleanupSettingsRejectsNegativeUserCreditLogVisibility(t *testing.T) {
	input := model.SystemSettings{UserCreditLogVisibleRows: -1}
	if err := normalizeLogCleanupSettings(&input); err == nil {
		t.Fatal("expected negative visible rows to be rejected")
	}
}

func TestNormalizeAppErrorMessagesFillsDefaultsAndDropsUnknownKeys(t *testing.T) {
	input := model.SystemSettings{AppErrorMessages: map[string]string{
		"generation": "  自定义生成失败  ",
		"unknown":    "不应保存",
	}}
	if err := normalizeAppErrorMessages(&input); err != nil {
		t.Fatalf("expected error messages to normalize: %v", err)
	}
	if input.AppErrorMessages["generation"] != "自定义生成失败" {
		t.Fatalf("unexpected generation message: %q", input.AppErrorMessages["generation"])
	}
	if input.AppErrorMessages["network"] == "" || input.AppErrorMessages["default"] == "" {
		t.Fatal("expected missing categories to receive defaults")
	}
	if _, ok := input.AppErrorMessages["unknown"]; ok {
		t.Fatal("expected unknown category to be removed")
	}
}

func TestNormalizeAppErrorMessagesRejectsLongMessage(t *testing.T) {
	input := model.SystemSettings{AppErrorMessages: map[string]string{
		"default": strings.Repeat("错", 201),
	}}
	if err := normalizeAppErrorMessages(&input); err == nil {
		t.Fatal("expected overlong message to be rejected")
	}
}
