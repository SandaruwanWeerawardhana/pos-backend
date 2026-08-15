package mapper

import (
	"time"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

const timeFormat = time.RFC3339

func ToUserResponse(u entity.User, roles []string) dto.UserResponse {
	return dto.UserResponse{
		ID:        u.ID.String(),
		Email:     u.Email,
		FullName:  u.FullName,
		Status:    u.Status,
		Roles:     emptyIfNil(roles),
		CreatedAt: u.CreatedAt.UTC().Format(timeFormat),
	}
}

// ToUserResponseList maps a slice of users, returning an empty (never nil)
// slice for zero rows.
func ToUserResponseList(users []entity.User, rolesByUserID map[string][]string) []dto.UserResponse {
	out := make([]dto.UserResponse, 0, len(users))
	for _, u := range users {
		out = append(out, ToUserResponse(u, rolesByUserID[u.ID.String()]))
	}
	return out
}
