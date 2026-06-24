package model

import "time"

// RequestLog 记录 AI 代理层的完整请求详情
type RequestLog struct {
	ID             string    `json:"id" gorm:"primaryKey"`
	UserID         string    `json:"userId" gorm:"index"`
	Username       string    `json:"username"`
	Model          string    `json:"model" gorm:"index"`
	Method         string    `json:"method"`
	Path           string    `json:"path"`
	URL            string    `json:"url"`
	RequestHeaders string    `json:"requestHeaders" gorm:"type:text"`
	RequestBody    string    `json:"requestBody" gorm:"type:text"`
	RequestBodySize int      `json:"requestBodySize"`
	ResponseBody   string    `json:"responseBody" gorm:"type:text"`
	StatusCode     int       `json:"statusCode"`
	Success        bool      `json:"success"`
	ErrorMsg       string    `json:"errorMsg" gorm:"type:text"`
	IsPolling      bool      `json:"isPolling"`
	CreatedAt      time.Time `json:"createdAt" gorm:"index"`
}

type RequestLogList struct {
	Items []RequestLog `json:"items"`
	Total int64        `json:"total"`
}

func (RequestLog) TableName() string {
	return "request_logs"
}
