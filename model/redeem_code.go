package model

type RedeemCodeType string

const (
	RedeemCodeTypeCredits    RedeemCodeType = "credits"
	RedeemCodeTypeMembership RedeemCodeType = "membership"
)

type RedeemCodeStatus string

const (
	RedeemCodeStatusUnused RedeemCodeStatus = "unused"
	RedeemCodeStatusUsed   RedeemCodeStatus = "used"
)

// RedeemCode 卡密。
type RedeemCode struct {
	ID             string           `json:"id" gorm:"primaryKey"`
	Code           string           `json:"code" gorm:"uniqueIndex"`
	Type           RedeemCodeType   `json:"type"`
	Credits        int              `json:"credits"`
	MembershipDays int              `json:"membershipDays"`
	Status         RedeemCodeStatus `json:"status" gorm:"index"`
	UsedBy         string           `json:"usedBy"`
	UsedByName     string           `json:"usedByName" gorm:"-"`
	UsedAt         string           `json:"usedAt"`
	BatchName      string           `json:"batchName"`
	Remark         string           `json:"remark"`
	CreatedAt      string           `json:"createdAt"`
	UpdatedAt      string           `json:"updatedAt"`
}

type RedeemCodeList struct {
	Items []RedeemCode `json:"items"`
	Total int          `json:"total"`
}
