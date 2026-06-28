package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminCallLogs(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	status := r.URL.Query().Get("status")
	logs, err := service.ListCallLogs(q, status)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, logs)
}

func AdminBatchDeleteCallLogs(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || len(input.IDs) == 0 {
		Fail(w, "参数错误")
		return
	}
	if err := service.BatchDeleteCallLogs(input.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, nil)
}
