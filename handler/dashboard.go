package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminDashboard(w http.ResponseWriter, r *http.Request) {
	stats, err := service.DashboardStats()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, stats)
}
