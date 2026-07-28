package entity

import "github.com/google/uuid"

const (
	BusinessTypeGrocery  = "grocery"
	BusinessTypeBookshop = "bookshop"
)

type Business struct {
	IDMixin
	Timestamps
	SoftDelete

	Slug         string     `gorm:"column:slug;not null"`
	Name         string     `gorm:"column:name;not null"`
	BusinessType string     `gorm:"column:business_type;not null"`
	CurrencyCode string     `gorm:"column:currency_code;not null"`
	// DefaultTaxRate is a percentage (e.g. 15.00 for 15%), not currency — it
	// is not subject to the app's integer-cents money rule.
	DefaultTaxRate float64    `gorm:"column:default_tax_rate;not null"`
	OwnerUserID    *uuid.UUID `gorm:"column:owner_user_id"`
}

func (Business) TableName() string { return "businesses" }
