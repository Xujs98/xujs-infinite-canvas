package service

import (
	"net"
	"net/http"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	clientTypeHeader = "X-Canvas-Client"
	deviceCodeHeader = "X-Canvas-Device-Code"
	appVersionHeader = "X-Canvas-App-Version"
	osNameHeader     = "X-Canvas-OS-Name"
	osVersionHeader  = "X-Canvas-OS-Version"
)

type ClientMetadata struct {
	IPAddress  string
	DeviceCode string
	ClientType string
	AppVersion string
	OSName     string
	OSVersion  string
	UserAgent  string
}

func ClientMetadataFromRequest(r *http.Request) ClientMetadata {
	clientType := strings.ToLower(strings.TrimSpace(r.Header.Get(clientTypeHeader)))
	if clientType != "app" {
		clientType = "web"
	}
	return ClientMetadata{
		IPAddress:  ClientIPFromRequest(r),
		DeviceCode: normalizeDeviceCode(r.Header.Get(deviceCodeHeader)),
		ClientType: clientType,
		AppVersion: trimField(r.Header.Get(appVersionHeader), 64),
		OSName:     trimField(r.Header.Get(osNameHeader), 80),
		OSVersion:  trimField(r.Header.Get(osVersionHeader), 80),
		UserAgent:  trimField(r.UserAgent(), 1000),
	}
}

func ClientIPFromRequest(r *http.Request) string {
	remoteIP := parseIPValue(r.RemoteAddr)
	if isTrustedProxyIP(remoteIP) {
		if realIP := parseIPValue(r.Header.Get("X-Real-IP")); realIP != "" {
			return realIP
		}
		forwardedParts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		fallbackIP := ""
		for index := len(forwardedParts) - 1; index >= 0; index-- {
			forwardedIP := parseIPValue(forwardedParts[index])
			if forwardedIP == "" {
				continue
			}
			if fallbackIP == "" {
				fallbackIP = forwardedIP
			}
			if !isTrustedProxyIP(forwardedIP) {
				return forwardedIP
			}
		}
		if fallbackIP != "" {
			return fallbackIP
		}
	}
	return remoteIP
}

func CheckRequestAccess(r *http.Request) (model.ClientAccessDecision, error) {
	return CheckClientAccess(ClientMetadataFromRequest(r))
}

func CheckClientAccess(metadata ClientMetadata) (model.ClientAccessDecision, error) {
	deviceCode := normalizeDeviceCode(metadata.DeviceCode)
	ipAddress := normalizeIP(metadata.IPAddress)
	bans, err := repository.FindMatchingAccessBans(deviceCode, ipAddress)
	if err != nil {
		return model.ClientAccessDecision{}, err
	}
	blockedIP := false
	for _, ban := range bans {
		if ban.Kind == model.AccessBanDevice && ban.Value == deviceCode {
			return model.ClientAccessDecision{Blocked: true, Kind: model.AccessBanDevice, Message: "当前设备已被封禁"}, nil
		}
		if ban.Kind == model.AccessBanIP && ban.Value == ipAddress {
			blockedIP = true
		}
	}
	if blockedIP {
		return model.ClientAccessDecision{Blocked: true, Kind: model.AccessBanIP, Message: "当前 IP 已被封禁"}, nil
	}
	return model.ClientAccessDecision{Blocked: false}, nil
}

