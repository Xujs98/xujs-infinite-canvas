package service

import (
	"sort"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/repository"
)

type AdminAnalyticsResult struct {
	Range     string         `json:"range"`
	StartAt   string         `json:"startAt"`
	EndAt     string         `json:"endAt"`
	Generated string         `json:"generatedAt"`
	Model     ModelAnalytics `json:"model"`
	Users     UserAnalytics  `json:"users"`
}

type ModelAnalytics struct {
	Summary ModelAnalyticsSummary `json:"summary"`
	Trend   []AnalyticsTrendPoint `json:"trend"`
	Models  []ModelAnalyticsRank  `json:"models"`
}

type ModelAnalyticsSummary struct {
	TotalCalls      int     `json:"totalCalls"`
	SuccessCalls    int     `json:"successCalls"`
	FailedCalls     int     `json:"failedCalls"`
	SuccessRate     float64 `json:"successRate"`
	ActiveModels    int     `json:"activeModels"`
	ConsumedCredits int     `json:"consumedCredits"`
}

type AnalyticsTrendPoint struct {
	At              string         `json:"at"`
	Label           string         `json:"label"`
	TotalCalls      int            `json:"totalCalls"`
	SuccessCalls    int            `json:"successCalls"`
	FailedCalls     int            `json:"failedCalls"`
	ModelCalls      map[string]int `json:"modelCalls"`
	ActiveUsers     int            `json:"activeUsers"`
	NewUsers        int            `json:"newUsers"`
	ConsumedCredits int            `json:"consumedCredits"`
}

type ModelAnalyticsRank struct {
	Model       string  `json:"model"`
	Calls       int     `json:"calls"`
	Success     int     `json:"success"`
	Failed      int     `json:"failed"`
	SuccessRate float64 `json:"successRate"`
	Share       float64 `json:"share"`
}

type UserAnalytics struct {
	Summary UserAnalyticsSummary  `json:"summary"`
	Trend   []AnalyticsTrendPoint `json:"trend"`
	Ranking []UserAnalyticsRank   `json:"ranking"`
}

type UserAnalyticsSummary struct {
	TotalUsers      int `json:"totalUsers"`
	NewUsers        int `json:"newUsers"`
	ActiveUsers     int `json:"activeUsers"`
	ConsumingUsers  int `json:"consumingUsers"`
	ConsumedCredits int `json:"consumedCredits"`
}

type UserAnalyticsRank struct {
	UserID          string  `json:"userId"`
	Username        string  `json:"username"`
	DisplayName     string  `json:"displayName"`
	Calls           int     `json:"calls"`
	SuccessCalls    int     `json:"successCalls"`
	SuccessRate     float64 `json:"successRate"`
	ConsumedCredits int     `json:"consumedCredits"`
	LastActiveAt    string  `json:"lastActiveAt"`
}

type analyticsWindow struct {
	Key    string
	Start  time.Time
	End    time.Time
	Count  int
	Hourly bool
}

type modelRankAccumulator struct {
	Calls   int
	Success int
}

type userRankAccumulator struct {
	UserID          string
	Username        string
	DisplayName     string
	Calls           int
	SuccessCalls    int
	ConsumedCredits int
	LastActiveAt    time.Time
}

type analyticsBucket struct {
	models      map[string]int
	activeUsers map[string]struct{}
}

func AdminAnalytics(rangeKey string) (AdminAnalyticsResult, error) {
	window := newAnalyticsWindow(rangeKey, time.Now())
	calls, err := repository.ListAnalyticsCalls(window.Start)
	if err != nil {
		return AdminAnalyticsResult{}, err
	}
	users, err := repository.ListAnalyticsUsers()
	if err != nil {
		return AdminAnalyticsResult{}, err
	}
	walletUsage, err := repository.ListAnalyticsWalletUsage(window.Start)
	if err != nil {
		return AdminAnalyticsResult{}, err
	}
	subscriptionUsage, err := repository.ListAnalyticsSubscriptionUsage(window.Start)
	if err != nil {
		return AdminAnalyticsResult{}, err
	}
	usage := append(walletUsage, subscriptionUsage...)
	return buildAnalyticsResult(window, calls, users, usage), nil
}

