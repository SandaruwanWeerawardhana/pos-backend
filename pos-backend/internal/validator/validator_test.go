package validator

import (
	"strings"
	"testing"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type testRegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8,bcryptsafe"`
}

func TestStructReturnsNilForValidInput(t *testing.T) {
	err := Struct(testRegisterRequest{Email: "a@b.com", Password: "long-enough-password"})
	if err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestStructUsesJSONFieldNames(t *testing.T) {
	err := Struct(testRegisterRequest{Email: "not-an-email", Password: "long-enough-password"})
	ae, ok := apperror.As(err)
	if !ok {
		t.Fatalf("expected an AppError, got %v", err)
	}
	if len(ae.Fields) != 1 || ae.Fields[0].Field != "email" {
		t.Errorf("expected field name %q, got %+v", "email", ae.Fields)
	}
}

func TestStructRedactsPasswordValue(t *testing.T) {
	err := Struct(testRegisterRequest{Email: "a@b.com", Password: "short"})
	ae, _ := apperror.As(err)

	var passwordField *apperror.FieldError
	for i := range ae.Fields {
		if ae.Fields[i].Field == "password" {
			passwordField = &ae.Fields[i]
		}
	}
	if passwordField == nil {
		t.Fatal("expected a password field error")
	}
	if passwordField.Value != "[REDACTED]" {
		t.Errorf("Value = %v, want [REDACTED]", passwordField.Value)
	}
}

func TestBcryptSafeRejectsOverlongPassword(t *testing.T) {
	over72 := strings.Repeat("a", 73)
	err := Struct(testRegisterRequest{Email: "a@b.com", Password: over72})
	ae, ok := apperror.As(err)
	if !ok {
		t.Fatalf("expected an AppError, got %v", err)
	}

	var found bool
	for _, f := range ae.Fields {
		if f.Field == "password" && f.Rule == "bcryptsafe" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a bcryptsafe field error, got %+v", ae.Fields)
	}
}

func TestStructWrapsNonValidationErrors(t *testing.T) {
	// Passing a non-struct value makes go-playground/validator return an
	// InvalidValidationError, not ValidationErrors — Struct must still
	// return an AppError, not panic or leak the raw error type.
	err := Struct(nil)
	if err == nil {
		t.Fatal("expected an error for a nil input")
	}
	if _, ok := apperror.As(err); !ok {
		t.Errorf("expected an AppError, got %T: %v", err, err)
	}
}
