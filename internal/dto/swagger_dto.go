package dto

import "github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"

// swaggo/swag renders response.Envelope's `Data any` field as an empty
// object, so every documented endpoint needs a concrete wrapper here.
// Populated as commit 13 adds @Success annotations; kept minimal for now.

type EnvelopeAuthUser struct {
	Success   bool             `json:"success"`
	Message   string           `json:"message"`
	Data      AuthUserResponse `json:"data"`
	RequestID string           `json:"request_id"`
	Timestamp string           `json:"timestamp"`
}

type EnvelopeTokenPair struct {
	Success   bool              `json:"success"`
	Message   string            `json:"message"`
	Data      TokenPairResponse `json:"data"`
	RequestID string            `json:"request_id"`
	Timestamp string            `json:"timestamp"`
}

type EnvelopeUserList struct {
	Success   bool           `json:"success"`
	Message   string         `json:"message"`
	Data      []UserResponse `json:"data"`
	Meta      response.Meta  `json:"meta"`
	RequestID string         `json:"request_id"`
	Timestamp string         `json:"timestamp"`
}

type EnvelopeRoleList struct {
	Success   bool           `json:"success"`
	Message   string         `json:"message"`
	Data      []RoleResponse `json:"data"`
	Meta      response.Meta  `json:"meta"`
	RequestID string         `json:"request_id"`
	Timestamp string         `json:"timestamp"`
}

type EnvelopeError struct {
	Success   bool                  `json:"success"`
	Message   string                `json:"message"`
	Code      string                `json:"code"`
	Errors    []response.FieldError `json:"errors"`
	RequestID string                `json:"request_id"`
	Timestamp string                `json:"timestamp"`
}
