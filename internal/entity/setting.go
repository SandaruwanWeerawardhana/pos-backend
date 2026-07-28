package entity

import (
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Setting struct {
	IDMixin
	Timestamps

	BusinessID *uuid.UUID     `gorm:"column:business_id"`
	BranchID   *uuid.UUID     `gorm:"column:branch_id"`
	Key        string         `gorm:"column:key;not null"`
	Value      datatypes.JSON `gorm:"column:value;not null"`
}

func (Setting) TableName() string { return "settings" }
