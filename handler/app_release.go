package handler

import (
	"encoding/json"
	"mime"
	"net/http"
	"os"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type appReleaseRequest struct {
	Version     string                 `json:"version"`
	Title       string                 `json:"title"`
	Notes       string                 `json:"notes"`
	ForceUpdate bool                   `json:"forceUpdate"`
	Status      model.AppReleaseStatus `json:"status"`
}

func AdminAppReleases(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListAppReleases(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminCreateAppRelease(w http.ResponseWriter, r *http.Request) {
	var request appReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	result, err := service.CreateAppRelease(model.AppRelease{
		Version: request.Version, Title: request.Title, Notes: request.Notes, ForceUpdate: request.ForceUpdate,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUpdateAppRelease(w http.ResponseWriter, r *http.Request, id string) {
	var request appReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	result, err := service.UpdateAppRelease(id, model.AppRelease{
		Version: request.Version, Title: request.Title, Notes: request.Notes,
		ForceUpdate: request.ForceUpdate, Status: request.Status,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAppRelease(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAppRelease(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminUploadAppReleaseArtifact(w http.ResponseWriter, r *http.Request, releaseID string) {
	r.Body = http.MaxBytesReader(w, r.Body, service.AppReleaseMaxBytes+(2<<20))
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		Fail(w, "安装包过大或上传格式不正确，单个文件最大 1GB")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择客户端安装包")
		return
	}
	defer file.Close()
	result, err := service.SaveAppReleaseArtifact(
		releaseID,
		r.FormValue("platform"),
		r.FormValue("arch"),
		header.Filename,
		header.Header.Get("Content-Type"),
		file,
	)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteAppReleaseArtifact(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteAppReleaseArtifact(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func PublicLatestAppRelease(w http.ResponseWriter, r *http.Request) {
	result, err := service.LatestPublishedAppRelease()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PublicRecentAppReleases(w http.ResponseWriter, r *http.Request) {
	query := parseQuery(r)
	if query.PageSize < 1 {
		query.PageSize = 10
	}
	result, err := service.PublishedAppReleases(query)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DownloadAppReleaseArtifact(w http.ResponseWriter, r *http.Request, id string) {
	artifact, path, err := service.PublishedAppReleaseArtifact(id)
	if err != nil {
		FailError(w, err)
		return
	}
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	contentType := strings.TrimSpace(artifact.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": artifact.FileName}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	http.ServeContent(w, r, artifact.FileName, info.ModTime(), file)
}
