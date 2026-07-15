package model

type SubscriptionDurationUnit string

const (
	SubscriptionDurationDay    SubscriptionDurationUnit = "day"
	SubscriptionDurationMonth  SubscriptionDurationUnit = "month"
	SubscriptionDurationYear   SubscriptionDurationUnit = "year"
	SubscriptionDurationHour   SubscriptionDurationUnit = "hour"
	SubscriptionDurationCustom SubscriptionDurationUnit = "custom"
)

type SubscriptionResetCycle string

const (
	SubscriptionResetNone    SubscriptionResetCycle = "none"
	SubscriptionResetDaily   SubscriptionResetCycle = "daily"
	SubscriptionResetWeekly  SubscriptionResetCycle = "weekly"
	SubscriptionResetMonthly SubscriptionResetCycle = "monthly"
	SubscriptionResetCustom  SubscriptionResetCycle = "custom"
)

type SubscriptionPlan struct {
	ID                    string                   `json:"id" gorm:"primaryKey"`
	Title                 string                   `json:"title"`
	Subtitle              string                   `json:"subtitle"`
	PriceCredits          int                      `json:"priceCredits"`
	UpgradeRole           string                   `json:"upgradeRole" gorm:"index"`
	DowngradeRole         string                   `json:"downgradeRole"`
	PurchaseLimit         int                      `json:"purchaseLimit" gorm:"default:0"`
	Sort                  int                      `json:"sort" gorm:"default:0"`
	Enabled               bool                     `json:"enabled" gorm:"default:true;index"`
	DurationUnit          SubscriptionDurationUnit `json:"durationUnit"`
	DurationValue         int                      `json:"durationValue"`
	DurationCustomSeconds int                      `json:"durationCustomSeconds" gorm:"default:0"`
	QuotaCredits          int                      `json:"quotaCredits" gorm:"default:0"`
	ResetCycle            SubscriptionResetCycle   `json:"resetCycle" gorm:"default:none"`
	ResetCustomSeconds    int                      `json:"resetCustomSeconds" gorm:"default:0"`
	AllowWalletFallback   bool                     `json:"allowWalletFallback" gorm:"default:false"`
	CreatedAt             string                   `json:"createdAt"`
	UpdatedAt             string                   `json:"updatedAt"`
	SubscriberCount       int                      `json:"subscriberCount" gorm:"-"`
}

type SubscriptionPlanList struct {
	Items []SubscriptionPlan `json:"items"`
	Total int                `json:"total"`
}

type UserSubscriptionStatus string

const (
	UserSubscriptionActive   UserSubscriptionStatus = "active"
	UserSubscriptionExpired  UserSubscriptionStatus = "expired"
	UserSubscriptionReplaced UserSubscriptionStatus = "replaced"
	UserSubscriptionVoided   UserSubscriptionStatus = "voided"
)

type UserSubscriptionSource string

const (
	UserSubscriptionSourcePurchase UserSubscriptionSource = "purchase"
	UserSubscriptionSourceAdmin    UserSubscriptionSource = "admin"
)

type UserSubscription struct {
	ID                  string                 `json:"id" gorm:"primaryKey"`
	UserID              string                 `json:"userId" gorm:"index"`
	PlanID              string                 `json:"planId" gorm:"index"`
	PlanTitle           string                 `json:"planTitle"`
	PriceCredits        int                    `json:"priceCredits"`
	UpgradeRole         string                 `json:"upgradeRole"`
	DowngradeRole       string                 `json:"downgradeRole"`
	QuotaCredits        int                    `json:"quotaCredits"`
	QuotaRemaining      int                    `json:"quotaRemaining"`
	ResetCycle          SubscriptionResetCycle `json:"resetCycle"`
	ResetCustomSeconds  int                    `json:"resetCustomSeconds"`
	AllowWalletFallback bool                   `json:"allowWalletFallback"`
	Source              UserSubscriptionSource `json:"source" gorm:"default:purchase"`
	Status              UserSubscriptionStatus `json:"status" gorm:"index"`
	StartsAt            string                 `json:"startsAt"`
	ExpiresAt           string                 `json:"expiresAt" gorm:"index"`
	LastResetAt         string                 `json:"lastResetAt"`
	NextResetAt         string                 `json:"nextResetAt" gorm:"index"`
	CreatedAt           string                 `json:"createdAt"`
	UpdatedAt           string                 `json:"updatedAt"`
}

type SubscriptionUsageLogType string

const (
	SubscriptionUsageConsume SubscriptionUsageLogType = "consume"
	SubscriptionUsageRefund  SubscriptionUsageLogType = "refund"
	SubscriptionUsageReset   SubscriptionUsageLogType = "reset"
)

type SubscriptionUsageLog struct {
	ID             string                   `json:"id" gorm:"primaryKey"`
	UserID         string                   `json:"userId" gorm:"index"`
	SubscriptionID string                   `json:"subscriptionId" gorm:"index"`
	Type           SubscriptionUsageLogType `json:"type" gorm:"index"`
	Amount         int                      `json:"amount"`
	Balance        int                      `json:"balance"`
	Model          string                   `json:"model"`
	Path           string                   `json:"path"`
	Remark         string                   `json:"remark"`
	CreatedAt      string                   `json:"createdAt"`
}

type CreditChargeStatus string

const (
	CreditChargePending  CreditChargeStatus = "pending"
	CreditChargeRefunded CreditChargeStatus = "refunded"
)

type CreditCharge struct {
	ID                  string             `json:"id" gorm:"primaryKey"`
	UserID              string             `json:"userId" gorm:"index"`
	SubscriptionID      string             `json:"subscriptionId" gorm:"index"`
	SubscriptionCredits int                `json:"subscriptionCredits"`
	WalletCredits       int                `json:"walletCredits"`
	TotalCredits        int                `json:"totalCredits"`
	Model               string             `json:"model"`
	Path                string             `json:"path"`
	Status              CreditChargeStatus `json:"status" gorm:"index"`
	CreatedAt           string             `json:"createdAt"`
	RefundedAt          string             `json:"refundedAt"`
}

type UserSubscriptionList struct {
	Items []UserSubscription `json:"items"`
	Total int                `json:"total"`
}

type SubscriptionSubscriber struct {
	SubscriptionID string                 `json:"subscriptionId"`
	UserID         string                 `json:"userId"`
	Username       string                 `json:"username"`
	DisplayName    string                 `json:"displayName"`
	QuotaCredits   int                    `json:"quotaCredits"`
	QuotaRemaining int                    `json:"quotaRemaining"`
	Status         UserSubscriptionStatus `json:"status"`
	StartsAt       string                 `json:"startsAt"`
	ExpiresAt      string                 `json:"expiresAt"`
}

type SubscriptionSubscriberList struct {
	Items []SubscriptionSubscriber `json:"items"`
	Total int                      `json:"total"`
}

type SubscriptionPurchaseResult struct {
	User         AuthUser         `json:"user"`
	Subscription UserSubscription `json:"subscription"`
}
