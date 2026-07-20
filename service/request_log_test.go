package service

import (
	"strings"
	"testing"
)

func TestSanitizeRequestLogTextTruncatesBase64(t *testing.T) {
	input := `{"image":"data:image/png;base64,` + strings.Repeat("A", 512) + `","prompt":"keep"}`
	result := sanitizeRequestLogText(input, 1024)
	if strings.Contains(result, strings.Repeat("A", 64)) {
		t.Fatal("base64 payload was not truncated")
	}
	if !strings.Contains(result, `"prompt":"keep"`) {
		t.Fatal("non-media request fields should be preserved")
	}
}

func TestSanitizeRequestLogTextLimitsLargeBody(t *testing.T) {
	result := sanitizeRequestLogText(strings.Repeat("内容", 100), 20)
	if !strings.HasSuffix(result, "...[日志内容已截断]") {
		t.Fatalf("expected truncation marker, got %q", result)
	}
	if len([]rune(strings.TrimSuffix(result, "\n...[日志内容已截断]"))) != 20 {
		t.Fatalf("expected 20 retained characters, got %q", result)
	}
}

func TestSanitizeRequestLogTextMasksSecretsAndKeepsDiagnostics(t *testing.T) {
	input := `{"authorization":"Bearer secret","password":"password-123","prompt":"保留提示词","b64_json":"` + strings.Repeat("A", 200) + `"}`
	result := sanitizeRequestLogText(input, 2048)
	if strings.Contains(result, "Bearer secret") || strings.Contains(result, "password-123") {
		t.Fatalf("secrets were not masked: %s", result)
	}
	if !strings.Contains(result, "保留提示词") {
		t.Fatalf("diagnostic fields should be preserved: %s", result)
	}
	if strings.Contains(result, strings.Repeat("A", 80)) {
		t.Fatalf("plain b64_json should be omitted: %s", result)
	}
}

func TestRequestLogOperationCoversUserActions(t *testing.T) {
	tests := map[string]string{
		"/api/auth/login":           "login",
		"/api/auth/register":        "register",
		"/api/v1/checkin":           "check_in",
		"/api/v1/redeem-code":       "redeem",
		"/api/v1/profile":           "profile_update",
		"/api/admin/users/user-123": "user_management",
	}
	for path, expected := range tests {
		if actual := requestLogOperation("POST", path); actual != expected {
			t.Fatalf("path %s: expected %s, got %s", path, expected, actual)
		}
	}
}
