package model

import "time"

// CallLog 记录用户 AI 调用日志。
type CallLog struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	UserID     string    `json:"userId" gorm:"index"`
	Username   string    `json:"username"`
	Model      string    `json:"model" gorm:"index"`
	Path       string    `json:"path"`
	Success    bool      `json:"success"`
	ErrorMsg   string    `json:"errorMsg" gorm:"type:text"`
	Credits    int       `json:"credits"`
	CreatedAt  time.Time `json:"createdAt" gorm:"index"`
}

type CallLogList struct {
	Items []CallLog `json:"items"`
	Total int64     `json:"total"`
}

func (CallLog) TableName() string {
	return "call_logs"
}
