package apperror

import (
	"errors"
	"net/http"
	"testing"
)

func TestNewSetsHTTPStatus(t *testing.T) {
	cases := map[Code]int{
		CodeValidationError:    http.StatusUnprocessableEntity,
		CodeUnauthenticated:    http.StatusUnauthorized,
		CodeForbidden:          http.StatusForbidden,
		CodeNotFound:           http.StatusNotFound,
		CodeEmailAlreadyExists: http.StatusConflict,
		CodeAccountLocked:      http.StatusLocked,
		CodeRateLimited:        http.StatusTooManyRequests,
		CodeInternal:           http.StatusInternalServerError,
	}

	for code, want := range cases {
		err := New(code, "msg")
		if err.HTTPStatus != want {
			t.Errorf("New(%s).HTTPStatus = %d, want %d", code, err.HTTPStatus, want)
		}
	}
}

func TestUnknownCodeDefaultsTo500(t *testing.T) {
	err := New(Code("SOMETHING_MADE_UP"), "msg")
	if err.HTTPStatus != http.StatusInternalServerError {
		t.Errorf("HTTPStatus = %d, want 500", err.HTTPStatus)
	}
}

func TestWrapUnwrap(t *testing.T) {
	cause := errors.New("db exploded")
	err := Wrap(CodeDatabase, "query failed", cause)

	if !errors.Is(err, cause) {
		t.Error("errors.Is should find the wrapped cause")
	}
	if err.Unwrap() != cause {
		t.Error("Unwrap() should return the internal error")
	}
}

func TestAsExtractsAppError(t *testing.T) {
	original := New(CodeNotFound, "not found")
	wrapped := errors.Join(errors.New("context"), original)

	got, ok := As(wrapped)
	if !ok {
		t.Fatal("As() should find the AppError inside a joined error")
	}
	if got.Code != CodeNotFound {
		t.Errorf("Code = %s, want %s", got.Code, CodeNotFound)
	}
}

func TestAsFailsForPlainError(t *testing.T) {
	_, ok := As(errors.New("plain"))
	if ok {
		t.Error("As() should not find an AppError in a plain error")
	}
}

func TestWithFieldsCarriesFieldErrors(t *testing.T) {
	err := WithFields(CodeValidationError, "invalid", []FieldError{
		{Field: "email", Rule: "email", Message: "must be a valid email"},
	})
	if len(err.Fields) != 1 || err.Fields[0].Field != "email" {
		t.Errorf("Fields = %+v, want one entry for email", err.Fields)
	}
}
