package service

import (
	"errors"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/minio/minio-go/v7"
)

func TestMinIOTestSafeError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		contains string
	}{
		{name: "unknown access key", err: minio.ErrorResponse{Code: "InvalidAccessKeyId"}, contains: "访问密钥不存在"},
		{name: "signature mismatch", err: minio.ErrorResponse{Code: "SignatureDoesNotMatch"}, contains: "签名不匹配"},
		{name: "access denied", err: minio.ErrorResponse{Code: "AccessDenied"}, contains: "读写权限"},
		{name: "missing bucket", err: minio.ErrorResponse{Code: "NoSuchBucket"}, contains: "存储桶不存在"},
		{name: "clock skew", err: minio.ErrorResponse{Code: "RequestTimeTooSkewed"}, contains: "系统时间偏差"},
		{name: "certificate", err: errors.New("x509: certificate signed by unknown authority"), contains: "证书校验失败"},
		{name: "dns", err: errors.New("dial tcp: lookup media.example: no such host"), contains: "无法解析"},
		{name: "refused", err: errors.New("dial tcp: connection refused"), contains: "拒绝连接"},
		{name: "timeout", err: errors.New("context deadline exceeded"), contains: "连接 MinIO 超时"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := minIOTestSafeError(test.err)
			safe, ok := err.(interface{ SafeMessage() string })
			if !ok {
				t.Fatalf("error does not provide SafeMessage(): %T", err)
			}
			if message := safe.SafeMessage(); !strings.Contains(message, test.contains) {
				t.Fatalf("SafeMessage() = %q, want substring %q", message, test.contains)
			}
		})
	}
}

func TestMinIOTestSafeErrorDoesNotExposeUnknownError(t *testing.T) {
	const secret = "do-not-leak-this-secret"
	err := minIOTestSafeError(errors.New("unexpected upstream failure: " + secret))
	safe := err.(interface{ SafeMessage() string }).SafeMessage()
	if strings.Contains(safe, secret) {
		t.Fatalf("SafeMessage() leaked the original error: %q", safe)
	}
}

func TestMinIOPresignedURLExpiryDefaultsAndValidation(t *testing.T) {
	config := model.MinIOStorageConfig{}
	applyMinIOStorageDefaults(&config)
	if config.PresignedURLExpirySeconds != 3600 {
		t.Fatalf("default expiry = %d, want 3600", config.PresignedURLExpirySeconds)
	}
	config.Endpoint = "https://media.example.com"
	config.PresignedURLExpirySeconds = 59
	if err := validateMinIOStorageConfig(config, false); err == nil {
		t.Fatal("expected expiry below 60 seconds to be rejected")
	}
	config.PresignedURLExpirySeconds = 86401
	if err := validateMinIOStorageConfig(config, false); err == nil {
		t.Fatal("expected expiry above 24 hours to be rejected")
	}
}
