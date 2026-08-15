package entity

import "github.com/google/uuid"

type UserRole struct {
	IDMixin
	CreatedOnly

	UserID uuid.UUID `gorm:"column:user_id;not null"`
	RoleID uuid.UUID `gorm:"column:role_id;not null"`
	// NULL BranchID means the role applies business-wide.
	BranchID *uuid.UUID `gorm:"column:branch_id"`
}

func (UserRole) TableName() string { return "user_roles" }
