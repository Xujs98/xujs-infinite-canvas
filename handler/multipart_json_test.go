package handler

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"reflect"
	"testing"
)

func buildMultipartJSONTestBody(t *testing.T, fields map[string]string) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatalf("write multipart field %q: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return body.Bytes(), writer.FormDataContentType()
}

func decodeMultipartJSONTestResult(t *testing.T, body []byte, contentType string) map[string]any {
	t.Helper()
	converted, err := multipartToJSON(body, contentType, nil)
	if err != nil {
		t.Fatalf("convert multipart request: %v", err)
	}
	var result map[string]any
	if err := json.Unmarshal(converted, &result); err != nil {
		t.Fatalf("decode converted JSON: %v", err)
	}
	return result
}

func TestMultipartToJSONConvertsStandardImageCountToNumber(t *testing.T) {
	body, contentType := buildMultipartJSONTestBody(t, map[string]string{
		"model":  "gpt-image-2",
		"prompt": "edit this image",
		"n":      "1",
		"async":  "true",
	})
	result := decodeMultipartJSONTestResult(t, body, contentType)

	if got := result["n"]; got != float64(1) {
		t.Fatalf("n = %#v (%T), want numeric 1", got, got)
	}
	if got := result["model"]; got != "gpt-image-2" {
		t.Fatalf("model = %#v, want unchanged string", got)
	}
	if got := result["async"]; got != true {
		t.Fatalf("async = %#v (%T), want boolean true", got, got)
	}
}

func TestMultipartToJSONUsesExplicitFieldTypes(t *testing.T) {
	body, contentType := buildMultipartJSONTestBody(t, map[string]string{
		"seed":                       "42",
		"guidance":                   "7.5",
		"watermark":                  "false",
		"options":                    `{"mode":"edit"}`,
		"references":                 `["a","b"]`,
		multipartJSONFieldTypesField: `{"seed":"integer","guidance":"number","watermark":"boolean","options":"object","references":"array"}`,
	})
	result := decodeMultipartJSONTestResult(t, body, contentType)

	want := map[string]any{
		"seed":       float64(42),
		"guidance":   7.5,
		"watermark":  false,
		"options":    map[string]any{"mode": "edit"},
		"references": []any{"a", "b"},
	}
	if !reflect.DeepEqual(result, want) {
		t.Fatalf("converted fields = %#v, want %#v", result, want)
	}
	if _, exists := result[multipartJSONFieldTypesField]; exists {
		t.Fatal("internal type metadata must not be forwarded upstream")
	}
}

func TestNormalizeStandardAIRequestTypesHandlesJSONClients(t *testing.T) {
	converted := normalizeStandardAIRequestTypes([]byte(`{"model":"gpt-image-2","n":"1","async":"true","size":"2048x2048"}`))
	var result map[string]any
	if err := json.Unmarshal(converted, &result); err != nil {
		t.Fatalf("decode normalized JSON: %v", err)
	}
	want := map[string]any{
		"model": "gpt-image-2",
		"n":     float64(1),
		"async": true,
		"size":  "2048x2048",
	}
	if !reflect.DeepEqual(result, want) {
		t.Fatalf("normalized request = %#v, want %#v", result, want)
	}
}
