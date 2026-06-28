package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

// ConsumeCreditsRequest App端预扣算力点请求。
type ConsumeCreditsRequest struct {
	Model     string `json:"model"`
	MediaType string `json:"mediaType"` // "image" | "video" | "text"
	Quantity  int    `json:"quantity"`
	Seconds   int    `json:"seconds"` // 仅视频需要
}

// ConsumeCreditsResponse 预扣算力点响应。
type ConsumeCreditsResponse struct {
	RequiredCredits int `json:"requiredCredits"`
	Balance         int `json:"balance"`
}

// ConsumeCredits App端调用：在生成前预扣算力点。
func ConsumeCredits(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}

	var req ConsumeCreditsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}

	if strings.TrimSpace(req.Model) == "" {
		Fail(w, "缺少 model 参数")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	// 查找模型算力点单价
	unitCredits, err := service.ModelCost(req.Model)
	if err != nil {
		log.Printf("[credits] ModelCost lookup failed: model=%s err=%v", req.Model, err)
		Fail(w, "模型配置错误")
		return
	}
	if unitCredits <= 0 {
		// 无费用模型，直接返回
		OK(w, ConsumeCreditsResponse{RequiredCredits: 0, Balance: user.Credits})
		return
	}

	// 计算总费用
	credits := unitCredits * req.Quantity
	if req.MediaType == "video" && req.Seconds > 0 {
		credits *= req.Seconds
	}

	// 会员免扣
	if service.IsMembershipActive(user.MembershipExpiresAt) {
		service.LogMembershipFreeUsage(user.ID, req.Model, credits, "app:"+req.MediaType)
		OK(w, ConsumeCreditsResponse{RequiredCredits: credits, Balance: user.Credits})
		return
	}

	// 扣除算力点
	path := "app:" + req.MediaType
	if err := service.ConsumeUserCredits(user.ID, req.Model, credits, path); err != nil {
		log.Printf("[credits] ConsumeUserCredits failed: user=%s model=%s credits=%d err=%v", user.ID, req.Model, credits, err)
		FailError(w, err)
		return
	}

	// 推送余额变更
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})

	// 查询扣除后余额
	refreshedUser, _, _ := repository.GetUserByID(user.ID)
	balance := user.Credits - credits
	if refreshedUser.Credits > 0 {
		balance = refreshedUser.Credits
	}
	OK(w, ConsumeCreditsResponse{RequiredCredits: credits, Balance: balance})
}

// RefundCreditsRequest App端退还算力点请求。
type RefundCreditsRequest struct {
	Model  string `json:"model"`
	Amount int    `json:"amount"`
}

// RefundCredits App端调用：生成失败时退还算力点。
func RefundCredits(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}

	var req RefundCreditsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求参数错误")
		return
	}

	if req.Amount <= 0 {
		Fail(w, "amount 必须大于 0")
		return
	}

	path := "app:refund"
	if err := service.RefundUserCredits(user.ID, req.Model, req.Amount, path); err != nil {
		FailError(w, err)
		return
	}

	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})

	refreshedUser, _, _ := repository.GetUserByID(user.ID)
	balance := user.Credits + req.Amount
	if refreshedUser.Credits > 0 {
		balance = refreshedUser.Credits
	}
	OK(w, ConsumeCreditsResponse{RequiredCredits: 0, Balance: balance})
}
