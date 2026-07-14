package model

// AITextAgent is a server-managed AI text agent template for app-side local sync.
type AITextAgent struct {
	ID           string `json:"id" gorm:"primaryKey"`
	Name         string `json:"name"`
	Enabled      bool   `json:"enabled"`
	Prompt       string `json:"prompt"`
	DefaultModel string `json:"defaultModel"`
	InputSources string `json:"inputSources" gorm:"type:text"`
	JSONExample  string `json:"jsonExample" gorm:"type:text"`
	JSONFields   string `json:"jsonFields" gorm:"type:text"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// AITextAgentList is a paginated AI text agent response.
type AITextAgentList struct {
	Items []AITextAgent `json:"items"`
	Total int           `json:"total"`
}
