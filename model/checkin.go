package model

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
