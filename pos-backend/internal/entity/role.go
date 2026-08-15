package entity

import "github.com/google/uuid"

// Seeded system role names (business_id NULL, is_system=true).
const (
	RoleOwner          = "owner"
	RoleManager        = "manager"
	RoleCashier        = "cashier"
	RoleWarehouseStaff = "warehouse_staff"
)

// Seeded system role levels — a role can only assign a role at or below its
// own level.
const (
	RoleLevelOwner          = 100
	RoleLevelManager        = 80
	RoleLevelCashier        = 40
	RoleLevelWarehouseStaff = 40
)

type Role struct {
	IDMixin
	Timestamps
	SoftDelete

	// NULL business_id means a global system role.
	BusinessID  *uuid.UUID `gorm:"column:business_id"`
	Name        string     `gorm:"column:name;not null"`
	Description *string    `gorm:"column:description"`
	Level       int        `gorm:"column:level;not null"`
	IsSystem    bool       `gorm:"column:is_system;not null"`
}

func (Role) TableName() string { return "roles" }
