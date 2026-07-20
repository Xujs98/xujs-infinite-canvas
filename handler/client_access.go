package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func CheckClientAccess(w http.ResponseWriter, r *http.Request) {
	metadata := service.ClientMetadataFromRequest(r)
	decision, err := service.CheckClientAccess(metadata)
	if err != nil {
		FailError(w, err)
		return
	}
	if decision.Blocked {
		service.RecordRequestRisk(r, model.AuthUser{}, "blocked_access_attempt", model.RiskLevelHigh, "access", "被封禁的访问来源启动或访问 App", map[string]any{"banKind": decision.Kind})
	}
	if !decision.Blocked {
		token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if token != "" {
			if user, ok := service.CurrentAuthUser(token); ok {
				_ = service.RecordClientAccess(user.ID, metadata)
			}
		}
	}
	OK(w, decision)
}

func AdminSetAccessBan(w http.ResponseWriter, r *http.Request) {
	admin, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var request struct {
		Kind    model.AccessBanKind `json:"kind"`
		Value   string              `json:"value"`
		Blocked bool                `json:"blocked"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if err := service.SetAccessBan(admin.ID, request.Kind, request.Value, request.Blocked); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func rejectBlockedClient(w http.ResponseWriter, r *http.Request) bool {
	decision, err := service.CheckRequestAccess(r)
	if err != nil {
		FailError(w, err)
		return true
	}
	if decision.Blocked {
		user := model.AuthUser{}
		if token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")); token != "" {
			user, _ = service.CurrentAuthUser(token)
		}
		service.RecordRequestRisk(r, user, "blocked_access_attempt", model.RiskLevelHigh, "access", "被封禁的访问来源继续请求服务端", map[string]any{"banKind": decision.Kind})
		Fail(w, decision.Message)
		return true
	}
	return false
}

func recordAuthenticatedClient(userID string, r *http.Request) {
	_ = service.RecordClientAccess(userID, service.ClientMetadataFromRequest(r))
}
