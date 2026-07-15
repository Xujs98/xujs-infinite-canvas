package service

import "testing"

func TestNormalizeAppReleaseVersion(t *testing.T) {
	tests := map[string]string{
		"v0.1.21":    "0.1.21",
		" 1.2.3 ":    "1.2.3",
		"2.0.0-beta": "2.0.0-beta",
	}
	for input, expected := range tests {
		actual, err := normalizeAppReleaseVersion(input)
		if err != nil || actual != expected {
			t.Fatalf("normalizeAppReleaseVersion(%q) = %q, %v; want %q", input, actual, err, expected)
		}
	}
	if _, err := normalizeAppReleaseVersion("release-one"); err == nil {
		t.Fatal("expected invalid version to fail")
	}
}

func TestNormalizeAppReleaseArtifact(t *testing.T) {
	platform, arch, extension, err := normalizeAppReleaseArtifact("macOS", "arm64", "songshu-canvas.dmg")
	if err != nil || platform != "macos" || arch != "arm64" || extension != ".dmg" {
		t.Fatalf("unexpected normalized artifact: %q %q %q %v", platform, arch, extension, err)
	}
	if _, _, _, err := normalizeAppReleaseArtifact("windows", "x64", "client.dmg"); err == nil {
		t.Fatal("expected unsupported platform extension to fail")
	}
}

func TestSanitizeAppReleaseFileName(t *testing.T) {
	if actual := sanitizeAppReleaseFileName("../songshu\r\ncanvas.dmg", ".dmg"); actual != "songshucanvas.dmg" {
		t.Fatalf("unexpected sanitized file name: %q", actual)
	}
	if actual := sanitizeAppReleaseFileName("\x00", ".zip"); actual != "julong-canvas.zip" {
		t.Fatalf("unexpected fallback file name: %q", actual)
	}
}
