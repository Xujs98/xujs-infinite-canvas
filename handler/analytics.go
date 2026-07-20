package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminAnalytics(w http.ResponseWriter, r *http.Request) {
	result, err := service.AdminAnalytics(r.URL.Query().Get("range"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
