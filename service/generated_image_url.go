package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

var generatedImageTaskPathPattern = regexp.MustCompile(`(?i)/v1/images/generations/[^/]+/images/[0-9]+$`)

type GeneratedImageTemporaryURL struct {
	URL       string    `json:"url"`
	ExpiresIn int       `json:"expiresIn"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func ResolveGeneratedImageTemporaryURL(ctx context.Context, providerID, sourceURL, requestHost string) (GeneratedImageTemporaryURL, error) {
	channels, err := GetRawPrivateChannels()
	if err != nil {
		return GeneratedImageTemporaryURL{}, err
	}
	channel, err := selectGeneratedImageChannel(channels, providerID, sourceURL)
	if err != nil {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: err.Error()}
	}
	settings, err := GetSystemSettings()
	if err != nil {
		return GeneratedImageTemporaryURL{}, err
	}
	expiresIn := settings.MinIOStorage.PresignedURLExpirySeconds
	requestURL, err := buildGeneratedImagePresignURL(channel, sourceURL, requestHost, expiresIn)
	if err != nil {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: err.Error()}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return GeneratedImageTemporaryURL{}, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	for key, value := range channel.ExtraHeaders {
		if strings.EqualFold(key, "Authorization") || strings.EqualFold(key, "Host") || strings.EqualFold(key, "Content-Length") {
			continue
		}
		request.Header.Set(key, value)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: "临时图片地址服务连接失败"}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return GeneratedImageTemporaryURL{}, err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: generatedImagePresignError(response.StatusCode, body)}
	}
	var payload struct {
		URL       string `json:"url"`
		ExpiresIn int    `json:"expires_in"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: "临时图片地址响应格式错误"}
	}
	parsedURL, err := url.Parse(strings.TrimSpace(payload.URL))
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || parsedURL.Host == "" {
		return GeneratedImageTemporaryURL{}, safeMessageError{message: "临时图片地址响应无效"}
	}
	expiresAt, err := time.Parse(time.RFC3339, payload.ExpiresAt)
	if err != nil {
		expiresAt = time.Now().Add(time.Duration(expiresIn) * time.Second)
	}
	if payload.ExpiresIn <= 0 {
		payload.ExpiresIn = expiresIn
	}
	return GeneratedImageTemporaryURL{URL: parsedURL.String(), ExpiresIn: payload.ExpiresIn, ExpiresAt: expiresAt}, nil
}

func selectGeneratedImageChannel(channels []model.ModelChannel, providerID, sourceURL string) (model.ModelChannel, error) {
	enabled := make([]model.ModelChannel, 0, len(channels))
	for _, channel := range channels {
		if channel.Enabled {
			enabled = append(enabled, channel)
		}
	}
	if strings.HasPrefix(providerID, "srv-") {
		index, err := strconv.Atoi(strings.TrimPrefix(providerID, "srv-"))
		if err == nil && index >= 0 && index < len(enabled) {
			channel := enabled[index]
			if channel.APIKey == "" {
				return model.ModelChannel{}, fmt.Errorf("图片来源渠道未配置密钥")
			}
			return channel, nil
		}
		return model.ModelChannel{}, fmt.Errorf("图片来源渠道不存在")
	}
	for _, channel := range enabled {
		if channel.APIKey != "" && generatedImageSourceMatchesChannel(channel, sourceURL) {
			return channel, nil
		}
	}
	return model.ModelChannel{}, fmt.Errorf("无法识别图片来源渠道")
}

func buildGeneratedImagePresignURL(channel model.ModelChannel, sourceURL, requestHost string, expiresIn int) (string, error) {
	if expiresIn < 60 || expiresIn > 86400 {
		return "", fmt.Errorf("临时图片地址有效期配置无效")
	}
	parsed, err := canonicalGeneratedImageSourceURL(channel, sourceURL, requestHost)
	if err != nil {
		return "", err
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/presign"
	query := parsed.Query()
	query.Set("expires_in", strconv.Itoa(expiresIn))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func canonicalGeneratedImageSourceURL(channel model.ModelChannel, sourceURL, requestHost string) (*url.URL, error) {
	source, err := url.Parse(strings.TrimSpace(sourceURL))
	if err != nil || !generatedImageTaskPathPattern.MatchString(strings.TrimRight(source.Path, "/")) {
		return nil, fmt.Errorf("图片地址与来源渠道不匹配")
	}
	base, err := url.Parse(normalizeModelChannelBaseURL(channel.BaseURL))
	if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") {
		return nil, fmt.Errorf("图片来源渠道地址无效")
	}

	directChannelURL := source.Host != "" && strings.EqualFold(source.Scheme, base.Scheme) && strings.EqualFold(source.Host, base.Host)
	currentCanvasURL := source.Host == "" || generatedImageHostMatchesRequest(source.Host, requestHost)
	if !directChannelURL && !currentCanvasURL {
		return nil, fmt.Errorf("图片地址与来源渠道不匹配")
	}
	if !directChannelURL {
		source.Scheme = base.Scheme
		source.Host = base.Host
		source.User = base.User
	}
	return source, nil
}

func generatedImageHostMatchesRequest(sourceHost, requestHost string) bool {
	sourceName := generatedImageHostname(sourceHost)
	requestName := generatedImageHostname(requestHost)
	if sourceName == "" || requestName == "" {
		return false
	}
	if strings.EqualFold(sourceName, requestName) {
		return true
	}
	return isLoopbackHostname(sourceName) && isLoopbackHostname(requestName)
}

func generatedImageHostname(rawHost string) string {
	rawHost = strings.TrimSpace(strings.Split(rawHost, ",")[0])
	return strings.TrimSuffix(strings.ToLower((&url.URL{Host: rawHost}).Hostname()), ".")
}

func isLoopbackHostname(hostname string) bool {
	if strings.EqualFold(hostname, "localhost") {
		return true
	}
	ip := net.ParseIP(hostname)
	return ip != nil && ip.IsLoopback()
}

func generatedImageSourceMatchesChannel(channel model.ModelChannel, sourceURL string) bool {
	source, err := url.Parse(strings.TrimSpace(sourceURL))
	if err != nil || source.Host == "" || !generatedImageTaskPathPattern.MatchString(strings.TrimRight(source.Path, "/")) {
		return false
	}
	base, err := url.Parse(normalizeModelChannelBaseURL(channel.BaseURL))
	if err != nil || base.Host == "" {
		return false
	}
	return strings.EqualFold(source.Scheme, base.Scheme) && strings.EqualFold(source.Host, base.Host)
}

func generatedImagePresignError(status int, body []byte) string {
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &payload)
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "图片来源渠道鉴权失败，请管理员检查渠道密钥"
	case http.StatusNotFound:
		return "原图片任务不存在或已无权访问"
	case http.StatusConflict:
		return "该图片尚未保存到媒体存储"
	default:
		if strings.TrimSpace(payload.Error.Message) != "" {
			return "临时图片地址生成失败：" + payload.Error.Message
		}
		return "临时图片地址生成失败"
	}
}
