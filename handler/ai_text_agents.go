package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AITextAgents(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAITextAgents(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminAITextAgents(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAITextAgents(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveAITextAgent(w http.ResponseWriter, r *http.Request) {
	var item model.AITextAgent
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SaveAITextAgent(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAITextAgent(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAITextAgent(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminDeleteAITextAgents(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeleteAITextAgents(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
