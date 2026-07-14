package model

type OfflineCreditItem struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Model     string `json:"model"`
	MediaType string `json:"mediaType"`
	Amount    int    `json:"amount"`
	CreatedAt string `json:"createdAt"`
}

type OfflineCreditsSyncRequest struct {
	ClientID string              `json:"clientId"`
	Items    []OfflineCreditItem `json:"items"`
}

type OfflineCreditsSyncResponse struct {
	Balance      int      `json:"balance"`
	Blocked      bool     `json:"blocked"`
	ProcessedIDs []string `json:"processedIds"`
}
