package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// ListAITextAgents returns server-managed AI text agents for app sync.
func ListAITextAgents(q model.Query) (model.AITextAgentList, error) {
	items, total, err := repository.ListAITextAgents(q)
	if err != nil {
		return model.AITextAgentList{}, err
	}
	items = normalizeAITextAgentJSONFields(items)
	return model.AITextAgentList{Items: items, Total: int(total)}, nil
}

// SaveAITextAgent validates and saves a server-managed AI text agent.
func SaveAITextAgent(item model.AITextAgent) (model.AITextAgent, error) {
	item.Name = strings.TrimSpace(item.Name)
	item.Prompt = strings.TrimSpace(item.Prompt)
	item.DefaultModel = strings.TrimSpace(item.DefaultModel)
	item.InputSources = strings.TrimSpace(item.InputSources)
	item.JSONExample = strings.TrimSpace(item.JSONExample)
	item.JSONFields = strings.TrimSpace(item.JSONFields)
	if item.Name == "" {
		return model.AITextAgent{}, errors.New("Agent 名称不能为空")
	}
	if item.Prompt == "" {
		return model.AITextAgent{}, errors.New("提示词不能为空")
	}
	if item.InputSources == "" {
		item.InputSources = "[]"
	}
	if item.JSONFields == "" {
		item.JSONFields = "[]"
	}
	item.JSONFields = normalizeJSONFieldPathList(item.JSONFields)
	if err := validateJSONArray(item.InputSources, "输入来源配置"); err != nil {
		return model.AITextAgent{}, err
	}
	if err := validateJSONArray(item.JSONFields, "展示字段配置"); err != nil {
		return model.AITextAgent{}, err
	}
	if item.JSONExample != "" && !json.Valid([]byte(item.JSONExample)) {
		return model.AITextAgent{}, errors.New("JSON 示例不是有效 JSON")
	}
	now := time.Now().Format(time.RFC3339)
	if item.ID == "" {
		item.ID = newID("text-agent")
		item.CreatedAt = now
	}
	if item.CreatedAt == "" {
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	return repository.SaveAITextAgent(item)
}

func DeleteAITextAgent(id string) error {
	return repository.DeleteAITextAgent(id)
}

func DeleteAITextAgents(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return repository.DeleteAITextAgents(ids)
}

func validateJSONArray(value string, label string) error {
	var parsed []any
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		return errors.New(label + "必须是 JSON 数组")
	}
	return nil
}

var jsonArrayIndexPattern = regexp.MustCompile(`\[(0|\*)\]`)

func normalizeJSONFieldPath(path string) string {
	return jsonArrayIndexPattern.ReplaceAllString(path, "")
}

func normalizeJSONFieldPathList(value string) string {
	var fields []map[string]any
	if err := json.Unmarshal([]byte(value), &fields); err != nil {
		return value
	}
	for index := range fields {
		if path, ok := fields[index]["path"].(string); ok {
			fields[index]["path"] = normalizeJSONFieldPath(path)
		}
	}
	data, err := json.MarshalIndent(fields, "", "  ")
	if err != nil {
		return value
	}
	return string(data)
}

func normalizeAITextAgentJSONFields(items []model.AITextAgent) []model.AITextAgent {
	for index := range items {
		if strings.TrimSpace(items[index].JSONFields) != "" {
			items[index].JSONFields = normalizeJSONFieldPathList(items[index].JSONFields)
		}
	}
	return items
}
