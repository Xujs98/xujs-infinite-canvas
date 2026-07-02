package service

import (
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/google/uuid"
)

type GenerationTaskCreate struct {
	UpstreamTaskID string
	Type           model.GenerationTaskType
	UserID         string
	Username       string
	Model          string
	Path           string
	CanvasID       string
	NodeID         string
}

type GenerationTaskUpdate struct {
	Status         model.GenerationTaskStatus
	Progress       *int
	UpstreamTaskID string
	ResultURL      string
	ResultImages   []string
	ErrorMsg       string
}

var generationTasks = struct {
	sync.RWMutex
	items map[string]model.GenerationTask
}{
	items: make(map[string]model.GenerationTask),
}

func CreateGenerationTask(input GenerationTaskCreate) model.GenerationTask {
	now := time.Now()
	task := model.GenerationTask{
		ID:             uuid.NewString(),
		UpstreamTaskID: input.UpstreamTaskID,
		Type:           input.Type,
		Status:         model.GenerationTaskStatusRunning,
		UserID:         input.UserID,
		Username:       input.Username,
		Model:          input.Model,
		Path:           input.Path,
		CanvasID:       input.CanvasID,
		NodeID:         input.NodeID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	generationTasks.Lock()
	generationTasks.items[task.ID] = task
	generationTasks.Unlock()
	return task
}

func UpdateGenerationTask(id string, update GenerationTaskUpdate) (model.GenerationTask, bool) {
	generationTasks.Lock()
	defer generationTasks.Unlock()
	task, ok := generationTasks.items[id]
	if !ok {
		return model.GenerationTask{}, false
	}
	if update.UpstreamTaskID != "" {
		task.UpstreamTaskID = update.UpstreamTaskID
	}
	if update.Status != "" {
		task.Status = update.Status
	}
	if update.Progress != nil {
		task.Progress = *update.Progress
	}
	if update.ResultURL != "" {
		task.ResultURL = update.ResultURL
	}
	if update.ResultImages != nil {
		task.ResultImages = update.ResultImages
	}
	if update.ErrorMsg != "" {
		task.ErrorMsg = update.ErrorMsg
	}
	task.UpdatedAt = time.Now()
	if task.Status == model.GenerationTaskStatusSucceeded || task.Status == model.GenerationTaskStatusFailed {
		completedAt := task.UpdatedAt
		task.CompletedAt = &completedAt
	}
	generationTasks.items[id] = task
	return task, true
}

func UpdateGenerationTaskByUpstreamID(upstreamTaskID string, update GenerationTaskUpdate) (model.GenerationTask, bool) {
	if upstreamTaskID == "" {
		return model.GenerationTask{}, false
	}
	generationTasks.RLock()
	var id string
	for _, task := range generationTasks.items {
		if task.UpstreamTaskID == upstreamTaskID {
			id = task.ID
			break
		}
	}
	generationTasks.RUnlock()
	if id == "" {
		return model.GenerationTask{}, false
	}
	return UpdateGenerationTask(id, update)
}

func UpdateGenerationTaskByIDOrUpstreamID(taskID string, update GenerationTaskUpdate) (model.GenerationTask, bool) {
	if taskID == "" {
		return model.GenerationTask{}, false
	}
	if task, ok := UpdateGenerationTask(taskID, update); ok {
		return task, true
	}
	return UpdateGenerationTaskByUpstreamID(taskID, update)
}

func GetGenerationTask(id string) (model.GenerationTask, bool) {
	generationTasks.RLock()
	defer generationTasks.RUnlock()
	if task, ok := generationTasks.items[id]; ok {
		return task, true
	}
	for _, task := range generationTasks.items {
		if task.UpstreamTaskID == id {
			return task, true
		}
	}
	return model.GenerationTask{}, false
}

func GetUserGenerationTask(userID, id string) (model.GenerationTask, bool) {
	task, ok := GetGenerationTask(id)
	if !ok || task.UserID != userID {
		return model.GenerationTask{}, false
	}
	return task, true
}

func ListGenerationTasks(q model.Query) model.GenerationTaskList {
	q.Normalize()
	generationTasks.RLock()
	all := make([]model.GenerationTask, 0, len(generationTasks.items))
	for _, task := range generationTasks.items {
		if q.Type != "" && string(task.Type) != q.Type {
			continue
		}
		if q.Status != "" && string(task.Status) != q.Status {
			continue
		}
		if q.Keyword != "" {
			keyword := strings.ToLower(q.Keyword)
			text := strings.ToLower(task.Username + " " + task.UserID + " " + task.Model + " " + task.UpstreamTaskID + " " + task.CanvasID + " " + task.NodeID + " " + task.ErrorMsg)
			if !strings.Contains(text, keyword) {
				continue
			}
		}
		all = append(all, task)
	}
	generationTasks.RUnlock()

	sortGenerationTasks(all)
	total := len(all)
	start := q.Offset()
	if start > total {
		start = total
	}
	end := start + q.PageSize
	if end > total {
		end = total
	}
	return model.GenerationTaskList{Items: all[start:end], Total: total}
}

func sortGenerationTasks(items []model.GenerationTask) {
	for i := 1; i < len(items); i++ {
		item := items[i]
		j := i - 1
		for j >= 0 && items[j].UpdatedAt.Before(item.UpdatedAt) {
			items[j+1] = items[j]
			j--
		}
		items[j+1] = item
	}
}
