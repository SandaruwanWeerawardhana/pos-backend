// Package response defines the API's error wire shape and list pagination
// metadata. Building them is kept fiber-free and pure so it stays unit
// testable; the handler/error-handler layer is what writes to the wire.
//
// Success responses have no envelope: a handler serialises its DTO directly,
// so GET /products is a bare JSON array and POST /auth/login is a bare
// {token, user} object. That is not a style preference — the frontend's
// httpClient (pos-frontend/src/lib/services/http-client.ts) hands the parsed
// body straight to its caller with no unwrapping step, so introducing an
// envelope would require changing both sides in lockstep.
//
// Errors are {"message": "..."} and nothing else. The client reads that one
// field and renders the string raw to a cashier, so a message must be
// human-readable and must never leak internals. The richer AppError taxonomy
// (stable code, field-level detail, wrapped cause) still exists server-side for
// logs and tests; it just does not reach the wire.
package response

import (
	"strings"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

// Meta is the pagination metadata for a list endpoint. Returned as a sibling
// of the list rather than wrapping it, so the array itself stays the response
// body where the client expects it.
type Meta struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
	HasNext    bool  `json:"has_next"`
	HasPrev    bool  `json:"has_prev"`
}

// Error is the only error shape the API emits.
type Error struct {
	Message string `json:"message"`
}

// FromAppError renders an AppError as the client-visible error body.
//
// Field-level validation detail is folded into the single message: with no
// errors[] array on the wire, a cashier would otherwise be left reading a bare
// "validation failed" with no clue which input to correct.
func FromAppError(err *apperror.AppError) Error {
	return Error{Message: messageFor(err)}
}

func messageFor(err *apperror.AppError) string {
	if len(err.Fields) == 0 {
		return err.Message
	}

	parts := make([]string, 0, len(err.Fields))
	for _, f := range err.Fields {
		switch {
		case f.Message != "":
			parts = append(parts, f.Message)
		case f.Field != "":
			parts = append(parts, f.Field+" is invalid")
		}
	}
	if len(parts) == 0 {
		return err.Message
	}
	return strings.Join(parts, "; ")
}
