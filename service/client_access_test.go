package service

import (
	"net/http/httptest"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestClientIPFromRequestUsesRealIPFromTrustedProxy(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "127.0.0.1:43120"
	request.Header.Set("X-Real-IP", "203.0.113.12")
	request.Header.Set("X-Forwarded-For", "198.51.100.9")

	if got := ClientIPFromRequest(request); got != "203.0.113.12" {
		t.Fatalf("expected X-Real-IP, got %q", got)
	}
}

func TestClientIPFromRequestRejectsSpoofedForwardedPrefix(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "172.18.0.1:43120"
	request.Header.Set("X-Forwarded-For", "192.0.2.55, 198.51.100.23, 10.0.0.8")

	if got := ClientIPFromRequest(request); got != "198.51.100.23" {
		t.Fatalf("expected nearest public client address, got %q", got)
	}
}

func TestClientIPFromRequestIgnoresHeadersFromPublicPeer(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "198.51.100.45:43120"
	request.Header.Set("X-Real-IP", "203.0.113.99")

	if got := ClientIPFromRequest(request); got != "198.51.100.45" {
		t.Fatalf("expected direct peer address, got %q", got)
	}
}

func TestNormalizeDeviceCode(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "valid app hash", value: " DEVICE-0123456789ABCDEF ", want: "device-0123456789abcdef"},
		{name: "valid separators", value: "install:abc_def.123", want: "install:abc_def.123"},
		{name: "too short", value: "device", want: ""},
		{name: "illegal character", value: "device-abc/123", want: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizeDeviceCode(test.value); got != test.want {
				t.Fatalf("normalizeDeviceCode(%q) = %q, want %q", test.value, got, test.want)
			}
		})
	}
}

func TestNormalizeBanValue(t *testing.T) {
	if got, err := normalizeBanValue(model.AccessBanIP, "[2001:db8::1]"); err != nil || got != "2001:db8::1" {
		t.Fatalf("unexpected normalized IPv6: %q, %v", got, err)
	}
	if _, err := normalizeBanValue(model.AccessBanIP, "not-an-ip"); err == nil {
		t.Fatal("expected invalid IP error")
	}
	if _, err := normalizeBanValue(model.AccessBanDevice, "bad/device"); err == nil {
		t.Fatal("expected invalid device code error")
	}
	if _, err := normalizeBanValue(model.AccessBanKind("unknown"), "value"); err == nil {
		t.Fatal("expected invalid ban kind error")
	}
}

func TestTrimFieldPreservesUTF8(t *testing.T) {
	if got := trimField("  中文系统信息  ", 4); got != "中文系统" {
		t.Fatalf("unexpected Unicode truncation result: %q", got)
	}
}
