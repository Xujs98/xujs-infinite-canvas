package service

import "sync/atomic"

var testOfflineMode atomic.Bool

type TestOfflineStatus struct {
	Offline bool `json:"offline"`
}

func TestOfflineMode() bool {
	return testOfflineMode.Load()
}

func SetTestOfflineMode(offline bool) TestOfflineStatus {
	testOfflineMode.Store(offline)
	return TestOfflineStatus{Offline: offline}
}

func GetTestOfflineStatus() TestOfflineStatus {
	return TestOfflineStatus{Offline: TestOfflineMode()}
}
