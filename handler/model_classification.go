package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func ListModelClassifications(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	keyword := q.Keyword
	page := q.Page
	if page < 1 {
		page = 1
	}
	pageSize := q.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	result, err := service.ListModelClassifications(keyword, page, pageSize)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateModelClassification(w http.ResponseWriter, r *http.Request) {
	var classification model.ModelClassification
	if err := json.NewDecoder(r.Body).Decode(&classification); err != nil {
		Fail(w, "参数错误")
		return
	}
	if classification.ModelName == "" || classification.Capability == "" {
		Fail(w, "模型名称和分类不能为空")
		return
	}
	if classification.Capability != "text" && classification.Capability != "image" && classification.Capability != "video" && classification.Capability != "audio" {
		Fail(w, "分类必须是 text、image、video 或 audio")
		return
	}
	result, err := service.CreateModelClassification(classification)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UpdateModelClassification(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		Fail(w, "缺少ID")
		return
	}
	var classification model.ModelClassification
	if err := json.NewDecoder(r.Body).Decode(&classification); err != nil {
		Fail(w, "参数错误")
		return
	}
	if classification.ModelName == "" || classification.Capability == "" {
		Fail(w, "模型名称和分类不能为空")
		return
	}
	if classification.Capability != "text" && classification.Capability != "image" && classification.Capability != "video" && classification.Capability != "audio" {
		Fail(w, "分类必须是 text、image、video 或 audio")
		return
	}
	result, err := service.UpdateModelClassification(id, classification)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteModelClassification(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		Fail(w, "缺少ID")
		return
	}
	if err := service.DeleteModelClassification(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func BatchDeleteModelClassifications(w http.ResponseWriter, r *http.Request) {
	var request struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "参数错误")
		return
	}
	if len(request.IDs) == 0 {
		Fail(w, "请选择要删除的记录")
		return
	}
	if err := service.BatchDeleteModelClassifications(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func GetModelClassificationsMap(w http.ResponseWriter, r *http.Request) {
	result, err := service.GetModelClassificationsMap()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func GetAllModelClassifications(w http.ResponseWriter, r *http.Request) {
	result, err := service.GetAllModelClassificationsList()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
