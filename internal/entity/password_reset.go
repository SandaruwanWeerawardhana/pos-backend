package entity

import (
	"time"

	"github.com/google/uuid"
)

// PasswordReset is a single-use password reset grant.
//
// TokenHash holds a SHA-256 digest, never the token itself: a database read
// must not yield working reset links. The plaintext lives only in the email
// sent to the user.
type PasswordReset struct {
	IDMixin
	CreatedOnly

	UserID     uuid.UUID  `gorm:"column:user_id;not null"`
	TokenHash  string     `gorm:"column:token_hash;not null"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;not null"`
	ConsumedAt *time.Time `gorm:"column:consumed_at"`
}

func (PasswordReset) TableName() string { return "password_resets" }

// IsUsable reports whether the grant may still be redeemed: unconsumed and
// not yet expired.
func (p PasswordReset) IsUsable(now time.Time) bool {
	return p.ConsumedAt == nil && p.ExpiresAt.After(now)
}
