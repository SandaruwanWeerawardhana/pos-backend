// Package apperror defines the application's error taxonomy: a single
// AppError type carrying a stable code, the HTTP status it maps to, a
// user-facing message, optional field-level detail, and the wrapped
// internal cause. The fiber ErrorHandler is the only place that turns one
// into an HTTP response; everything else just returns *AppError.
package apperror

import (
	"errors"
	"fmt"
	"net/http"
)

type Code string

const (
	CodeBadRequest         Code = "BAD_REQUEST"
	CodeValidationError    Code = "VALIDATION_ERROR"
	CodeUnauthenticated    Code = "UNAUTHENTICATED"
	CodeInvalidCredentials Code = "INVALID_CREDENTIALS"
	CodeTokenExpired       Code = "TOKEN_EXPIRED"
	CodeTokenInvalid       Code = "TOKEN_INVALID"
	CodeTokenRevoked       Code = "TOKEN_REVOKED"
	CodeTokenReused        Code = "TOKEN_REUSED"
	CodeForbidden          Code = "FORBIDDEN"
	CodeAccountSuspended   Code = "ACCOUNT_SUSPENDED"
	CodeNotFound           Code = "NOT_FOUND"
	CodeConflict           Code = "CONFLICT"
	CodeEmailAlreadyExists Code = "EMAIL_ALREADY_EXISTS"
	CodeAccountLocked      Code = "ACCOUNT_LOCKED"
	CodeRateLimited        Code = "RATE_LIMITED"
	CodeInternal           Code = "INTERNAL_ERROR"
	CodeDatabase           Code = "DATABASE_ERROR"
	CodeServiceUnavailable Code = "SERVICE_UNAVAILABLE"
)

var httpStatus = map[Code]int{
	CodeBadRequest:         http.StatusBadRequest,
	CodeValidationError:    http.StatusUnprocessableEntity,
	CodeUnauthenticated:    http.StatusUnauthorized,
	CodeInvalidCredentials: http.StatusUnauthorized,
	CodeTokenExpired:       http.StatusUnauthorized,
	CodeTokenInvalid:       http.StatusUnauthorized,
	CodeTokenRevoked:       http.StatusUnauthorized,
	CodeTokenReused:        http.StatusUnauthorized,
	CodeForbidden:          http.StatusForbidden,
	CodeAccountSuspended:   http.StatusForbidden,
	CodeNotFound:           http.StatusNotFound,
	CodeConflict:           http.StatusConflict,
	CodeEmailAlreadyExists: http.StatusConflict,
	CodeAccountLocked:      http.StatusLocked,
	CodeRateLimited:        http.StatusTooManyRequests,
	CodeInternal:           http.StatusInternalServerError,
	CodeDatabase:           http.StatusInternalServerError,
	CodeServiceUnavailable: http.StatusServiceUnavailable,
}

// FieldError is one entry of AppError.Fields, and mirrors the wire shape of
// the error envelope's errors[] array.
type FieldError struct {
	Field   string
	Rule    string
	Message string
	Value   any
}

type AppError struct {
	Code       Code
	HTTPStatus int
	Message    string
	Fields     []FieldError
	Internal   error
}

func (e *AppError) Error() string {
	if e.Internal != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Internal)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error { return e.Internal }

func New(code Code, message string) *AppError {
	return &AppError{Code: code, HTTPStatus: statusFor(code), Message: message}
}

func Wrap(code Code, message string, internal error) *AppError {
	return &AppError{Code: code, HTTPStatus: statusFor(code), Message: message, Internal: internal}
}

func WithFields(code Code, message string, fields []FieldError) *AppError {
	return &AppError{Code: code, HTTPStatus: statusFor(code), Message: message, Fields: fields}
}

func statusFor(code Code) int {
	if s, ok := httpStatus[code]; ok {
		return s
	}
	return http.StatusInternalServerError
}

// As extracts an *AppError from err, if it (or something it wraps) is one.
func As(err error) (*AppError, bool) {
	var ae *AppError
	ok := errors.As(err, &ae)
	return ae, ok
}
