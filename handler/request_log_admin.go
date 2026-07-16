package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminRequestLogs(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	method := r.URL.Query().Get("method")
	source := r.URL.Query().Get("source")
	logs, err := service.ListRequestLogs(q, method, source)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, logs)
}

func AdminRequestLogDetail(w http.ResponseWriter, r *http.Request, id string) {
	item, err := service.GetRequestLog(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func AdminBatchDeleteRequestLogs(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || len(input.IDs) == 0 {
		Fail(w, "参数错误")
		return
	}
	if err := service.BatchDeleteRequestLogs(input.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, nil)
}

func AdminClearRequestLogs(w http.ResponseWriter, r *http.Request) {
	deleted, err := service.ClearRequestLogs()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]int64{"deleted": deleted})
}
