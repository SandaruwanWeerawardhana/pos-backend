package dto

import "github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"

// Responses carry no envelope — a handler serialises its DTO directly, so the
// documented @Success type is the DTO itself (AuthUserResponse, []ProductResponse,
// and so on) and needs no wrapper here.
//
// UserListResponse is the one exception: a paginated list still has to carry
// its page counts, so items and meta travel as siblings.
type UserListResponse struct {
	Items []UserResponse `json:"items"`
	Meta  response.Meta  `json:"meta"`
}

// ErrorResponse documents the API's only error shape. The client reads
// `message` and renders it raw to a cashier; there is no code or errors[] on
// the wire (see pkg/response).
type ErrorResponse struct {
	Message string `json:"message"`
}
