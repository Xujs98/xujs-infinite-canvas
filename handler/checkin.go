package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func DailyCheckIn(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	log, isNew, err := service.DailyCheckIn(user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"checkIn": log, "isNew": isNew})
}

func GetCheckInMonth(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	month := r.URL.Query().Get("month")
	if month == "" {
		Fail(w, "请指定月份")
		return
	}
	logs, totalCount, totalReward, err := service.GetCheckInMonth(user.ID, month)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"items": logs, "totalCount": totalCount, "totalReward": totalReward})
}
