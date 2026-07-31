package response

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func TestFromAppErrorUsesMessage(t *testing.T) {
	e := FromAppError(apperror.New(apperror.CodeNotFound, "product not found"))

	if e.Message != "product not found" {
		t.Errorf("Message = %q, want %q", e.Message, "product not found")
	}
}

// The client reads nothing but `message`, so the wire body must not carry the
// code or a field array that a caller would never see.
func TestErrorSerializesToMessageOnly(t *testing.T) {
	body, err := json.Marshal(FromAppError(apperror.New(apperror.CodeInternal, "boom")))
	if err != nil {
		t.Fatal(err)
	}

	if got, want := string(body), `{"message":"boom"}`; got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
}

// Field detail has nowhere else to go, so it is folded into the message rather
// than dropped — a bare "validation failed" would leave a cashier with no idea
// which input to fix.
func TestFromAppErrorFoldsFieldMessages(t *testing.T) {
	appErr := apperror.WithFields(apperror.CodeValidationError, "validation failed", []apperror.FieldError{
		{Field: "email", Rule: "email", Message: "invalid email"},
		{Field: "password", Rule: "min", Message: "password is too short"},
	})

	e := FromAppError(appErr)

	if !strings.Contains(e.Message, "invalid email") {
		t.Errorf("Message = %q, want it to mention the email failure", e.Message)
	}
	if !strings.Contains(e.Message, "password is too short") {
		t.Errorf("Message = %q, want it to mention the password failure", e.Message)
	}
}

func TestFromAppErrorNamesFieldWhenItHasNoMessage(t *testing.T) {
	appErr := apperror.WithFields(apperror.CodeValidationError, "validation failed", []apperror.FieldError{
		{Field: "barcode", Rule: "required"},
	})

	e := FromAppError(appErr)

	if !strings.Contains(e.Message, "barcode") {
		t.Errorf("Message = %q, want it to name the failing field", e.Message)
	}
}

// A Fields slice that carries no usable text must not collapse the message to
// an empty string.
func TestFromAppErrorFallsBackToMessageWhenFieldsAreBlank(t *testing.T) {
	appErr := apperror.WithFields(apperror.CodeValidationError, "validation failed", []apperror.FieldError{
		{Rule: "required"},
	})

	e := FromAppError(appErr)

	if e.Message != "validation failed" {
		t.Errorf("Message = %q, want the fallback %q", e.Message, "validation failed")
	}
}
