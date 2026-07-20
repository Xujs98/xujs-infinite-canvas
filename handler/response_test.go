package handler

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type auditResponseRecorder struct {
	*httptest.ResponseRecorder
	auditError string
}

func (recorder *auditResponseRecorder) SetUsageAuditError(value string) {
	recorder.auditError = value
}

func TestFailErrorRecordsInternalMessageWithoutExposingIt(t *testing.T) {
	recorder := &auditResponseRecorder{ResponseRecorder: httptest.NewRecorder()}
	FailError(recorder, errors.New("database connection detail"))

	if recorder.auditError != "database connection detail" {
		t.Fatalf("unexpected audit error: %q", recorder.auditError)
	}
	if strings.Contains(recorder.Body.String(), "database connection detail") {
		t.Fatalf("internal error leaked to response: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "操作失败") {
		t.Fatalf("expected safe response, got: %s", recorder.Body.String())
	}
}