func newAnalyticsWindow(rangeKey string, now time.Time) analyticsWindow {
	rangeKey = strings.ToLower(strings.TrimSpace(rangeKey))
	days := 7
	switch rangeKey {
	case "1d":
		days = 1
	case "14d":
		days = 14
	case "30d":
		days = 30
	case "7d":
	default:
		rangeKey = "7d"
	}
	if days == 1 {
		endHour := now.Truncate(time.Hour)
		return analyticsWindow{Key: rangeKey, Start: endHour.Add(-23 * time.Hour), End: now, Count: 24, Hourly: true}
	}
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return analyticsWindow{Key: rangeKey, Start: day.AddDate(0, 0, -(days - 1)), End: now, Count: days}
}

func buildAnalyticsResult(window analyticsWindow, calls []repository.AnalyticsCallRecord, users []repository.AnalyticsUserRecord, usage []repository.AnalyticsUsageRecord) AdminAnalyticsResult {
	trend := make([]AnalyticsTrendPoint, window.Count)
	buckets := make([]analyticsBucket, window.Count)
	for index := range trend {
		at := window.bucketTime(index)
		label := at.Format("01-02")
		if window.Hourly {
			label = at.Format("15:04")
		}
		trend[index] = AnalyticsTrendPoint{At: at.Format(time.RFC3339), Label: label, ModelCalls: map[string]int{}}
		buckets[index] = analyticsBucket{models: map[string]int{}, activeUsers: map[string]struct{}{}}
	}

	modelRanks := map[string]*modelRankAccumulator{}
	userRanks := map[string]*userRankAccumulator{}
	activeUsers := map[string]struct{}{}
	consumingUsers := map[string]struct{}{}
	userNames := map[string]repository.AnalyticsUserRecord{}
	for _, user := range users {
		userNames[user.ID] = user
	}

	for _, call := range calls {
		index := window.bucketIndex(call.CreatedAt)
		if index < 0 {
			continue
		}
		modelName := strings.TrimSpace(call.Model)
		if modelName == "" || modelName == "app-error" {
			continue
		}
		trend[index].TotalCalls++
		buckets[index].models[modelName]++
		if call.Success {
			trend[index].SuccessCalls++
		} else {
			trend[index].FailedCalls++
		}
		modelRank := modelRanks[modelName]
		if modelRank == nil {
			modelRank = &modelRankAccumulator{}
			modelRanks[modelName] = modelRank
		}
		modelRank.Calls++
		if call.Success {
			modelRank.Success++
		}

		userID := strings.TrimSpace(call.UserID)
		if userID == "" {
			continue
		}
		activeUsers[userID] = struct{}{}
		buckets[index].activeUsers[userID] = struct{}{}
		userRank := ensureUserRank(userRanks, userNames, userID, call.Username)
		userRank.Calls++
		if call.Success {
			userRank.SuccessCalls++
		}
		if call.CreatedAt.After(userRank.LastActiveAt) {
			userRank.LastActiveAt = call.CreatedAt
		}
	}

	newUsers := 0
	for _, user := range users {
		createdAt, ok := parseAnalyticsTime(user.CreatedAt, window.Start.Location())
		if !ok {
			continue
		}
		if index := window.bucketIndex(createdAt); index >= 0 {
			trend[index].NewUsers++
			newUsers++
		}
	}

	totalConsumed := 0
	for _, record := range usage {
		consumed := -record.Amount
		if consumed <= 0 {
			continue
		}
		createdAt, ok := parseAnalyticsTime(record.CreatedAt, window.Start.Location())
		if !ok {
			continue
		}
		index := window.bucketIndex(createdAt)
		if index < 0 {
			continue
		}
		trend[index].ConsumedCredits += consumed
		totalConsumed += consumed
		userID := strings.TrimSpace(record.UserID)
		if userID != "" {
			consumingUsers[userID] = struct{}{}
			ensureUserRank(userRanks, userNames, userID, "").ConsumedCredits += consumed
		}
	}

	totalCalls, successCalls := 0, 0
	for index := range trend {
		trend[index].ActiveUsers = len(buckets[index].activeUsers)
		totalCalls += trend[index].TotalCalls
		successCalls += trend[index].SuccessCalls
	}
	models := buildModelRanks(modelRanks, totalCalls)
	topModels := map[string]struct{}{}
	for index := 0; index < len(models) && index < 5; index++ {
		topModels[models[index].Model] = struct{}{}
	}
	for index := range trend {
		for modelName, count := range buckets[index].models {
			if _, ok := topModels[modelName]; ok {
				trend[index].ModelCalls[modelName] += count
			} else {
				trend[index].ModelCalls["其他"] += count
			}
		}
	}

	return AdminAnalyticsResult{
		Range: window.Key, StartAt: window.Start.Format(time.RFC3339), EndAt: window.End.Format(time.RFC3339), Generated: time.Now().Format(time.RFC3339),
		Model: ModelAnalytics{
			Summary: ModelAnalyticsSummary{TotalCalls: totalCalls, SuccessCalls: successCalls, FailedCalls: totalCalls - successCalls, SuccessRate: percent(successCalls, totalCalls), ActiveModels: len(modelRanks), ConsumedCredits: totalConsumed},
			Trend:   trend,
			Models:  models,
		},
		Users: UserAnalytics{
			Summary: UserAnalyticsSummary{TotalUsers: len(users), NewUsers: newUsers, ActiveUsers: len(activeUsers), ConsumingUsers: len(consumingUsers), ConsumedCredits: totalConsumed},
			Trend:   trend,
			Ranking: buildUserRanks(userRanks),
		},
	}
}

