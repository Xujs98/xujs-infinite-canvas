package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

type generateRedeemCodesRequest struct {
	Count          int                `json:"count"`
	Type           model.RedeemCodeType `json:"type"`
	Credits        int                `json:"credits"`
	MembershipDays int                `json:"membershipDays"`
	BatchName      string             `json:"batchName"`
	Remark         string             `json:"remark"`
}

type redeemCodeRequest struct {
	Code string `json:"code"`
}

func AdminGenerateRedeemCodes(w http.ResponseWriter, r *http.Request) {
	var request generateRedeemCodesRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if request.Type == "" {
		request.Type = model.RedeemCodeTypeCredits
	}
	items, err := service.GenerateRedeemCodes(request.Count, request.Type, request.Credits, request.MembershipDays, request.BatchName, request.Remark)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminRedeemCodes(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListRedeemCodes(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteRedeemCode(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteRedeemCode(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchDeleteRedeemCodes(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs []string `json:"ids"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	if len(request.IDs) == 0 {
		Fail(w, "请选择要删除的卡密")
		return
	}
	if err := service.BatchDeleteRedeemCodes(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func RedeemCode(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok || user.Role == model.UserRoleGuest {
		Fail(w, "请先登录")
		return
	}
	var request redeemCodeRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.RedeemCode(user.ID, request.Code)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
}
