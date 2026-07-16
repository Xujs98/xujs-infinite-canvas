package handler

import (
	"reflect"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestTransformRequestFieldValueBuildsSimpleObject(t *testing.T) {
	value := []any{"data:image/png;base64,abc", "data:image/png;base64,def"}
	field := model.RequestField{
		DataType:  "object",
		ValuePath: "0",
		ObjectKey: "url",
	}

	got, ok := transformRequestFieldValue(value, field)
	if !ok {
		t.Fatal("expected mapping to succeed")
	}
	want := map[string]any{"url": "data:image/png;base64,abc"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected mapped value: %#v", got)
	}
}

func TestTransformRequestFieldValueUsesNestedJSONTemplate(t *testing.T) {
	value := map[string]any{
		"items": []any{map[string]any{"dataUrl": "data:image/png;base64,abc"}},
	}
	field := model.RequestField{
		DataType:     "object",
		ValuePath:    "items.0.dataUrl",
		JSONTemplate: `{"source":{"url":"@data","kind":"reference"},"enabled":true}`,
	}

	got, ok := transformRequestFieldValue(value, field)
	if !ok {
		t.Fatal("expected mapping to succeed")
	}
	want := map[string]any{
		"source": map[string]any{
			"url":  "data:image/png;base64,abc",
			"kind": "reference",
		},
		"enabled": true,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected mapped value: %#v", got)
	}
}

func TestTransformRequestFieldValuePreservesRawTypes(t *testing.T) {
	value := []any{map[string]any{"url": "https://example.com/a.png"}}
	field := model.RequestField{
		DataType:     "object",
		ValuePath:    "0",
		JSONTemplate: `{"image":"@data","count":1}`,
	}

	got, ok := transformRequestFieldValue(value, field)
	if !ok {
		t.Fatal("expected mapping to succeed")
	}
	want := map[string]any{
		"image": map[string]any{"url": "https://example.com/a.png"},
		"count": float64(1),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected mapped value: %#v", got)
	}
}

func TestTransformRequestFieldValueRejectsMissingPath(t *testing.T) {
	_, ok := transformRequestFieldValue([]any{"first"}, model.RequestField{ValuePath: "1"})
	if ok {
		t.Fatal("expected out-of-range value path to fail")
	}
}
