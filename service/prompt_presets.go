package service

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// ListPromptPresets returns server-managed prompt presets for app sync.
func ListPromptPresets(q model.Query) (model.PromptPresetList, error) {
	items, total, err := repository.ListPromptPresets(q)
	if err != nil {
		return model.PromptPresetList{}, err
	}
	return model.PromptPresetList{Items: items, Total: int(total)}, nil
}

// SavePromptPreset validates and saves a server-managed prompt preset.
func SavePromptPreset(item model.PromptPreset) (model.PromptPreset, error) {
	item.Name = strings.TrimSpace(item.Name)
	item.Prompt = strings.TrimSpace(item.Prompt)
	if item.Name == "" {
		return model.PromptPreset{}, errors.New("预设名称不能为空")
	}
	if item.Prompt == "" {
		return model.PromptPreset{}, errors.New("提示词正文不能为空")
	}
	now := time.Now().Format(time.RFC3339)
	if item.ID == "" {
		item.ID = newID("preset")
		item.CreatedAt = now
	}
	if item.CreatedAt == "" {
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	return repository.SavePromptPreset(item)
}

func DeletePromptPreset(id string) error {
	return repository.DeletePromptPreset(id)
}

func DeletePromptPresets(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return repository.DeletePromptPresets(ids)
}
