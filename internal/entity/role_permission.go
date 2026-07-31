package entity

import "github.com/google/uuid"

const (
	EffectAllow = "allow"
	EffectDeny  = "deny"
)

type RolePermission struct {
	IDMixin
	CreatedOnly

	RoleID       uuid.UUID `gorm:"column:role_id;not null"`
	PermissionID uuid.UUID `gorm:"column:permission_id;not null"`
	Effect       string    `gorm:"column:effect;not null"`
}

func (RolePermission) TableName() string { return "role_permissions" }
