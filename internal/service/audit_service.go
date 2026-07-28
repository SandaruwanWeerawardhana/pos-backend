// Package service holds business logic: everything above repository and
// below handler. Services never import fiber (see .golangci.yml's depguard
// rules) and never take internal/dto as input — handlers translate DTOs
// into plain parameters so a wire-format change never forces a service
// change.
package service

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"gorm.io/datatypes"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
)

//go:generate go run go.uber.org/mock/mockgen -source=audit_service.go -destination=mocks/audit_service_mock.go -package=mocks

// AuditEntry describes one audit event. BusinessID/UserID are pointers
// because system-level events (e.g. a failed login for an unknown email)
// have no authenticated actor yet.
type AuditEntry struct {
	BusinessID   *uuid.UUID
	UserID       *uuid.UUID
	Action       string
	Status       string
	ResourceType string
	ResourceID   *uuid.UUID
	OldValues    any
	NewValues    any
	IPAddress    string
	UserAgent    string
	RequestID    string
}

type AuditService interface {
	Log(ctx context.Context, entry AuditEntry) error
}

type auditService struct {
	repo repository.AuditLogRepository
}

func NewAuditService(repo repository.AuditLogRepository) AuditService {
	return &auditService{repo: repo}
}

func (s *auditService) Log(ctx context.Context, entry AuditEntry) error {
	log := entity.AuditLog{
		BusinessID: entry.BusinessID,
		UserID:     entry.UserID,
		Action:     entry.Action,
		Status:     entry.Status,
		ResourceID: entry.ResourceID,
		OldValues:  marshalOrNil(entry.OldValues),
		NewValues:  marshalOrNil(entry.NewValues),
	}
	if entry.ResourceType != "" {
		log.ResourceType = &entry.ResourceType
	}
	if entry.IPAddress != "" {
		log.IPAddress = &entry.IPAddress
	}
	if entry.UserAgent != "" {
		log.UserAgent = &entry.UserAgent
	}
	if entry.RequestID != "" {
		log.RequestID = &entry.RequestID
	}

	return s.repo.Create(ctx, &log)
}

func marshalOrNil(v any) datatypes.JSON {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return datatypes.JSON(b)
}
