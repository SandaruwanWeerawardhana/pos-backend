package dto

type UserResponse struct {
	ID        string   `json:"id"`
	Email     string   `json:"email"`
	FullName  string   `json:"full_name"`
	Status    string   `json:"status"`
	Roles     []string `json:"roles"`
	CreatedAt string   `json:"created_at"`
}

type CreateUserRequest struct {
	Email    string   `json:"email" validate:"required,email,max=254"`
	FullName string   `json:"full_name" validate:"required,min=2,max=120"`
	Password string   `json:"password" validate:"required,min=8,bcryptsafe"`
	RoleIDs  []string `json:"role_ids" validate:"required,min=1,dive,uuid4"`
}

type UpdateUserRequest struct {
	FullName *string  `json:"full_name" validate:"omitempty,min=2,max=120"`
	Status   *string  `json:"status" validate:"omitempty,oneof=active suspended invited"`
	RoleIDs  []string `json:"role_ids" validate:"omitempty,dive,uuid4"`
}
