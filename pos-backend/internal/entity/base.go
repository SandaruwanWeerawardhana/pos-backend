// Package entity holds the GORM-mapped domain structs. These are a query
// layer over tables created by goose migrations — nothing here ever drives
// schema (no AutoMigrate), so struct tags describe existing columns, they
// don't create them.
package entity

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IDMixin is the primary-key mixin every entity embeds. Keys are UUIDv7,
// generated here rather than by the database, so application code can
// reference an entity's id before the row is committed (e.g. building a
// related row in the same transaction).
//
// Named IDMixin, not ID: an anonymous embed's field name is its type name,
// so an embedded type literally named "ID" would shadow its own "ID"
// field — callers would get the mixin struct back from u.ID instead of the
// uuid.UUID. gorm.Model has the identical shape for the identical reason.
type IDMixin struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey"`
}

// BeforeCreate assigns a UUIDv7 if the caller has not already set one. GORM
// detects this hook via interface satisfaction on the embedding struct, so
// every entity below gets it for free.
func (m *IDMixin) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		m.ID = id
	}
	return nil
}

// Timestamps mixin, for tables with both created_at and updated_at.
type Timestamps struct {
	CreatedAt time.Time `gorm:"column:created_at;not null"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null"`
}

// CreatedOnly mixin, for append-only tables with no updated_at column
// (role_permissions, user_roles, refresh_tokens, audit_logs).
type CreatedOnly struct {
	CreatedAt time.Time `gorm:"column:created_at;not null"`
}

// SoftDelete mixin, for tables with a deleted_at column. gorm.DeletedAt
// makes GORM add "WHERE deleted_at IS NULL" automatically and turns
// .Delete() into an UPDATE instead of a DELETE.
type SoftDelete struct {
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;index"`
}
