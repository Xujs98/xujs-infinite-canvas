package service

import (
	"testing"
	"time"
)

func seedRegistrationCodeForTest(email string, code string, expiresAt time.Time) {
	registrationCodes.Lock()
	registrationCodes.items = map[string]registrationCodeEntry{
		email: {
			hash:       hashRegistrationCode(email, code),
			expiresAt:  expiresAt,
			lastSentAt: time.Now(),
		},
	}
	registrationCodes.Unlock()
}

func TestValidateRegistrationEmailCode(t *testing.T) {
	email := "user@example.com"
	seedRegistrationCodeForTest(email, "123456", time.Now().Add(time.Minute))
	if err := validateRegistrationEmailCode(email, "123456"); err != nil {
		t.Fatalf("expected valid code, got %v", err)
	}
	if err := verifyAndConsumeRegistrationEmailCode(email, "123456"); err != nil {
		t.Fatalf("expected code consumption to succeed, got %v", err)
	}
	if err := validateRegistrationEmailCode(email, "123456"); err == nil {
		t.Fatal("expected consumed code to be rejected")
	}
}

func TestValidateRegistrationEmailCodeRejectsWrongAndExpiredCodes(t *testing.T) {
	email := "user@example.com"
	seedRegistrationCodeForTest(email, "123456", time.Now().Add(time.Minute))
	if err := validateRegistrationEmailCode(email, "654321"); err == nil {
		t.Fatal("expected wrong code to be rejected")
	}
	seedRegistrationCodeForTest(email, "123456", time.Now().Add(-time.Second))
	if err := validateRegistrationEmailCode(email, "123456"); err == nil {
		t.Fatal("expected expired code to be rejected")
	}
}

func TestPasswordChangeCodeIsIsolatedFromRegistrationCode(t *testing.T) {
	email := "user@example.com"
	passwordChangeCodes.Lock()
	passwordChangeCodes.items = map[string]registrationCodeEntry{
		email: {
			hash:       hashRegistrationCode(email, "123456"),
			expiresAt:  time.Now().Add(time.Minute),
			lastSentAt: time.Now(),
		},
	}
	passwordChangeCodes.Unlock()

	if err := verifyAndConsumeRegistrationEmailCode(email, "123456"); err == nil {
		t.Fatal("expected password change code to be rejected by registration flow")
	}
	if err := verifyAndConsumePasswordChangeEmailCode(email, "123456"); err != nil {
		t.Fatalf("expected password change code to be accepted, got %v", err)
	}
	if err := verifyAndConsumePasswordChangeEmailCode(email, "123456"); err == nil {
		t.Fatal("expected consumed password change code to be rejected")
	}
}

func TestLoginCodeIsIsolatedAndSingleUse(t *testing.T) {
	email := "user@example.com"
	loginEmailCodes.Lock()
	loginEmailCodes.items = map[string]registrationCodeEntry{
		email: {
			hash:       hashRegistrationCode(email, "123456"),
			expiresAt:  time.Now().Add(time.Minute),
			lastSentAt: time.Now(),
		},
	}
	loginEmailCodes.Unlock()

	if err := verifyAndConsumeRegistrationEmailCode(email, "123456"); err == nil {
		t.Fatal("expected login code to be rejected by registration flow")
	}
	if err := verifyAndConsumePasswordChangeEmailCode(email, "123456"); err == nil {
		t.Fatal("expected login code to be rejected by password change flow")
	}
	if err := verifyAndConsumeLoginEmailCode(email, "123456"); err != nil {
		t.Fatalf("expected login code to be accepted, got %v", err)
	}
	if err := verifyAndConsumeLoginEmailCode(email, "123456"); err == nil {
		t.Fatal("expected consumed login code to be rejected")
	}
}
