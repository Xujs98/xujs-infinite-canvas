package handler

import "testing"

func TestAIResponseIndicatesFailure(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		failed bool
	}{
		{name: "openai success", body: `{"data":[{"url":"https://example.test/image.png"}]}`, failed: false},
		{name: "async pending", body: `{"code":0,"data":{"id":"task-1","status":"pending"}}`, failed: false},
		{name: "error object", body: `{"error":{"code":"invalid_request","message":"bad input"}}`, failed: true},
		{name: "nonzero code", body: `{"code":"invalid_json","message":"bad json"}`, failed: true},
		{name: "failed status", body: `{"data":{"status":"failed"},"message":"generation failed"}`, failed: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			failed, _ := aiResponseIndicatesFailure([]byte(test.body))
			if failed != test.failed {
				t.Fatalf("failed = %v, want %v", failed, test.failed)
			}
		})
	}
}
