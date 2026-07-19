package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

type generatedImageURLRequest struct {
	ProviderID string `json:"providerId"`
	SourceURL  string `json:"sourceUrl"`
}

func GeneratedImageTemporaryURL(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.UserFromContext(r.Context()); !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input generatedImageURLRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || strings.TrimSpace(input.SourceURL) == "" {
		Fail(w, "图片地址不能为空")
		return
	}
	result, err := service.ResolveGeneratedImageTemporaryURL(r.Context(), strings.TrimSpace(input.ProviderID), strings.TrimSpace(input.SourceURL))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
