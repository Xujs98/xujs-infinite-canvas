package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

const AppReleaseMaxBytes int64 = 1024 << 20

var appReleaseVersionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`)

func ListAppReleases(q model.Query) (model.AppReleaseList, error) {
	result, err := repository.ListAppReleases(q)
	if err != nil {
		return result, err
	}
	for index := range result.Items {
		decorateAppRelease(&result.Items[index])
	}
	return result, nil
}

func LatestPublishedAppRelease() (model.AppRelease, error) {
	item, err := repository.GetLatestPublishedAppRelease()
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AppRelease{}, safeMessageError{message: "暂未发布客户端版本"}
	}
	decorateAppRelease(&item)
	return item, err
}

func PublishedAppReleases(query model.Query) (model.AppReleaseList, error) {
	query.Normalize()
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	result, err := repository.ListPublishedAppReleases(query)
	if err != nil {
		return result, err
	}
	for index := range result.Items {
		decorateAppRelease(&result.Items[index])
	}
	return result, nil
}

func CreateAppRelease(input model.AppRelease) (model.AppRelease, error) {
	version, err := normalizeAppReleaseVersion(input.Version)
	if err != nil {
		return model.AppRelease{}, err
	}
	if _, exists, lookupErr := repository.GetAppReleaseByVersion(version); lookupErr != nil {
		return model.AppRelease{}, lookupErr
	} else if exists {
		return model.AppRelease{}, safeMessageError{message: "该版本号已存在"}
	}
	nowTime := time.Now()
	item := model.AppRelease{
		ID:          newID("release"),
		Version:     version,
		Title:       strings.TrimSpace(input.Title),
		Notes:       strings.TrimSpace(input.Notes),
		ForceUpdate: input.ForceUpdate,
		Status:      model.AppReleaseStatusDraft,
		CreatedAt:   nowTime,
		UpdatedAt:   nowTime,
	}
	if item.Title == "" {
		item.Title = "矩龙画布 " + item.Version
	}
	return repository.CreateAppRelease(item)
}

func UpdateAppRelease(id string, input model.AppRelease) (model.AppRelease, error) {
	item, err := repository.GetAppRelease(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AppRelease{}, safeMessageError{message: "客户端版本不存在"}
	}
	if err != nil {
		return model.AppRelease{}, err
	}
	version, err := normalizeAppReleaseVersion(input.Version)
	if err != nil {
		return model.AppRelease{}, err
	}
	if existing, exists, lookupErr := repository.GetAppReleaseByVersion(version); lookupErr != nil {
		return model.AppRelease{}, lookupErr
	} else if exists && existing.ID != item.ID {
		return model.AppRelease{}, safeMessageError{message: "该版本号已存在"}
	}
	status := input.Status
	if status == "" {
		status = item.Status
	}
	if status != model.AppReleaseStatusDraft && status != model.AppReleaseStatusPublished {
		return model.AppRelease{}, safeMessageError{message: "发布状态无效"}
	}
	if status == model.AppReleaseStatusPublished && len(item.Artifacts) == 0 {
		return model.AppRelease{}, safeMessageError{message: "请至少上传一个客户端安装包后再发布"}
	}
	item.Version = version
	item.Title = strings.TrimSpace(input.Title)
	item.Notes = strings.TrimSpace(input.Notes)
	item.ForceUpdate = input.ForceUpdate
	item.Status = status
	item.UpdatedAt = time.Now()
	if item.Title == "" {
		item.Title = "矩龙画布 " + item.Version
	}
	if status == model.AppReleaseStatusPublished && item.PublishedAt == nil {
		publishedAt := item.UpdatedAt
		item.PublishedAt = &publishedAt
	} else if status == model.AppReleaseStatusDraft {
		item.PublishedAt = nil
	}
	saved, err := repository.SaveAppRelease(item)
	if err != nil {
		return saved, err
	}
	result, err := repository.GetAppRelease(saved.ID)
	decorateAppRelease(&result)
	return result, err
}

func DeleteAppRelease(id string) error {
	item, err := repository.GetAppRelease(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return safeMessageError{message: "客户端版本不存在"}
	}
	if err != nil {
		return err
	}
	if err := repository.DeleteAppRelease(id); err != nil {
		return err
	}
	for _, artifact := range item.Artifacts {
		_ = os.Remove(appReleaseArtifactPath(artifact.StorageName))
	}
	return nil
}

func SaveAppReleaseArtifact(releaseID, platform, arch, fileName, contentType string, source io.Reader) (model.AppReleaseArtifact, error) {
	if _, err := repository.GetAppRelease(releaseID); errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AppReleaseArtifact{}, safeMessageError{message: "客户端版本不存在"}
	} else if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	platform, arch, extension, err := normalizeAppReleaseArtifact(platform, arch, fileName)
	if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	if err := os.MkdirAll(appReleaseDir(), 0o755); err != nil {
		return model.AppReleaseArtifact{}, err
	}
	id := newID("artifact")
	storageName := id + extension
	targetPath := appReleaseArtifactPath(storageName)
	target, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return model.AppReleaseArtifact{}, err
	}
	hash := sha256.New()
	bytesWritten, copyErr := io.Copy(io.MultiWriter(target, hash), io.LimitReader(source, AppReleaseMaxBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || bytesWritten <= 0 || bytesWritten > AppReleaseMaxBytes {
		_ = os.Remove(targetPath)
		if bytesWritten > AppReleaseMaxBytes {
			return model.AppReleaseArtifact{}, safeMessageError{message: "安装包不能超过 1GB"}
		}
		return model.AppReleaseArtifact{}, safeMessageError{message: "安装包保存失败"}
	}
	nowTime := time.Now()
	if strings.TrimSpace(contentType) == "" || contentType == "application/octet-stream" {
		contentType = mime.TypeByExtension(extension)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	item := model.AppReleaseArtifact{
		ID: id, ReleaseID: releaseID, Platform: platform, Arch: arch,
		FileName: sanitizeAppReleaseFileName(fileName, extension), StorageName: storageName,
		ContentType: contentType, FileSize: bytesWritten, SHA256: hex.EncodeToString(hash.Sum(nil)),
		CreatedAt: nowTime, UpdatedAt: nowTime,
	}
	saved, replaced, err := repository.UpsertAppReleaseArtifact(item)
	if err != nil {
		_ = os.Remove(targetPath)
		return model.AppReleaseArtifact{}, err
	}
	if replaced != nil {
		_ = os.Remove(appReleaseArtifactPath(replaced.StorageName))
	}
	decorateAppReleaseArtifact(&saved)
	return saved, nil
}

func DeleteAppReleaseArtifact(id string) error {
	current, err := repository.GetAppReleaseArtifact(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return safeMessageError{message: "安装包不存在"}
	}
	if err != nil {
		return err
	}
	release, err := repository.GetAppRelease(current.ReleaseID)
	if err != nil {
		return err
	}
	if release.Status == model.AppReleaseStatusPublished && len(release.Artifacts) <= 1 {
		return safeMessageError{message: "已发布版本必须保留至少一个安装包，请先改为草稿"}
	}
	item, err := repository.DeleteAppReleaseArtifact(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return safeMessageError{message: "安装包不存在"}
	}
	if err != nil {
		return err
	}
	_ = os.Remove(appReleaseArtifactPath(item.StorageName))
	return nil
}

func PublishedAppReleaseArtifact(id string) (model.AppReleaseArtifact, string, error) {
	item, err := repository.GetPublishedAppReleaseArtifact(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AppReleaseArtifact{}, "", safeMessageError{message: "安装包不存在或版本尚未发布"}
	}
	if err != nil {
		return model.AppReleaseArtifact{}, "", err
	}
	path := appReleaseArtifactPath(item.StorageName)
	if info, statErr := os.Stat(path); statErr != nil || info.IsDir() {
		return model.AppReleaseArtifact{}, "", safeMessageError{message: "安装包文件不存在"}
	}
	return item, path, nil
}

func normalizeAppReleaseVersion(value string) (string, error) {
	version := strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(value), "v"), "V")
	if !appReleaseVersionPattern.MatchString(version) {
		return "", safeMessageError{message: "版本号格式应为 1.2.3 或 1.2.3-beta.1"}
	}
	return version, nil
}

func normalizeAppReleaseArtifact(platform, arch, fileName string) (string, string, string, error) {
	platform = strings.ToLower(strings.TrimSpace(platform))
	arch = strings.ToLower(strings.TrimSpace(arch))
	extension := strings.ToLower(filepath.Ext(strings.TrimSpace(fileName)))
	allowed := false
	switch platform {
	case "windows":
		allowed = arch == "x64" || arch == "arm64"
		allowed = allowed && (extension == ".exe" || extension == ".msi" || extension == ".zip")
	case "macos":
		allowed = arch == "x64" || arch == "arm64" || arch == "universal"
		allowed = allowed && (extension == ".dmg" || extension == ".pkg" || extension == ".zip")
	}
	if !allowed {
		return "", "", "", safeMessageError{message: "平台、芯片架构或安装包格式不支持"}
	}
	return platform, arch, extension, nil
}

func sanitizeAppReleaseFileName(fileName, extension string) string {
	name := filepath.Base(strings.TrimSpace(fileName))
	name = strings.Map(func(character rune) rune {
		if character < 32 || character == 127 {
			return -1
		}
		return character
	}, name)
	if name == "" || name == "." {
		return "julong-canvas" + extension
	}
	return name
}

func decorateAppRelease(item *model.AppRelease) {
	for index := range item.Artifacts {
		decorateAppReleaseArtifact(&item.Artifacts[index])
	}
}

func decorateAppReleaseArtifact(item *model.AppReleaseArtifact) {
	item.DownloadURL = fmt.Sprintf("/api/app-releases/artifacts/%s/download", item.ID)
}

func appReleaseDir() string {
	return filepath.Join(appReleaseDataDir(), "app-releases")
}

func appReleaseArtifactPath(storageName string) string {
	return filepath.Join(appReleaseDir(), filepath.Base(storageName))
}

func appReleaseDataDir() string {
	driver := strings.ToLower(strings.TrimSpace(config.Cfg.StorageDriver))
	dsn := strings.TrimSpace(config.Cfg.DatabaseDSN)
	if (driver == "" || driver == "sqlite") && dsn != "" && dsn != ":memory:" && !strings.HasPrefix(dsn, "file:") {
		pathPart := strings.SplitN(dsn, "?", 2)[0]
		if filepath.IsAbs(pathPart) {
			return filepath.Dir(pathPart)
		}
	}
	if _, err := os.Stat("/app/data"); err == nil {
		return "/app/data"
	}
	return "data"
}
