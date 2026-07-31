package entity

import (
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const (
	AuditStatusSuccess = "success"
	AuditStatusFailure = "failure"
)

// Action names written by the auth flow. Other modules append their own
// "<resource>.<verb>" names as they land.
const (
	AuditActionLogin                = "auth.login"
	AuditActionLogout               = "auth.logout"
	AuditActionLogoutAll            = "auth.logout_all"
	AuditActionRegister             = "auth.register"
	AuditActionRefresh              = "auth.refresh"
	AuditActionRefreshReuseDetected = "auth.refresh_reuse_detected"
	AuditActionChangePassword       = "auth.change_password"
)

// AuditLog rows are append-only — nothing ever updates or soft-deletes one.
type AuditLog struct {
	IDMixin
	CreatedOnly

	BusinessID   *uuid.UUID     `gorm:"column:business_id"`
	UserID       *uuid.UUID     `gorm:"column:user_id"`
	Action       string         `gorm:"column:action;not null"`
	Status       string         `gorm:"column:status;not null"`
	ResourceType *string        `gorm:"column:resource_type"`
	ResourceID   *uuid.UUID     `gorm:"column:resource_id"`
	OldValues    datatypes.JSON `gorm:"column:old_values"`
	NewValues    datatypes.JSON `gorm:"column:new_values"`
	IPAddress    *string        `gorm:"column:ip_address"`
	UserAgent    *string        `gorm:"column:user_agent"`
	RequestID    *string        `gorm:"column:request_id"`
}

func (AuditLog) TableName() string { return "audit_logs" }