func RecordClientAccess(userID string, metadata ClientMetadata) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil
	}
	metadata.IPAddress = normalizeIP(metadata.IPAddress)
	metadata.DeviceCode = normalizeDeviceCode(metadata.DeviceCode)
	if metadata.ClientType != "app" {
		metadata.ClientType = "web"
	}
	if metadata.IPAddress == "" && metadata.DeviceCode == "" {
		return nil
	}
	timestamp := now()
	created, err := repository.UpsertClientAccess(model.ClientAccessRecord{
		ID:          newID("access"),
		UserID:      userID,
		IPAddress:   metadata.IPAddress,
		DeviceCode:  metadata.DeviceCode,
		ClientType:  metadata.ClientType,
		AppVersion:  trimField(metadata.AppVersion, 64),
		OSName:      trimField(metadata.OSName, 80),
		OSVersion:   trimField(metadata.OSVersion, 80),
		UserAgent:   trimField(metadata.UserAgent, 1000),
		SeenCount:   1,
		FirstSeenAt: timestamp,
		LastSeenAt:  timestamp,
	})
	if err != nil {
		return err
	}
	if created {
		_ = RecordRiskEvent(RiskEventInput{
			UserID:    userID,
			EventType: "new_access_identity",
			Level:     model.RiskLevelLow,
			Source:    "access",
			Summary:   "检测到新的登录 IP 或设备",
			Metadata:  metadata,
			Detail:    map[string]any{"firstSeen": true},
		})
	}
	return nil
}

func GetUserAccessRecords(userID string) ([]model.AdminUserIPRecord, []model.AdminUserDeviceRecord, error) {
	records, err := repository.ListUserClientAccess(userID)
	if err != nil {
		return nil, nil, err
	}
	bans, err := repository.ListAccessBans()
	if err != nil {
		return nil, nil, err
	}
	blockedIPs := map[string]bool{}
	blockedDevices := map[string]bool{}
	for _, ban := range bans {
		if ban.Kind == model.AccessBanIP {
			blockedIPs[ban.Value] = true
		} else if ban.Kind == model.AccessBanDevice {
			blockedDevices[ban.Value] = true
		}
	}

	type ipAggregate struct {
		record      model.AdminUserIPRecord
		clientTypes map[string]struct{}
		devices     map[string]struct{}
	}
	type deviceAggregate struct {
		record model.AdminUserDeviceRecord
		ips    map[string]struct{}
	}
	ipMap := map[string]*ipAggregate{}
	deviceMap := map[string]*deviceAggregate{}
	for _, access := range records {
		if access.IPAddress != "" {
			aggregate := ipMap[access.IPAddress]
			if aggregate == nil {
				aggregate = &ipAggregate{
					record:      model.AdminUserIPRecord{IPAddress: access.IPAddress, Blocked: blockedIPs[access.IPAddress], FirstSeenAt: access.FirstSeenAt, LastSeenAt: access.LastSeenAt},
					clientTypes: map[string]struct{}{},
					devices:     map[string]struct{}{},
				}
				ipMap[access.IPAddress] = aggregate
			}
			aggregate.record.SeenCount += access.SeenCount
			aggregate.record.FirstSeenAt = earlierTimestamp(aggregate.record.FirstSeenAt, access.FirstSeenAt)
			aggregate.record.LastSeenAt = laterTimestamp(aggregate.record.LastSeenAt, access.LastSeenAt)
			aggregate.clientTypes[access.ClientType] = struct{}{}
			if access.DeviceCode != "" {
				aggregate.devices[access.DeviceCode] = struct{}{}
			}
		}
		if access.DeviceCode != "" {
			aggregate := deviceMap[access.DeviceCode]
			if aggregate == nil {
				aggregate = &deviceAggregate{
					record: model.AdminUserDeviceRecord{DeviceCode: access.DeviceCode, Blocked: blockedDevices[access.DeviceCode], AppVersion: access.AppVersion, OSName: access.OSName, OSVersion: access.OSVersion, FirstSeenAt: access.FirstSeenAt, LastSeenAt: access.LastSeenAt},
					ips:    map[string]struct{}{},
				}
				deviceMap[access.DeviceCode] = aggregate
			}
			aggregate.record.SeenCount += access.SeenCount
			aggregate.record.FirstSeenAt = earlierTimestamp(aggregate.record.FirstSeenAt, access.FirstSeenAt)
			if access.LastSeenAt >= aggregate.record.LastSeenAt {
				aggregate.record.LastSeenAt = access.LastSeenAt
				aggregate.record.AppVersion = access.AppVersion
				aggregate.record.OSName = access.OSName
				aggregate.record.OSVersion = access.OSVersion
			}
			if access.IPAddress != "" {
				aggregate.ips[access.IPAddress] = struct{}{}
			}
		}
	}

	ipRecords := make([]model.AdminUserIPRecord, 0, len(ipMap))
	for _, aggregate := range ipMap {
		aggregate.record.ClientTypes = sortedSet(aggregate.clientTypes)
		aggregate.record.DeviceCount = len(aggregate.devices)
		ipRecords = append(ipRecords, aggregate.record)
	}
	deviceRecords := make([]model.AdminUserDeviceRecord, 0, len(deviceMap))
	for _, aggregate := range deviceMap {
		aggregate.record.IPAddresses = sortedSet(aggregate.ips)
		deviceRecords = append(deviceRecords, aggregate.record)
	}
	sort.Slice(ipRecords, func(i, j int) bool { return ipRecords[i].LastSeenAt > ipRecords[j].LastSeenAt })
	sort.Slice(deviceRecords, func(i, j int) bool { return deviceRecords[i].LastSeenAt > deviceRecords[j].LastSeenAt })
	return ipRecords, deviceRecords, nil
}

