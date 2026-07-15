package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestAdminTaskVisibilityRequiresPersistence(t *testing.T) {
	if isAdminVisibleGenerationTask(model.GenerationTask{Persistent: false}) {
		t.Fatal("temporary in-memory task must not be visible in admin task management")
	}
	if !isAdminVisibleGenerationTask(model.GenerationTask{Persistent: true}) {
		t.Fatal("persistent task must be visible in admin task management")
	}
}

func TestUserTaskVisibilityRequiresRolePermissionForPersistentTasks(t *testing.T) {
	temporary := model.GenerationTask{Persistent: false}
	if !isUserVisibleGenerationTask(temporary, false) {
		t.Fatal("temporary task must remain available for current-page polling")
	}

	persistent := model.GenerationTask{Persistent: true}
	if isUserVisibleGenerationTask(persistent, false) {
		t.Fatal("persistent task must not be available after the role permission is disabled")
	}
	if !isUserVisibleGenerationTask(persistent, true) {
		t.Fatal("persistent task must be available when the role permission is enabled")
	}
}
