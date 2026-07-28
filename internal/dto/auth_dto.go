package dto

type RegisterRequest struct {
	OwnerName    string `json:"owner_name" validate:"required,min=2,max=120"`
	BusinessName string `json:"business_name" validate:"required,min=2,max=120"`
	Email        string `json:"email" validate:"required,email,max=254"`
	Password     string `json:"password" validate:"required,min=8,bcryptsafe"`
	BusinessType string `json:"business_type" validate:"required,oneof=grocery bookshop"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Password string `json:"password" validate:"required,bcryptsafe"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required,bcryptsafe"`
	NewPassword     string `json:"new_password" validate:"required,min=8,bcryptsafe"`
}

type UpdateMeRequest struct {
	FullName *string `json:"full_name" validate:"omitempty,min=2,max=120"`
	Phone    *string `json:"phone" validate:"omitempty,e164"`
}

// AuthUserResponse is embedded in both /auth/login and /auth/register
// responses. Field names/shape must keep mapping onto the frontend's
// AuthUser (pos-frontend/src/lib/api/client.ts) without a frontend change:
// id/email/name/businessName/businessType are the only fields it reads
// today; everything else is additive.
type AuthUserResponse struct {
	ID           string   `json:"id"`
	Email        string   `json:"email"`
	Name         string   `json:"name"`
	Phone        *string  `json:"phone,omitempty"`
	BusinessID   string   `json:"business_id"`
	BusinessName string   `json:"business_name"`
	BusinessType string   `json:"business_type"`
	BranchID     string   `json:"branch_id"`
	Roles        []string `json:"roles"`
	Permissions  []string `json:"permissions"`
}

type TokenPairResponse struct {
	AccessToken  string           `json:"access_token"`
	RefreshToken string           `json:"refresh_token"`
	TokenType    string           `json:"token_type"`
	ExpiresIn    int64            `json:"expires_in"`
	User         AuthUserResponse `json:"user"`
}
