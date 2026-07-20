package middleware

import "testing"

func TestUsageAuditResponseReadsApplicationEnvelope(t *testing.T) {
	if success, message := usageAuditResponse(`{"code":0,"data":{},"msg":"ok"}`, 200); !success || message != "" {
		t.Fatalf("expected successful envelope, got success=%v message=%q", success, message)
	}
	if success, message := usageAuditResponse(`{"code":1,"data":null,"msg":"验证码错误"}`, 200); success || message != "验证码错误" {
		t.Fatalf("expected failed envelope, got success=%v message=%q", success, message)
	}
}

func TestUsageAuditResponseUserReadsLoginIdentity(t *testing.T) {
	user := usageAuditResponseUser(`{"code":0,"data":{"token":"secret","user":{"id":"user-1","username":"julong"}},"msg":"ok"}`)
	if user.ID != "user-1" || user.Username != "julong" {
		t.Fatalf("unexpected response user: %+v", user)
	}
}

func TestUsageAuditWriterStoresInternalError(t *testing.T) {
	writer := &usageAuditWriter{}
	writer.SetUsageAuditError("  今日已签到  ")
	if writer.auditError != "今日已签到" {
		t.Fatalf("unexpected audit error: %q", writer.auditError)
	}
}
