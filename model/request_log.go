package model

import "time"

// RequestLog records one user-visible operation and its diagnostic context.
type RequestLog struct {
	ID                  string    `json:"id" gorm:"primaryKey"`
	UserID              string    `json:"userId" gorm:"index"`
	Username            string    `json:"username"`
	EventType           string    `json:"eventType" gorm:"index"`
	Operation           string    `json:"operation" gorm:"index"`
	Model               string    `json:"model" gorm:"index"`
	ChannelName         string    `json:"channelName" gorm:"index"`
	ProviderID          string    `json:"providerId" gorm:"index"`
	Method              string    `json:"method"`
	Path                string    `json:"path"`
	URL                 string    `json:"url"`
	RequestHeaders      string    `json:"requestHeaders" gorm:"type:text"`
	RequestBody         string    `json:"requestBody" gorm:"type:text"`
	RequestMedia        string    `json:"requestMedia" gorm:"type:text"`
	RequestConfig       string    `json:"requestConfig" gorm:"type:text"`
	RequestBodySize     int       `json:"requestBodySize"`
	ResponseHeaders     string    `json:"responseHeaders" gorm:"type:text"`
	ResponseBody        string    `json:"responseBody" gorm:"type:text"`
	StatusCode          int       `json:"statusCode"`
	Success             bool      `json:"success"`
	ErrorMsg            string    `json:"errorMsg" gorm:"type:text"`
	ErrorStage          string    `json:"errorStage"`
	IsPolling           bool      `json:"isPolling"`
	Source              string    `json:"source" gorm:"index;default:'web'"`
	ElapsedMs           int64     `json:"elapsedMs"`
	Credits             int       `json:"credits"`
	WalletCredits       int       `json:"walletCredits"`
	SubscriptionCredits int       `json:"subscriptionCredits"`
	BillingMode         string    `json:"billingMode"`
	ChargeStatus        string    `json:"chargeStatus"`
	RequestedCount      int       `json:"requestedCount"`
	GeneratedCount      int       `json:"generatedCount"`
	ReferenceImageCount int       `json:"referenceImageCount"`
	ReferenceVideoCount int       `json:"referenceVideoCount"`
	ReferenceAudioCount int       `json:"referenceAudioCount"`
	TaskID              string    `json:"taskId" gorm:"index"`
	CreditChargeID      string    `json:"creditChargeId" gorm:"index"`
	RequestID           string    `json:"requestId" gorm:"index"`
	IPAddress           string    `json:"ipAddress"`
	DeviceCode          string    `json:"deviceCode"`
	ClientType          string    `json:"clientType"`
	AppVersion          string    `json:"appVersion"`
	OSName              string    `json:"osName"`
	OSVersion           string    `json:"osVersion"`
	UserAgent           string    `json:"userAgent" gorm:"type:text"`
	CreatedAt           time.Time `json:"createdAt" gorm:"index"`
}

// RequestLogSummary 是列表页使用的轻量记录，不包含可能达到数 MB 的正文。
type RequestLogSummary struct {
	ID                  string    `json:"id"`
	UserID              string    `json:"userId"`
	Username            string    `json:"username"`
	EventType           string    `json:"eventType"`
	Operation           string    `json:"operation"`
	Model               string    `json:"model"`
	ChannelName         string    `json:"channelName"`
	ProviderID          string    `json:"providerId"`
	Method              string    `json:"method"`
	Path                string    `json:"path"`
	URL                 string    `json:"url"`
	RequestBodySize     int       `json:"requestBodySize"`
	StatusCode          int       `json:"statusCode"`
	Success             bool      `json:"success"`
	IsPolling           bool      `json:"isPolling"`
	Source              string    `json:"source"`
	ElapsedMs           int64     `json:"elapsedMs"`
	Credits             int       `json:"credits"`
	WalletCredits       int       `json:"walletCredits"`
	SubscriptionCredits int       `json:"subscriptionCredits"`
	BillingMode         string    `json:"billingMode"`
	ChargeStatus        string    `json:"chargeStatus"`
	RequestedCount      int       `json:"requestedCount"`
	GeneratedCount      int       `json:"generatedCount"`
	TaskID              string    `json:"taskId"`
	ErrorStage          string    `json:"errorStage"`
	CreatedAt           time.Time `json:"createdAt"`
}

type RequestLogList struct {
	Items []RequestLogSummary `json:"items"`
	Total int64               `json:"total"`
	Stats RequestLogStats     `json:"stats"`
}

type RequestLogStats struct {
	Total     int64   `json:"total"`
	Success   int64   `json:"success"`
	Failed    int64   `json:"failed"`
	Credits   int64   `json:"credits"`
	AverageMs float64 `json:"averageMs"`
}

type RequestLogQuery struct {
	Keyword   string
	Model     string
	Channel   string
	Source    string
	EventType string
	Operation string
	Status    string
	Method    string
	StartTime *time.Time
	EndTime   *time.Time
	Page      int
	PageSize  int
}

func (q *RequestLogQuery) Normalize() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}
	if q.PageSize > MaxPageSize {
		q.PageSize = MaxPageSize
	}
}

func (q RequestLogQuery) Offset() int {
	return (q.Page - 1) * q.PageSize
}

func (RequestLog) TableName() string {
	return "request_logs"
}
