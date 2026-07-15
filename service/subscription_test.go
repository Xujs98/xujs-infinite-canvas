package service

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestAddSubscriptionDuration(t *testing.T) {
	base := time.Date(2026, time.July, 15, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name          string
		unit          model.SubscriptionDurationUnit
		value         int
		customSeconds int
		want          time.Time
	}{
		{name: "hour", unit: model.SubscriptionDurationHour, value: 3, want: base.Add(3 * time.Hour)},
		{name: "custom seconds", unit: model.SubscriptionDurationCustom, customSeconds: 90, want: base.Add(90 * time.Second)},
		{name: "month", unit: model.SubscriptionDurationMonth, value: 1, want: base.AddDate(0, 1, 0)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := addSubscriptionDuration(base, test.unit, test.value, test.customSeconds)
			if !got.Equal(test.want) {
				t.Fatalf("got %s, want %s", got, test.want)
			}
		})
	}
}

func TestAddSubscriptionResetCycle(t *testing.T) {
	base := time.Date(2026, time.July, 15, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name          string
		cycle         model.SubscriptionResetCycle
		customSeconds int
		want          time.Time
	}{
		{name: "daily", cycle: model.SubscriptionResetDaily, want: base.AddDate(0, 0, 1)},
		{name: "weekly", cycle: model.SubscriptionResetWeekly, want: base.AddDate(0, 0, 7)},
		{name: "monthly", cycle: model.SubscriptionResetMonthly, want: base.AddDate(0, 1, 0)},
		{name: "custom seconds", cycle: model.SubscriptionResetCustom, customSeconds: 45, want: base.Add(45 * time.Second)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := addSubscriptionResetCycle(base, test.cycle, test.customSeconds)
			if !got.Equal(test.want) {
				t.Fatalf("got %s, want %s", got, test.want)
			}
		})
	}
}

func TestSplitSubscriptionCharge(t *testing.T) {
	tests := []struct {
		name        string
		required    int
		remaining   int
		allowWallet bool
		wantSub     int
		wantWallet  int
		wantError   bool
	}{
		{name: "subscription only", required: 80, remaining: 100, wantSub: 80},
		{name: "subscription and wallet", required: 120, remaining: 100, allowWallet: true, wantSub: 100, wantWallet: 20},
		{name: "wallet fallback disabled", required: 120, remaining: 100, wantError: true},
		{name: "empty subscription uses wallet", required: 30, remaining: 0, allowWallet: true, wantWallet: 30},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			subscriptionCredits, walletCredits, err := splitSubscriptionCharge(test.required, test.remaining, test.allowWallet)
			if (err != nil) != test.wantError {
				t.Fatalf("error = %v, wantError = %v", err, test.wantError)
			}
			if subscriptionCredits != test.wantSub || walletCredits != test.wantWallet {
				t.Fatalf("got subscription=%d wallet=%d, want subscription=%d wallet=%d", subscriptionCredits, walletCredits, test.wantSub, test.wantWallet)
			}
		})
	}
}

func TestUserSubscriptionKeepsPlanSnapshot(t *testing.T) {
	startsAt := time.Date(2026, time.July, 15, 10, 0, 0, 0, time.UTC)
	plan := model.SubscriptionPlan{
		ID: "plan-1", Title: "周卡", PriceCredits: 10, UpgradeRole: "member", DowngradeRole: "user",
		QuotaCredits: 100, ResetCycle: model.SubscriptionResetDaily, AllowWalletFallback: true,
	}
	subscription := newUserSubscriptionSnapshot("user-1", plan, model.UserSubscriptionSourcePurchase, startsAt, startsAt.AddDate(0, 0, 7))

	plan.Title = "已修改套餐"
	plan.QuotaCredits = 500
	plan.ResetCycle = model.SubscriptionResetMonthly
	plan.UpgradeRole = "vip"
	plan.AllowWalletFallback = false

	if subscription.PlanTitle != "周卡" || subscription.QuotaCredits != 100 || subscription.ResetCycle != model.SubscriptionResetDaily || subscription.UpgradeRole != "member" || !subscription.AllowWalletFallback {
		t.Fatalf("existing user subscription changed with plan update: %+v", subscription)
	}
}
