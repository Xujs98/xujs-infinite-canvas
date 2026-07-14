package model

// PromptPreset is a server-managed reusable prompt body for app-side local sync.
type PromptPreset struct {
	ID        string `json:"id" gorm:"primaryKey"`
	Name      string `json:"name"`
	Prompt    string `json:"prompt"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// PromptPresetList is a paginated prompt preset response.
type PromptPresetList struct {
	Items []PromptPreset `json:"items"`
	Total int            `json:"total"`
}
