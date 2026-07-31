package entity

import (
	"time"

	"github.com/google/uuid"
)

const (
	UserStatusActive    = "active"
	UserStatusSuspended = "suspended"
	UserStatusInvited   = "invited"
)

type User struct {
	IDMixin
	Timestamps
	SoftDelete

	BusinessID          uuid.UUID  `gorm:"column:business_id;not null"`
	Email               string     `gorm:"column:email;not null"`
	PasswordHash        string     `gorm:"column:password_hash;not null"`
	FullName            string     `gorm:"column:full_name;not null"`
	Status              string     `gorm:"column:status;not null"`
	FailedLoginAttempts int        `gorm:"column:failed_login_attempts;not null"`
	LockedUntil         *time.Time `gorm:"column:locked_until"`

	// Columns exist now for features deferred past pass 1 (2FA, email/phone
	// verification) so shipping them later is an additive migration only.
	TwoFactorEnabled bool       `gorm:"column:two_factor_enabled;not null"`
	TwoFactorSecret  *string    `gorm:"column:two_factor_secret"`
	EmailVerifiedAt  *time.Time `gorm:"column:email_verified_at"`
	Phone            *string    `gorm:"column:phone"`
	PhoneVerifiedAt  *time.Time `gorm:"column:phone_verified_at"`
	LastLoginAt      *time.Time `gorm:"column:last_login_at"`
}

func (User) TableName() string { return "users" }

// IsLocked reports whether the account is currently under a failed-login
// lockout.
func (u User) IsLocked() bool {
	return u.LockedUntil != nil && u.LockedUntil.After(time.Now())
}

// IsActive reports whether the account may authenticate at all.
func (u User) IsActive() bool {
	return u.Status == UserStatusActive
}
