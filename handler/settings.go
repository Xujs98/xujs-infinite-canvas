package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type adminChannelActionRequest struct {
	Index   *int               `json:"index"`
	Channel model.ModelChannel `json:"channel"`
	Model   string             `json:"model"`
}

func Settings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.PublicSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

func AdminSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.AdminSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

func AdminSaveSettings(w http.ResponseWriter, r *http.Request) {
	var settings model.Settings
	_ = json.NewDecoder(r.Body).Decode(&settings)
	result, err := service.SaveSettings(settings)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminChannelModels(w http.ResponseWriter, r *http.Request) {
	var request adminChannelActionRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	models, err := service.AdminChannelModels(request.Index, request.Channel)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, models)
}

func AdminAllChannelModels(w http.ResponseWriter, r *http.Request) {
	settings, err := service.AdminSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	models := []string{}
	for _, channel := range settings.Private.Channels {
		if !channel.Enabled {
			continue
		}
		models = append(models, channel.Models...)
	}
	// 去重
	seen := make(map[string]bool)
	unique := []string{}
	for _, m := range models {
		if !seen[m] {
			seen[m] = true
			unique = append(unique, m)
		}
	}
	OK(w, unique)
}

func AdminTestChannelModel(w http.ResponseWriter, r *http.Request) {
	var request adminChannelActionRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.AdminTestChannelModel(request.Index, request.Channel, request.Model)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
