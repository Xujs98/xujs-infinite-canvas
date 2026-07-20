package service

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func withCapturedRiskSignals(t *testing.T) *[]string {
	t.Helper()
	previousRecorder := recordRiskSignal
	events := []string{}
	recordRiskSignal = func(_ *http.Request, _ model.AuthUser, eventType string, _ model.RiskLevel, _, _ string, _ map[string]any) {
		events = append(events, eventType)
	}
	appRequestNonces.Lock()
	appRequestNonces.items = map[string]time.Time{}
	appRequestNonces.Unlock()
	t.Cleanup(func() {
		recordRiskSignal = previousRecorder
		appRequestNonces.Lock()
		appRequestNonces.items = map[string]time.Time{}
		appRequestNonces.Unlock()
	})
	return &events
}

func appRiskRequest(timestamp string, nonce string) *http.Request {
	request := httptest.NewRequest("POST", "https://canvas.julongkj.top/api/v1/images/generations", nil)
	request.RemoteAddr = "198.51.100.20:43120"
	request.Header.Set(clientTypeHeader, "app")
	request.Header.Set(deviceCodeHeader, "device-0123456789abcdef")
	request.Header.Set(appVersionHeader, "0.1.21")
	if timestamp != "" {
		request.Header.Set(requestTimestampHeader, timestamp)
	}
	if nonce != "" {
		request.Header.Set(requestNonceHeader, nonce)
	}
	return request
}

func TestInspectClientRiskSignalsAcceptsFreshNonceAndRejectsReplay(t *testing.T) {
	events := withCapturedRiskSignals(t)
	timestamp := time.Now().Unix()
	request := appRiskRequest(strconv.FormatInt(timestamp, 10), "nonce-0123456789abcdef")

	first, err := InspectClientRiskSignals(request, model.AuthUser{ID: "user-1"})
	if err != nil || first.Blocked {
		t.Fatalf("first request should pass, decision=%+v err=%v", first, err)
	}
	second, err := InspectClientRiskSignals(request, model.AuthUser{ID: "user-1"})
	if err != nil || !second.Blocked {
		t.Fatalf("replayed request should be blocked, decision=%+v err=%v", second, err)
	}
	if len(*events) != 1 || (*events)[0] != "app_request_replay" {
		t.Fatalf("expected replay event, got %v", *events)
	}
}

func TestInspectClientRiskSignalsRejectsExpiredAndMalformedTimestamp(t *testing.T) {
	events := withCapturedRiskSignals(t)
	expired := appRiskRequest(strconv.FormatInt(time.Now().Add(-10*time.Minute).Unix(), 10), "nonce-expired-01234567")
	decision, err := InspectClientRiskSignals(expired, model.AuthUser{})
	if err != nil || !decision.Blocked {
		t.Fatalf("expired request should be blocked, decision=%+v err=%v", decision, err)
	}
	malformed := appRiskRequest("not-a-number", "nonce-malformed-012345")
	decision, err = InspectClientRiskSignals(malformed, model.AuthUser{})
	if err != nil || !decision.Blocked {
		t.Fatalf("malformed timestamp should be blocked, decision=%+v err=%v", decision, err)
	}
	if len(*events) != 2 || (*events)[0] != "app_timestamp_invalid" || (*events)[1] != "app_timestamp_invalid" {
		t.Fatalf("expected timestamp events, got %v", *events)
	}
}

func TestInspectClientRiskSignalsAllowsLegacyAppAndIgnoresWeb(t *testing.T) {
	events := withCapturedRiskSignals(t)
	legacy := appRiskRequest("", "")
	decision, err := InspectClientRiskSignals(legacy, model.AuthUser{})
	if err != nil || decision.Blocked {
		t.Fatalf("legacy app should be observed but allowed, decision=%+v err=%v", decision, err)
	}
	web := httptest.NewRequest("POST", "https://canvas.julongkj.top/api/v1/images/generations", nil)
	decision, err = InspectClientRiskSignals(web, model.AuthUser{})
	if err != nil || decision.Blocked {
		t.Fatalf("web request should not use app replay checks, decision=%+v err=%v", decision, err)
	}
	if len(*events) != 1 || (*events)[0] != "app_integrity_missing" {
		t.Fatalf("expected one legacy signal, got %v", *events)
	}
}

func TestMarshalRiskDetailRedactsSensitiveFields(t *testing.T) {
	detail := marshalRiskDetail(map[string]any{
		"flow":     "login",
		"password": "must-not-appear",
		"nested":   map[string]any{"apiKey": "must-not-appear-either", "count": 2},
	})
	if strings.Contains(detail, "must-not-appear") || !strings.Contains(detail, "[redacted]") {
		t.Fatalf("sensitive detail was not redacted: %s", detail)
	}
}
