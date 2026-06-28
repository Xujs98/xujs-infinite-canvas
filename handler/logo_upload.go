package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

const (
	logoMaxBytes     = 300 << 10 // 300KB
	logoAllowedTypes = "image/png,image/jpeg,image/svg+xml"
)

// AdminUploadLogo 上传站点 Logo。
func AdminUploadLogo(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, logoMaxBytes+1)
	if err := r.ParseMultipartForm(logoMaxBytes); err != nil {
		Fail(w, "Logo 文件过大，最大 300KB")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择 Logo 文件")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if !isAllowedLogoType(contentType) {
		Fail(w, "仅支持 PNG、JPG 或 SVG 格式")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil || len(data) == 0 {
		Fail(w, "文件读取失败")
		return
	}
	if int64(len(data)) > logoMaxBytes {
		Fail(w, "Logo 文件过大，最大 300KB")
		return
	}

	// 转为 data URI 存储。
	encoded := base64.StdEncoding.EncodeToString(data)
	dataURI := fmt.Sprintf("data:%s;base64,%s", contentType, encoded)

	// 保存到系统设置。
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	settings.SiteLogo = dataURI
	if err := service.SaveSystemSettings(settings); err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]string{"url": dataURI})
}

// AdminRemoveLogo 移除站点 Logo。
func AdminRemoveLogo(w http.ResponseWriter, r *http.Request) {
	settings, err := service.GetSystemSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	settings.SiteLogo = ""
	if err := service.SaveSystemSettings(settings); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func isAllowedLogoType(contentType string) bool {
	for _, allowed := range strings.Split(logoAllowedTypes, ",") {
		if strings.TrimSpace(allowed) == contentType {
			return true
		}
	}
	// SVG 可能被浏览器识别为 text/xml。
	if strings.Contains(contentType, "svg") {
		return true
	}
	return false
}