func SetAccessBan(adminUserID string, kind model.AccessBanKind, value string, blocked bool) error {
	normalized, err := normalizeBanValue(kind, value)
	if err != nil {
		return err
	}
	if !blocked {
		if err := repository.DeleteAccessBan(kind, normalized); err != nil {
			return err
		}
		_ = RecordRiskEvent(RiskEventInput{
			UserID: adminUserID, EventType: "admin_access_ban_changed", Level: model.RiskLevelLow,
			Source: "admin", Summary: "管理员解除了访问封禁", Detail: map[string]any{"kind": kind, "blocked": false},
		})
		return nil
	}
	timestamp := now()
	if err := repository.SaveAccessBan(model.AccessBan{
		ID:        newID("ban"),
		Kind:      kind,
		Value:     normalized,
		CreatedBy: strings.TrimSpace(adminUserID),
		CreatedAt: timestamp,
		UpdatedAt: timestamp,
	}); err != nil {
		return err
	}
	_ = RecordRiskEvent(RiskEventInput{
		UserID: adminUserID, EventType: "admin_access_ban_changed", Level: model.RiskLevelMedium,
		Source: "admin", Summary: "管理员新增了访问封禁", Detail: map[string]any{"kind": kind, "blocked": true},
	})
	return nil
}

func normalizeBanValue(kind model.AccessBanKind, value string) (string, error) {
	switch kind {
	case model.AccessBanIP:
		if normalized := normalizeIP(value); normalized != "" {
			return normalized, nil
		}
		return "", safeMessageError{message: "IP 地址格式无效"}
	case model.AccessBanDevice:
		if normalized := normalizeDeviceCode(value); normalized != "" {
			return normalized, nil
		}
		return "", safeMessageError{message: "设备码格式无效"}
	default:
		return "", safeMessageError{message: "封禁类型无效"}
	}
}

func normalizeDeviceCode(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) < 8 || len(value) > 128 {
		return ""
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || strings.ContainsRune("-_.:", char) {
			continue
		}
		return ""
	}
	return value
}

func normalizeIP(value string) string {
	return parseIPValue(value)
}

func parseIPValue(value string) string {
	value = strings.TrimSpace(value)
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	value = strings.Trim(value, "[]")
	ip := net.ParseIP(value)
	if ip == nil {
		return ""
	}
	return ip.String()
}

func isTrustedProxyIP(value string) bool {
	ip := net.ParseIP(value)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

func trimField(value string, maxLength int) string {
	value = strings.TrimSpace(value)
	if maxLength <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= maxLength {
		return value
	}
	return string(runes[:maxLength])
}

func earlierTimestamp(left, right string) string {
	if left == "" || (right != "" && right < left) {
		return right
	}
	return left
}

func laterTimestamp(left, right string) string {
	if right > left {
		return right
	}
	return left
}

func sortedSet(values map[string]struct{}) []string {
	items := make([]string, 0, len(values))
	for value := range values {
		if value != "" {
			items = append(items, value)
		}
	}
	sort.Strings(items)
	return items
}
