package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/basketikun/infinite-canvas/ws"
)

func AdminSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListSubscriptionPlans(parseQuery(r), false)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PublicSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListSubscriptionPlans(parseQuery(r), true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	var plan model.SubscriptionPlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		Fail(w, "参数错误")
		return
	}
	result, err := service.CreateSubscriptionPlan(plan)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UpdateSubscriptionPlan(w http.ResponseWriter, r *http.Request, id string) {
	var plan model.SubscriptionPlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		Fail(w, "参数错误")
		return
	}
	result, err := service.UpdateSubscriptionPlan(id, plan)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteSubscriptionPlan(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteSubscriptionPlan(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminSubscriptionPlanUsers(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListSubscriptionSubscribers(id, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserSubscriptions(w http.ResponseWriter, r *http.Request, userID string) {
	result, err := service.ListUserSubscriptions(userID, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func GrantUserSubscription(w http.ResponseWriter, r *http.Request, userID string) {
	var request struct {
		PlanID string `json:"planId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.PlanID == "" {
		Fail(w, "请选择订阅套餐")
		return
	}
	result, err := service.GrantUserSubscription(userID, request.PlanID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ResetUserSubscription(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ResetUserSubscription(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func VoidUserSubscription(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.VoidUserSubscription(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func DeleteUserSubscription(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteUserSubscription(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func UserSubscriptions(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	result, err := service.ListUserSubscriptions(user.ID, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PurchaseSubscription(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var request struct {
		PlanID string `json:"planId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.PlanID == "" {
		Fail(w, "请选择订阅套餐")
		return
	}
	result, err := service.PurchaseSubscription(user.ID, request.PlanID)
	if err != nil {
		FailError(w, err)
		return
	}
	ws.DefaultHub.SendToUser(user.ID, map[string]any{"type": "credits-changed"})
	OK(w, result)
}
