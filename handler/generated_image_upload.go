package handler

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

func UploadGeneratedImageFallback(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.UserFromContext(r.Context()); !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	storageConfig, err := service.GetMinIOStorageConfig()
	if err != nil {
		FailError(w, err)
		return
	}
	maxBytes := int64(storageConfig.CanvasImageUploadMaxMB) << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+(1<<20))
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		Fail(w, fmt.Sprintf("本地恢复图片超过 %dMB 或上传格式不正确", storageConfig.CanvasImageUploadMaxMB))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择需要恢复的本地图片")
		return
	}
	defer file.Close()

	mimeType, extension, ok := normalizeReferenceMediaType(
		header.Header.Get("Content-Type"),
		filepath.Ext(header.Filename),
	)
	if !ok || !strings.HasPrefix(mimeType, "image/") {
		Fail(w, "本地恢复图片格式不支持，请使用 jpeg/png/webp/bmp/gif/heic/heif 图片")
		return
	}
	if header.Size <= 0 || header.Size > maxBytes {
		Fail(w, fmt.Sprintf("本地恢复图片为空或超过 %dMB 限制", storageConfig.CanvasImageUploadMaxMB))
		return
	}

	probe := make([]byte, 512)
	probeSize, readErr := file.Read(probe)
	if readErr != nil && readErr != io.EOF {
		Fail(w, "无法读取本地恢复图片")
		return
	}
	detectedType := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(probe[:probeSize]), ";")[0]))
	if !strings.HasPrefix(detectedType, "image/") && detectedType != "application/octet-stream" {
		Fail(w, "上传内容不是有效图片")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		Fail(w, "无法重新读取本地恢复图片")
		return
	}

	result, err := service.UploadCanvasImageToMinIO(r.Context(), file, mimeType, extension)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
