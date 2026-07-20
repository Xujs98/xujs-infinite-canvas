package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AdminRequestLogs(w http.ResponseWriter, r *http.Request) {
	params := r.URL.Query()
	page, _ := strconv.Atoi(params.Get("page"))
	pageSize, _ := strconv.Atoi(params.Get("pageSize"))
	q := model.RequestLogQuery{
		Keyword:   strings.TrimSpace(params.Get("keyword")),
		Model:     strings.TrimSpace(params.Get("model")),
		Channel:   strings.TrimSpace(params.Get("channel")),
		Source:    strings.TrimSpace(params.Get("source")),
		EventType: strings.TrimSpace(params.Get("eventType")),
		Operation: strings.TrimSpace(params.Get("operation")),
		Status:    strings.TrimSpace(params.Get("status")),
		Method:    strings.TrimSpace(params.Get("method")),
		Page:      page,
		PageSize:  pageSize,
	}
	q.StartTime = parseRequestLogTime(params.Get("startTime"))
	q.EndTime = parseRequestLogTime(params.Get("endTime"))
	logs, err := service.ListRequestLogs(q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, logs)
}

func parseRequestLogTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"} {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			localTime := parsed.In(time.Local)
			return &localTime
		}
	}
	return nil
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
