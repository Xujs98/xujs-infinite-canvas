package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func PromptPresets(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPromptPresets(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminPromptPresets(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPromptPresets(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSavePromptPreset(w http.ResponseWriter, r *http.Request) {
	var item model.PromptPreset
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SavePromptPreset(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeletePromptPreset(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeletePromptPreset(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminDeletePromptPresets(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeletePromptPresets(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
