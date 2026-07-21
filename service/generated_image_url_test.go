package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestBuildGeneratedImagePresignURL(t *testing.T) {
	channel := model.ModelChannel{BaseURL: "https://api.example.com/v1"}
	got, err := buildGeneratedImagePresignURL(
		channel,
		"https://api.example.com/v1/images/generations/task-1/images/0",
		"canvas.example.com",
		3600,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "/images/0/presign") || !strings.Contains(got, "expires_in=3600") {
		t.Fatalf("unexpected presign URL: %s", got)
	}
}

func TestBuildGeneratedImagePresignURLRebasesCurrentCanvasHost(t *testing.T) {
	channel := model.ModelChannel{BaseURL: "https://api.example.com/v1"}
	got, err := buildGeneratedImagePresignURL(
		channel,
		"http://localhost:8080/v1/images/generations/task-1/images/0",
		"localhost:8080",
		3600,
	)
	if err != nil {
		t.Fatal(err)
	}
	want := "https://api.example.com/v1/images/generations/task-1/images/0/presign?expires_in=3600"
	if got != want {
		t.Fatalf("buildGeneratedImagePresignURL() = %q, want %q", got, want)
	}
}

func TestBuildGeneratedImagePresignURLAcceptsRelativeTaskPath(t *testing.T) {
	channel := model.ModelChannel{BaseURL: "https://api.example.com/v1"}
	got, err := buildGeneratedImagePresignURL(
		channel,
		"/v1/images/generations/task-1/images/0",
		"canvas.example.com",
		3600,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(got, "https://api.example.com/v1/images/generations/task-1/images/0/presign") {
		t.Fatalf("unexpected rebased presign URL: %s", got)
	}
}

func TestBuildGeneratedImagePresignURLRejectsOtherChannel(t *testing.T) {
	channel := model.ModelChannel{BaseURL: "https://api.example.com"}
	_, err := buildGeneratedImagePresignURL(
		channel,
		"https://attacker.example/v1/images/generations/task-1/images/0",
		"canvas.example.com",
		3600,
	)
	if err == nil {
		t.Fatal("expected channel mismatch error")
	}
}
