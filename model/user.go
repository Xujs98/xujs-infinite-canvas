package model

type UserRole string

const (
	UserRoleGuest  UserRole = "guest"
	UserRoleUser   UserRole = "user"
	UserRoleMember UserRole = "member"
	UserRoleAdmin  UserRole = "admin"
)

type UserStatus string

const (
	UserStatusActive UserStatus = "active"
	UserStatusBan    UserStatus = "ban"
)

// User 系统用户。
type User struct {
	ID                  string     `json:"id" gorm:"primaryKey"`
	Username            string     `json:"username" gorm:"uniqueIndex"`
	Password            string     `json:"password,omitempty"`
	Email               string     `json:"email"`
	DisplayName         string     `json:"displayName"`
	AvatarURL           string     `json:"avatarUrl"`
	Role                UserRole   `json:"role"`
	Credits             int        `json:"credits"`
	AffCode             string     `json:"affCode" gorm:"uniqueIndex"`
	AffCount            int        `json:"affCount"`
	InviterID           string     `json:"inviterId"`
	GithubID            string     `json:"githubId"`
	LinuxDoID           string     `json:"linuxDoId" gorm:"index"`
	WechatID            string     `json:"wechatId"`
	Status              UserStatus `json:"status"`
	MembershipExpiresAt string     `json:"membershipExpiresAt"`
	LastLoginAt         string     `json:"lastLoginAt"`
	Extra               string     `json:"extra" gorm:"type:text"`
	CreatedAt           string     `json:"createdAt"`
	UpdatedAt           string     `json:"updatedAt"`
	Online              bool       `json:"online" gorm:"-"`
	OnlineApp           bool       `json:"onlineApp" gorm:"-"`
	OnlineWeb           bool       `json:"onlineWeb" gorm:"-"`
}

// UserList 用户分页结果。
type UserList struct {
	Items []User `json:"items"`
	Total int    `json:"total"`
}

type AdminUserDetail struct {
	User                 User              `json:"user"`
	SubscriptionUsed     int               `json:"subscriptionUsed"`
	TotalConsumedCredits int               `json:"totalConsumedCredits"`
	ActiveSubscription   *UserSubscription `json:"activeSubscription"`
}

// AuthUser 用户公开信息。
type AuthUser struct {
	ID                              string   `json:"id"`
	Username                        string   `json:"username"`
	Email                           string   `json:"email"`
	DisplayName                     string   `json:"displayName"`
	AvatarURL                       string   `json:"avatarUrl"`
	Role                            UserRole `json:"role"`
	Credits                         int      `json:"credits"`
	SubscriptionCredits             int      `json:"subscriptionCredits"`
	HasActiveSubscription           bool     `json:"hasActiveSubscription"`
	SubscriptionAllowWalletFallback bool     `json:"subscriptionAllowWalletFallback"`
	AffCode                         string   `json:"affCode"`
	AffCount                        int      `json:"affCount"`
	InviterID                       string   `json:"inviterId"`
	MembershipExpiresAt             string   `json:"membershipExpiresAt"`
	EnableTasks                     bool     `json:"enableTasks"`
	LastLoginAt                     string   `json:"lastLoginAt"`
	CreatedAt                       string   `json:"createdAt"`
	UpdatedAt                       string   `json:"updatedAt"`
}

// AuthSession 登录会话信息。
type AuthSession struct {
	Token string   `json:"token"`
	User  AuthUser `json:"user"`
}

func PublicUser(user User) AuthUser {
	return AuthUser{
		ID:                  user.ID,
		Username:            user.Username,
		Email:               user.Email,
		DisplayName:         user.DisplayName,
		AvatarURL:           user.AvatarURL,
		Role:                user.Role,
		Credits:             user.Credits,
		AffCode:             user.AffCode,
		AffCount:            user.AffCount,
		InviterID:           user.InviterID,
		MembershipExpiresAt: user.MembershipExpiresAt,
		LastLoginAt:         user.LastLoginAt,
		CreatedAt:           user.CreatedAt,
		UpdatedAt:           user.UpdatedAt,
	}
}

type CreditLogType string

const (
	CreditLogTypeAdminAdjust    CreditLogType = "admin_adjust"
	CreditLogTypeAIConsume      CreditLogType = "ai_consume"
	CreditLogTypeAIRefund       CreditLogType = "ai_refund"
	CreditLogTypeOfflineConsume CreditLogType = "offline_consume"
	CreditLogTypeOfflineRefund  CreditLogType = "offline_refund"
	CreditLogTypeRedeem         CreditLogType = "redeem"
	CreditLogTypeMembershipFree CreditLogType = "membership_free"
	CreditLogTypeRoleFree       CreditLogType = "role_free"
	CreditLogTypeInviteReward   CreditLogType = "invite_reward"
	CreditLogTypeCheckIn        CreditLogType = "check_in"
	CreditLogTypeSubscription   CreditLogType = "subscription_purchase"
)

// CreditLog 用户算力点变更流水。
type CreditLog struct {
	ID        string        `json:"id" gorm:"primaryKey"`
	UserID    string        `json:"userId" gorm:"index"`
	Username  string        `json:"username" gorm:"-"`
	Type      CreditLogType `json:"type"`
	Amount    int           `json:"amount"`
	Balance   int           `json:"balance"`
	RelatedID string        `json:"relatedId"`
	Remark    string        `json:"remark"`
	Extra     string        `json:"extra" gorm:"type:text"`
	CreatedAt string        `json:"createdAt"`
}

type CreditLogList struct {
	Items []CreditLog `json:"items"`
	Total int         `json:"total"`
}
