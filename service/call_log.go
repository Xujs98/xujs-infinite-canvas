package service

import (
	"log"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/google/uuid"
)

func LogCall(userID, username, model_, path string, success bool, errorMsg string, credits int) {
	callLog := &model.CallLog{
		ID:       uuid.NewString(),
		UserID:   userID,
		Username: username,
		Model:    model_,
		Path:     path,
		Success:  success,
		ErrorMsg: errorMsg,
		Credits:  credits,
	}
	if err := repository.CreateCallLog(callLog); err != nil {
		log.Printf("LogCall write failed: model=%s user=%s err=%v", model_, username, err)
	}
}

func ListCallLogs(q model.Query, status string) (model.CallLogList, error) {
	return repository.ListCallLogs(q, status)
}

func BatchDeleteCallLogs(ids []string) error {
	return repository.BatchDeleteCallLogs(ids)
}

func ClearCallLogs() (int64, error) {
	return repository.ClearCallLogs()
}
