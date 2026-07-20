package handler

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestChannelToPublicDoesNotExposeUpstreamSecrets(t *testing.T) {
	public := channelToPublic(model.ModelChannel{
		Name:         "private channel",
		BaseURL:      "https://upstream.example/v1",
		APIKey:       "secret-api-key",
		ExtraHeaders: map[string]string{"X-Secret": "header-secret"},
		ExtraBody:    map[string]any{"access_token": "body-secret"},
		PathPrefix:   "/private-prefix",
		EndpointPath: "/private-endpoint",
		Enabled:      true,
		Models:       []string{"image-a"},
		VideoConfig: &model.ChannelVideoConfig{
			Path:                "/private-video-submit",
			StatusEndpointPath:  "/private-video-status/{taskId}",
			ContentEndpointPath: "/private-video-content/{taskId}",
		},
	})

	if public.BaseURL != "" || public.APIKey != "" || public.PathPrefix != "" || public.EndpointPath != "" {
		t.Fatalf("public channel exposed upstream route or credential: %#v", public)
	}
	if len(public.ExtraHeaders) != 0 || len(public.ExtraBody) != 0 {
		t.Fatalf("public channel exposed sensitive request data: %#v", public)
	}
	if public.VideoConfig == nil || public.VideoConfig.Path != "" || public.VideoConfig.StatusEndpointPath != "" || public.VideoConfig.ContentEndpointPath != "" {
		t.Fatalf("public channel exposed video endpoint paths: %#v", public.VideoConfig)
	}
	if public.ConfigHash == "" || strings.Contains(public.ConfigHash, "secret") {
		t.Fatalf("invalid public config hash: %q", public.ConfigHash)
	}
}
