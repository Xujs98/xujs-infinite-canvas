package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSelectModelChannelByProviderIDUsesEnabledPublicIndex(t *testing.T) {
	channels := []model.ModelChannel{
		{Name: "disabled", Enabled: false, BaseURL: "https://disabled.example", APIKey: "disabled", Models: []string{"image-a"}},
		{Name: "first", Enabled: true, BaseURL: "https://first.example", APIKey: "first-key", Models: []string{"image-a"}},
		{Name: "second", Enabled: true, BaseURL: "https://second.example", APIKey: "second-key", Models: []string{"image-a", "image-b"}},
	}

	channel, err := selectModelChannelByProviderID(channels, "image-b", "srv-1")
	if err != nil {
		t.Fatalf("selectModelChannelByProviderID returned error: %v", err)
	}
	if channel.Name != "second" {
		t.Fatalf("channel = %q, want second", channel.Name)
	}
}

func TestSelectModelChannelByProviderIDRejectsModelOutsideChannel(t *testing.T) {
	channels := []model.ModelChannel{{
		Name: "first", Enabled: true, BaseURL: "https://first.example", APIKey: "first-key", Models: []string{"image-a"},
	}}

	if _, err := selectModelChannelByProviderID(channels, "image-b", "srv-0"); err == nil {
		t.Fatal("expected model/channel mismatch error")
	}
}
