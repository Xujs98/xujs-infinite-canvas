package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/ws"
)

type AdminDashboardStats struct {
	OnlineUsers       int `json:"onlineUsers"`
	OnlineAppUsers    int `json:"onlineAppUsers"`
	OnlineWebUsers    int `json:"onlineWebUsers"`
	OnlineConnections int `json:"onlineConnections"`
	TotalUsers        int `json:"totalUsers"`
	ModelCount        int `json:"modelCount"`
}

func DashboardStats() (AdminDashboardStats, error) {
	totalUsers, err := repository.CountUsers()
	if err != nil {
		return AdminDashboardStats{}, err
	}
	modelCount, err := enabledModelCount()
	if err != nil {
		return AdminDashboardStats{}, err
	}
	online := ws.DefaultHub.OnlineStats()
	return AdminDashboardStats{
		OnlineUsers:       online.Users,
		OnlineAppUsers:    online.App,
		OnlineWebUsers:    online.Web,
		OnlineConnections: online.Total,
		TotalUsers:        int(totalUsers),
		ModelCount:        modelCount,
	}, nil
}

func enabledModelCount() (int, error) {
	settings, err := AdminSettings()
	if err != nil {
		return 0, err
	}
	seen := map[string]bool{}
	for _, channel := range settings.Private.Channels {
		if !channel.Enabled {
			continue
		}
		for _, name := range channel.Models {
			name = strings.TrimSpace(name)
			if name != "" {
				seen[name] = true
			}
		}
	}
	return len(seen), nil
}
