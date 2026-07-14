package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func SyncOfflineCredits(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var req model.OfflineCreditsSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}
	result, err := service.SyncOfflineCredits(user.ID, req)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
}
