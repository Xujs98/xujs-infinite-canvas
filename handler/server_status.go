package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func AdminGetServerOffline(w http.ResponseWriter, r *http.Request) {
	OK(w, service.GetTestOfflineStatus())
}

func AdminSetServerOffline(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Offline bool `json:"offline"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	status := service.SetTestOfflineMode(request.Offline)
	if status.Offline {
		ws.DefaultHub.DisconnectAll()
	}
	OK(w, status)
}
