package entity

import (
	"time"

	"github.com/google/uuid"
)

const (
	RevokedReasonRotated   = "rotated"
	RevokedReasonReused    = "reused"
	RevokedReasonLogout    = "logout"
	RevokedReasonLogoutAll = "logout_all"
)

type RefreshToken struct {
	IDMixin
	CreatedOnly

	UserID uuid.UUID `gorm:"column:user_id;not null"`
	// TokenHash is the SHA-256 of the opaque token; the raw token is never
	// stored.
	TokenHash string `gorm:"column:token_hash;not null"`
	// FamilyID is shared by every token descended from one login. Rotation
	// issues a successor in the same family; presenting an already-revoked
	// token revokes the whole family (reuse detection).
	FamilyID      uuid.UUID  `gorm:"column:family_id;not null"`
	ParentID      *uuid.UUID `gorm:"column:parent_id"`
	RevokedAt     *time.Time `gorm:"column:revoked_at"`
	RevokedReason *string    `gorm:"column:revoked_reason"`
	UserAgent     *string    `gorm:"column:user_agent"`
	IPAddress     *string    `gorm:"column:ip_address"`
	ExpiresAt     time.Time  `gorm:"column:expires_at;not null"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

// IsActive reports whether the token is neither revoked nor expired.
func (r RefreshToken) IsActive() bool {
	return r.RevokedAt == nil && r.ExpiresAt.After(time.Now())
}