func ensureUserRank(ranks map[string]*userRankAccumulator, users map[string]repository.AnalyticsUserRecord, userID, fallbackUsername string) *userRankAccumulator {
	if rank := ranks[userID]; rank != nil {
		return rank
	}
	user := users[userID]
	username := strings.TrimSpace(user.Username)
	if username == "" {
		username = strings.TrimSpace(fallbackUsername)
	}
	if username == "" {
		username = userID
	}
	rank := &userRankAccumulator{UserID: userID, Username: username, DisplayName: strings.TrimSpace(user.DisplayName)}
	ranks[userID] = rank
	return rank
}

func buildModelRanks(values map[string]*modelRankAccumulator, totalCalls int) []ModelAnalyticsRank {
	result := make([]ModelAnalyticsRank, 0, len(values))
	for name, value := range values {
		result = append(result, ModelAnalyticsRank{Model: name, Calls: value.Calls, Success: value.Success, Failed: value.Calls - value.Success, SuccessRate: percent(value.Success, value.Calls), Share: percent(value.Calls, totalCalls)})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Calls == result[j].Calls {
			return result[i].Model < result[j].Model
		}
		return result[i].Calls > result[j].Calls
	})
	return result
}

func buildUserRanks(values map[string]*userRankAccumulator) []UserAnalyticsRank {
	result := make([]UserAnalyticsRank, 0, len(values))
	for _, value := range values {
		lastActiveAt := ""
		if !value.LastActiveAt.IsZero() {
			lastActiveAt = value.LastActiveAt.Format(time.RFC3339)
		}
		result = append(result, UserAnalyticsRank{UserID: value.UserID, Username: value.Username, DisplayName: value.DisplayName, Calls: value.Calls, SuccessCalls: value.SuccessCalls, SuccessRate: percent(value.SuccessCalls, value.Calls), ConsumedCredits: value.ConsumedCredits, LastActiveAt: lastActiveAt})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ConsumedCredits != result[j].ConsumedCredits {
			return result[i].ConsumedCredits > result[j].ConsumedCredits
		}
		if result[i].Calls != result[j].Calls {
			return result[i].Calls > result[j].Calls
		}
		return result[i].Username < result[j].Username
	})
	if len(result) > 10 {
		result = result[:10]
	}
	return result
}

func (window analyticsWindow) bucketTime(index int) time.Time {
	if window.Hourly {
		return window.Start.Add(time.Duration(index) * time.Hour)
	}
	return window.Start.AddDate(0, 0, index)
}

func (window analyticsWindow) bucketIndex(value time.Time) int {
	value = value.In(window.Start.Location())
	if value.Before(window.Start) || value.After(window.End) {
		return -1
	}
	if window.Hourly {
		index := int(value.Sub(window.Start) / time.Hour)
		if index >= 0 && index < window.Count {
			return index
		}
		return -1
	}
	day := time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
	index := int(day.Sub(window.Start).Hours() / 24)
	if index >= 0 && index < window.Count {
		return index
	}
	return -1
}

func parseAnalyticsTime(value string, location *time.Location) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999-07:00", "2006-01-02 15:04:05-07:00", "2006-01-02 15:04:05"} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed.In(location), true
		}
	}
	return time.Time{}, false
}

func percent(part, total int) float64 {
	if total <= 0 {
		return 0
	}
	return float64(int((float64(part)/float64(total)*100)*100+0.5)) / 100
}
