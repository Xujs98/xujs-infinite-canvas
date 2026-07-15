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
