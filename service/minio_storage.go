package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func GetMinIOStorageConfig() (model.MinIOStorageConfig, error) {
	settings, err := repository.GetSystemSettings()
	if err != nil {
		return model.MinIOStorageConfig{}, err
	}
	return minIOStorageConfigFromMap(settings), nil
}

func TestMinIOStorage(ctx context.Context, candidate model.MinIOStorageConfig) error {
	existing, err := GetMinIOStorageConfig()
	if err != nil {
		return err
	}
	if strings.TrimSpace(candidate.SecretKey) == "" {
		candidate.SecretKey = existing.SecretKey
	}
	applyMinIOStorageDefaults(&candidate)
	if err := validateMinIOStorageConfig(candidate, true); err != nil {
		return safeMessageError{message: err.Error()}
	}
	client, err := newMinIOClient(candidate)
	if err != nil {
		return safeMessageError{message: err.Error()}
	}
	exists, err := client.BucketExists(ctx, candidate.Bucket)
	if err != nil {
		return minIOTestSafeError(err)
	}
	if !exists {
		return safeMessageError{message: fmt.Sprintf("存储桶 %q 不存在，请先在 MinIO 中创建", candidate.Bucket)}
	}
	return nil
}

func minIOTestSafeError(err error) error {
	response := minio.ToErrorResponse(err)
	switch response.Code {
	case "InvalidAccessKeyId":
		return safeMessageError{message: "MinIO 访问密钥不存在，请检查访问密钥"}
	case "SignatureDoesNotMatch":
		return safeMessageError{message: "MinIO 请求签名不匹配，请检查私密密钥；如果直连成功，请确认反向代理保留原始 Host 请求头"}
	case "AccessDenied", "Unauthorized":
		return safeMessageError{message: "MinIO 拒绝访问，请确认项目账号已启用并拥有该存储桶的读写权限"}
	case "NoSuchBucket":
		return safeMessageError{message: "MinIO 存储桶不存在，请检查存储桶名称"}
	case "RequestTimeTooSkewed":
		return safeMessageError{message: "MinIO 与画布服务端的系统时间偏差过大，请同步服务器时间"}
	}

	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "x509") || strings.Contains(message, "certificate"):
		return safeMessageError{message: "MinIO HTTPS 证书校验失败，请检查域名证书是否有效且与服务地址一致"}
	case strings.Contains(message, "no such host"):
		return safeMessageError{message: "无法解析 MinIO 服务域名，请检查服务地址和 DNS"}
	case strings.Contains(message, "connection refused"):
		return safeMessageError{message: "MinIO 拒绝连接，请检查 19000 API 端口和反向代理"}
	case strings.Contains(message, "timeout") || strings.Contains(message, "deadline exceeded"):
		return safeMessageError{message: "连接 MinIO 超时，请检查网络、防火墙和反向代理"}
	default:
		return safeMessageError{message: "连接 MinIO 失败，请检查服务地址、项目密钥、存储桶名称和账号权限"}
	}
}

func minIOStorageConfigFromMap(settings map[string]string) model.MinIOStorageConfig {
	config := model.MinIOStorageConfig{
		Enabled:                   settings[model.SettingMinIOEnabled] == "true",
		Endpoint:                  settings[model.SettingMinIOEndpoint],
		Bucket:                    settings[model.SettingMinIOBucket],
		Region:                    settings[model.SettingMinIORegion],
		AccessKey:                 settings[model.SettingMinIOAccessKey],
		SecretKey:                 settings[model.SettingMinIOSecretKey],
		UseSSL:                    settings[model.SettingMinIOUseSSL] != "false",
		UsePathStyle:              settings[model.SettingMinIOUsePathStyle] != "false",
		GeneratedPrefix:           settings[model.SettingMinIOGeneratedPrefix],
		CanvasPrefix:              settings[model.SettingMinIOCanvasPrefix],
		PresignedURLExpirySeconds: intSetting(settings, model.SettingMinIOPresignedURLExpiry, 3600),
	}
	applyMinIOStorageDefaults(&config)
	config.SecretConfigured = strings.TrimSpace(config.SecretKey) != ""
	return config
}

func applyMinIOStorageDefaults(config *model.MinIOStorageConfig) {
	config.Endpoint = strings.TrimSpace(config.Endpoint)
	config.Bucket = strings.TrimSpace(config.Bucket)
	config.Region = strings.TrimSpace(config.Region)
	config.AccessKey = strings.TrimSpace(config.AccessKey)
	config.SecretKey = strings.TrimSpace(config.SecretKey)
	config.GeneratedPrefix = strings.Trim(strings.TrimSpace(config.GeneratedPrefix), "/")
	config.CanvasPrefix = strings.Trim(strings.TrimSpace(config.CanvasPrefix), "/")
	if config.Bucket == "" {
		config.Bucket = "julong-media"
	}
	if config.Region == "" {
		config.Region = "us-east-1"
	}
	if config.GeneratedPrefix == "" {
		config.GeneratedPrefix = "generated/images"
	}
	if config.CanvasPrefix == "" {
		config.CanvasPrefix = "canvas/uploads"
	}
	if config.PresignedURLExpirySeconds == 0 {
		config.PresignedURLExpirySeconds = 3600
	}
}

func validateMinIOStorageConfig(config model.MinIOStorageConfig, required bool) error {
	if config.Endpoint == "" {
		if !required {
			return nil
		}
		return fmt.Errorf("请填写 MinIO Endpoint")
	}
	if config.Bucket == "" {
		return fmt.Errorf("请填写 MinIO Bucket")
	}
	if required && (config.AccessKey == "" || config.SecretKey == "") {
		return fmt.Errorf("请填写 MinIO Access Key 和 Secret Key")
	}
	if config.PresignedURLExpirySeconds < 60 || config.PresignedURLExpirySeconds > 86400 {
		return fmt.Errorf("临时图片地址有效期必须在 60 秒到 86400 秒之间")
	}
	_, _, err := normalizeMinIOEndpoint(config.Endpoint, config.UseSSL)
	return err
}

func newMinIOClient(config model.MinIOStorageConfig) (*minio.Client, error) {
	endpoint, secure, err := normalizeMinIOEndpoint(config.Endpoint, config.UseSSL)
	if err != nil {
		return nil, err
	}
	lookup := minio.BucketLookupAuto
	if config.UsePathStyle {
		lookup = minio.BucketLookupPath
	}
	return minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(config.AccessKey, config.SecretKey, ""),
		Secure:       secure,
		Region:       config.Region,
		BucketLookup: lookup,
	})
}

func normalizeMinIOEndpoint(raw string, defaultSecure bool) (string, bool, error) {
	value := strings.TrimSpace(raw)
	if !strings.Contains(value, "://") {
		if defaultSecure {
			value = "https://" + value
		} else {
			value = "http://" + value
		}
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return "", false, fmt.Errorf("MinIO Endpoint 格式不正确")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false, fmt.Errorf("MinIO Endpoint 仅支持 HTTP 或 HTTPS")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return "", false, fmt.Errorf("MinIO Endpoint 不能包含路径")
	}
	return parsed.Host, parsed.Scheme == "https", nil
}
