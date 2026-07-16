package model

import (
	"strings"
	"time"
)

var checkInLocation = func() *time.Location {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return location
}()

// CheckIn 签到记录
type CheckIn struct {
	ID        string `json:"id" gorm:"primaryKey"`
	UserID    string `json:"userId" gorm:"index"`
	Reward    int    `json:"reward"`
	CreatedAt string `json:"createdAt"`
}

type CheckInMonth struct {
	Items []CheckIn `json:"items"`
}

// CheckInLocalTime returns the business time used to determine a check-in day.
func CheckInLocalTime(value time.Time) time.Time {
	return value.In(checkInLocation)
}

func CheckInDate(value time.Time) string {
	return CheckInLocalTime(value).Format("2006-01-02")
}

func CheckInDateFromTimestamp(value string) string {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err == nil {
		return CheckInDate(parsed)
	}
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}
