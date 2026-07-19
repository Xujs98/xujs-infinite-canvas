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
		3600,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "/images/0/presign") || !strings.Contains(got, "expires_in=3600") {
		t.Fatalf("unexpected presign URL: %s", got)
	}
}

func TestBuildGeneratedImagePresignURLRejectsOtherChannel(t *testing.T) {
	channel := model.ModelChannel{BaseURL: "https://api.example.com"}
	_, err := buildGeneratedImagePresignURL(
		channel,
		"https://attacker.example/v1/images/generations/task-1/images/0",
		3600,
	)
	if err == nil {
		t.Fatal("expected channel mismatch error")
	}
}
