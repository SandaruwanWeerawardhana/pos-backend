// Package response defines the API's success and error envelope shapes.
// Building the envelope is kept fiber-free and pure so it stays unit
// testable; the handler/error-handler layer is what writes it to the wire.
package response

import (
	"time"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type Meta struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
	HasNext    bool  `json:"has_next"`
	HasPrev    bool  `json:"has_prev"`
}

// Envelope is the success response shape. Data must never be a nil slice —
// a mapper returning "no rows" must return an empty slice, not nil, since
// encoding/json renders a nil slice as null and .map() on null crashes the
// frontend.
type Envelope struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Data      any    `json:"data"`
	Meta      *Meta  `json:"meta,omitempty"`
	RequestID string `json:"request_id"`
	Timestamp string `json:"timestamp"`
}

type FieldError struct {
	Field   string `json:"field"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
	Value   any    `json:"value,omitempty"`
}

type ErrorEnvelope struct {
	Success   bool         `json:"success"`
	Message   string       `json:"message"`
	Code      string       `json:"code"`
	Errors    []FieldError `json:"errors"`
	RequestID string       `json:"request_id"`
	Timestamp string       `json:"timestamp"`
}

// OK builds a success envelope for a single resource or an already-populated
// list.
func OK(requestID, message string, data any) Envelope {
	return Envelope{
		Success:   true,
		Message:   message,
		Data:      data,
		RequestID: requestID,
		Timestamp: now(),
	}
}

// OKPaginated builds a success envelope carrying list pagination metadata.
func OKPaginated(requestID, message string, data any, meta Meta) Envelope {
	e := OK(requestID, message, data)
	e.Meta = &meta
	return e
}

// FromAppError builds the error envelope for an *apperror.AppError. It is
// the single place that translates the internal error taxonomy into the
// wire's {code, errors[]} shape.
func FromAppError(requestID string, err *apperror.AppError) ErrorEnvelope {
	fields := make([]FieldError, 0, len(err.Fields))
	for _, f := range err.Fields {
		fields = append(fields, FieldError{
			Field:   f.Field,
			Rule:    f.Rule,
			Message: f.Message,
			Value:   f.Value,
		})
	}

	return ErrorEnvelope{
		Success:   false,
		Message:   err.Message,
		Code:      string(err.Code),
		Errors:    fields,
		RequestID: requestID,
		Timestamp: now(),
	}
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }
