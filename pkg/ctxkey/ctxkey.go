// Package ctxkey defines typed context keys shared across middleware,
// services, and logging, so unrelated packages using plain strings can never
// collide with these values.
package ctxkey

type Key string

const (
	RequestID  Key = "request_id"
	UserID     Key = "user_id"
	BusinessID Key = "business_id"
	BranchID   Key = "branch_id"
	Roles      Key = "roles"
)
