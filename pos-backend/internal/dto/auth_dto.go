package dto

// Auth request/response bodies are camelCase, unlike the snake_case domain
// models (products, orders). The split is deliberate, not an oversight: it
// matches what the frontend already sends and reads — see the bodies built in
// pos-frontend/src/lib/services/auth.service.ts and the AuthUser type in
// pos-frontend/src/lib/api/client.ts. Making either side uniform would break a
// client that is already written.

type RegisterRequest struct {
	OwnerName    string `json:"ownerName" validate:"required,min=2,max=120"`
	BusinessName string `json:"businessName" validate:"required,min=2,max=120"`
	Email        string `json:"email" validate:"required,email,max=254"`
	Password     string `json:"password" validate:"required,min=8,bcryptsafe"`
	BusinessType string `json:"businessType" validate:"required,oneof=grocery bookshop"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Password string `json:"password" validate:"required,bcryptsafe"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" validate:"required"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" validate:"required,bcryptsafe"`
	NewPassword     string `json:"newPassword" validate:"required,min=8,bcryptsafe"`
}

type PasswordResetRequestRequest struct {
	Email string `json:"email" validate:"required,email,max=254"`
}

type PasswordResetConfirmRequest struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"newPassword" validate:"required,min=8,bcryptsafe"`
}

// PasswordResetRequestResponse is deliberately near-empty. The endpoint
// resolves identically whether or not the address is registered — telling a
// caller which emails exist is an account-enumeration leak — so the only
// variable field is a dev convenience token, populated in local environments
// only and omitted everywhere else.
type PasswordResetRequestResponse struct {
	DevToken string `json:"devToken,omitempty"`
}

// UpdateProfileRequest is the PATCH /auth/profile body, mirroring the
// frontend's ProfileUpdate. Every field is optional: the client sends only what
// changed.
//
// Email is accepted but not applied — changing the address a user signs in with
// needs a verification round-trip that does not exist yet, so the field is
// ignored rather than silently rewriting the login credential.
type UpdateProfileRequest struct {
	Name         *string `json:"name" validate:"omitempty,min=2,max=120"`
	Email        *string `json:"email" validate:"omitempty,email,max=254"`
	BusinessName *string `json:"businessName" validate:"omitempty,min=2,max=120"`
}

// AuthUserResponse is the `user` object inside a login/register response and
// the whole body of GET /auth/me and PATCH /auth/profile.
//
// id/email/name/businessName/businessType are the five fields the frontend's
// AuthUser reads; the rest are additive and harmlessly ignored by it.
type AuthUserResponse struct {
	ID           string   `json:"id"`
	Email        string   `json:"email"`
	Name         string   `json:"name"`
	Phone        *string  `json:"phone,omitempty"`
	BusinessID   string   `json:"businessId"`
	BusinessName string   `json:"businessName"`
	BusinessType string   `json:"businessType"`
	BranchID     string   `json:"branchId"`
	Roles        []string `json:"roles"`
	Permissions  []string `json:"permissions"`
}

// LoginResponse is the body of POST /auth/login and POST /auth/register.
//
// Token is the access JWT and maps onto the frontend's LoginResult.token, which
// the auth store decodes for its `exp` claim to end the session client-side.
// There is deliberately no refresh token in it: the client has no refresh flow,
// so rotation stays server-side (POST /auth/refresh exists, unused until
// Phase 2) and the access TTL is long enough to cover a cashier's shift.
type LoginResponse struct {
	Token string           `json:"token"`
	User  AuthUserResponse `json:"user"`
}
