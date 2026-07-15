package model

import "time"

// RequestLog 记录 AI 代理层的完整请求详情
type RequestLog struct {
	ID              string    `json:"id" gorm:"primaryKey"`
	UserID          string    `json:"userId" gorm:"index"`
	Username        string    `json:"username"`
	Model           string    `json:"model" gorm:"index"`
	Method          string    `json:"method"`
	Path            string    `json:"path"`
	URL             string    `json:"url"`
	RequestHeaders  string    `json:"requestHeaders" gorm:"type:text"`
	RequestBody     string    `json:"requestBody" gorm:"type:text"`
	RequestMedia    string    `json:"requestMedia" gorm:"type:text"`
	RequestBodySize int       `json:"requestBodySize"`
	ResponseBody    string    `json:"responseBody" gorm:"type:text"`
	StatusCode      int       `json:"statusCode"`
	Success         bool      `json:"success"`
	ErrorMsg        string    `json:"errorMsg" gorm:"type:text"`
	IsPolling       bool      `json:"isPolling"`
	Source          string    `json:"source" gorm:"index;default:'web'"` // "web" | "app"
	CreatedAt       time.Time `json:"createdAt" gorm:"index"`
}

// RequestLogSummary 是列表页使用的轻量记录，不包含可能达到数 MB 的正文。
type RequestLogSummary struct {
	ID              string    `json:"id"`
	UserID          string    `json:"userId"`
	Username        string    `json:"username"`
	Model           string    `json:"model"`
	Method          string    `json:"method"`
	Path            string    `json:"path"`
	URL             string    `json:"url"`
	RequestBodySize int       `json:"requestBodySize"`
	StatusCode      int       `json:"statusCode"`
	Success         bool      `json:"success"`
	IsPolling       bool      `json:"isPolling"`
	Source          string    `json:"source"`
	CreatedAt       time.Time `json:"createdAt"`
}

type RequestLogList struct {
	Items []RequestLogSummary `json:"items"`
	Total int64               `json:"total"`
}

func (RequestLog) TableName() string {
	return "request_logs"
}
