package entity

import "github.com/google/uuid"

type Branch struct {
	IDMixin
	Timestamps
	SoftDelete

	BusinessID uuid.UUID `gorm:"column:business_id;not null"`
	Code       string    `gorm:"column:code;not null"`
	Name       string    `gorm:"column:name;not null"`
	IsDefault  bool      `gorm:"column:is_default;not null"`
}

func (Branch) TableName() string { return "branches" }

// DefaultBranchCode is the code assigned to a business's first branch,
// created in the same transaction as registration.
const DefaultBranchCode = "MAIN"
