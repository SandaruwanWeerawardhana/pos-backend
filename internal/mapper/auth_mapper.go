// Package mapper translates between internal/entity and internal/dto in
// both directions, so a persistence-column rename never becomes a silent
// wire-format change and vice versa.
package mapper

import (
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

// ToAuthUserResponse builds the auth.me / login / register user payload.
// roles and permissions are passed in separately since they come from a
// join across user_roles/role_permissions, not the users table itself.
func ToAuthUserResponse(u entity.User, business entity.Business, branchID string, roles, permissions []string) dto.AuthUserResponse {
	return dto.AuthUserResponse{
		ID:           u.ID.String(),
		Email:        u.Email,
		Name:         u.FullName,
		Phone:        u.Phone,
		BusinessID:   business.ID.String(),
		BusinessName: business.Name,
		BusinessType: business.BusinessType,
		BranchID:     branchID,
		Roles:        emptyIfNil(roles),
		Permissions:  emptyIfNil(permissions),
	}
}

// emptyIfNil guarantees a non-nil slice so JSON serializes "[]", never
// "null" — encoding/json renders a nil slice as null, and .map() on null
// crashes the frontend.
func emptyIfNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
