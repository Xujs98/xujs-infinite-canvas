package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type announcementRequest struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	Status     string  `json:"status"`
	NotifyType string  `json:"notifyType"`
	Target     string  `json:"target"`
	Pinned     *bool   `json:"pinned"`
	StartTime  *string `json:"startTime"`
	EndTime    *string `json:"endTime"`
}

type announcementBatchDeleteRequest struct {
	IDs []string `json:"ids"`
}

type announcementBatchPinnedRequest struct {
	IDs    []string `json:"ids"`
	Pinned bool     `json:"pinned"`
}

func AdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAnnouncements(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveAnnouncement(w http.ResponseWriter, r *http.Request) {
	var req announcementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	item := model.Announcement{
		ID:         req.ID,
		Title:      req.Title,
		Content:    req.Content,
		Status:     model.AnnouncementStatus(req.Status),
		NotifyType: model.AnnouncementNotifyType(req.NotifyType),
		Target:     model.AnnouncementTarget(req.Target),
	}
	if req.Pinned != nil {
		item.Pinned = *req.Pinned
	}
	if req.StartTime != nil && *req.StartTime != "" {
		t, err := time.Parse(time.RFC3339, *req.StartTime)
		if err == nil {
			item.StartTime = &t
		}
	}
	if req.EndTime != nil && *req.EndTime != "" {
		t, err := time.Parse(time.RFC3339, *req.EndTime)
		if err == nil {
			item.EndTime = &t
		}
	}
	result, err := service.SaveAnnouncement(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAnnouncement(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAnnouncement(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchDeleteAnnouncements(w http.ResponseWriter, r *http.Request) {
	var req announcementBatchDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		Fail(w, "参数错误")
		return
	}
	if err := service.BatchDeleteAnnouncements(req.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminBatchUpdateAnnouncementPinned(w http.ResponseWriter, r *http.Request) {
	var req announcementBatchPinnedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		Fail(w, "参数错误")
		return
	}
	if err := service.BatchUpdateAnnouncementPinned(req.IDs, req.Pinned); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func PublicAnnouncements(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("target")
	if target == "" {
		target = "all"
	}
	items, err := service.GetActiveAnnouncements(target)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}
