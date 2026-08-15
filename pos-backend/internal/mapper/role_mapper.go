package mapper

import (
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

func ToRoleResponse(r entity.Role, permissions []string) dto.RoleResponse {
	var desc string
	if r.Description != nil {
		desc = *r.Description
	}
	return dto.RoleResponse{
		ID:          r.ID.String(),
		Name:        r.Name,
		Description: desc,
		Level:       r.Level,
		IsSystem:    r.IsSystem,
		Permissions: emptyIfNil(permissions),
	}
}

func ToRoleResponseList(roles []entity.Role, permsByRoleID map[string][]string) []dto.RoleResponse {
	out := make([]dto.RoleResponse, 0, len(roles))
	for _, r := range roles {
		out = append(out, ToRoleResponse(r, permsByRoleID[r.ID.String()]))
	}
	return out
}
