package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AdminRiskEvents(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListRiskEvents(
		parseQuery(r),
		r.URL.Query().Get("userId"),
		model.RiskLevel(strings.TrimSpace(r.URL.Query().Get("level"))),
		r.URL.Query().Get("source"),
	)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminRiskEventStats(w http.ResponseWriter, _ *http.Request) {
	result, err := service.GetRiskEventStats()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUpdateRiskEventStatus(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		Status model.RiskStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		Fail(w, "参数错误")
		return
	}
	if err := service.UpdateRiskEventStatus(id, input.Status, admin.ID); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchDeleteRiskEvents(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || len(input.IDs) == 0 {
		Fail(w, "请选择要删除的风险事件")
		return
	}
	if err := service.BatchDeleteRiskEvents(input.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminClearRiskEvents(w http.ResponseWriter, _ *http.Request) {
	deleted, err := service.ClearRiskEvents()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]int64{"deleted": deleted})
}
