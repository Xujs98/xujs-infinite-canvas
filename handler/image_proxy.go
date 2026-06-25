package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ProxyImage 代理下载远程图片并返回 base64 data URL。
func ProxyImage(w http.ResponseWriter, r *http.Request) {
	imageURL := r.URL.Query().Get("url")
	if strings.TrimSpace(imageURL) == "" {
		Fail(w, "缺少 url 参数")
		return
	}
	if !strings.HasPrefix(imageURL, "http://") && !strings.HasPrefix(imageURL, "https://") {
		Fail(w, "仅支持 http/https 图片地址")
		return
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(imageURL)
	if err != nil {
		Fail(w, "下载图片失败: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		Fail(w, fmt.Sprintf("图片返回状态码 %d", resp.StatusCode))
		return
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
	if err != nil {
		Fail(w, "读取图片失败")
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	// 取 MIME 部分，去掉参数
	if idx := strings.IndexByte(contentType, ';'); idx >= 0 {
		contentType = strings.TrimSpace(contentType[:idx])
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	dataURL := fmt.Sprintf("data:%s;base64,%s", contentType, encoded)

	OK(w, map[string]string{"dataUrl": dataURL})
}
