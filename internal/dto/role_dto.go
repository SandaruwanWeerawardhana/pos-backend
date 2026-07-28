package dto

type RoleResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Level       int      `json:"level"`
	IsSystem    bool     `json:"is_system"`
	Permissions []string `json:"permissions"`
}

type CreateRoleRequest struct {
	Name          string   `json:"name" validate:"required,min=2,max=60"`
	Description   string   `json:"description" validate:"max=255"`
	Level         int      `json:"level" validate:"min=0,max=99"`
	PermissionIDs []string `json:"permission_ids" validate:"omitempty,dive,uuid"`
}

type UpdateRoleRequest struct {
	Description   *string  `json:"description" validate:"omitempty,max=255"`
	Level         *int     `json:"level" validate:"omitempty,min=0,max=99"`
	PermissionIDs []string `json:"permission_ids" validate:"omitempty,dive,uuid"`
}
