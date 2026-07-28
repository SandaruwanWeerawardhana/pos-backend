package response

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func TestOKEnvelopeShape(t *testing.T) {
	e := OK("req-1", "ok", map[string]string{"id": "1"})
	if !e.Success || e.Meta != nil || e.RequestID != "req-1" {
		t.Fatalf("unexpected envelope: %+v", e)
	}
}

func TestOKPaginatedSetsMeta(t *testing.T) {
	e := OKPaginated("req-1", "ok", []int{1, 2}, Meta{Page: 1, PerPage: 20, Total: 2, TotalPages: 1})
	if e.Meta == nil || e.Meta.Total != 2 {
		t.Fatalf("expected meta with total 2, got %+v", e.Meta)
	}
}

func TestEmptyListDataSerializesAsEmptyArrayNotNull(t *testing.T) {
	empty := make([]string, 0)
	e := OK("req-1", "ok", empty)

	body, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"data":[]`) {
		t.Errorf("expected data:[] in %s", body)
	}
}

func TestFromAppErrorMapsFieldsAndCode(t *testing.T) {
	appErr := apperror.WithFields(apperror.CodeValidationError, "invalid input", []apperror.FieldError{
		{Field: "email", Rule: "email", Message: "invalid email"},
	})

	e := FromAppError("req-2", appErr)

	if e.Success {
		t.Error("error envelope must have success=false")
	}
	if e.Code != string(apperror.CodeValidationError) {
		t.Errorf("Code = %s, want %s", e.Code, apperror.CodeValidationError)
	}
	if len(e.Errors) != 1 || e.Errors[0].Field != "email" {
		t.Errorf("Errors = %+v", e.Errors)
	}
}

func TestFromAppErrorNilFieldsBecomesEmptySlice(t *testing.T) {
	appErr := apperror.New(apperror.CodeNotFound, "not found")
	e := FromAppError("req-3", appErr)

	body, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"errors":[]`) {
		t.Errorf("expected errors:[] in %s", body)
	}
}
