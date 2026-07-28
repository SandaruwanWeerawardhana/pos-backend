package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=audit_log_repository.go -destination=mocks/audit_log_repository_mock.go -package=mocks

// AuditLogRepository persists append-only audit events. Nothing ever
// updates or deletes a row here.
type AuditLogRepository interface {
	Create(ctx context.Context, a *entity.AuditLog) error
	ListForBusiness(ctx context.Context, businessID uuid.UUID, offset, limit int) ([]entity.AuditLog, int64, error)
}

type auditLogRepository struct {
	db *gorm.DB
}

func NewAuditLogRepository(db *gorm.DB) AuditLogRepository {
	return &auditLogRepository{db: db}
}

func (r *auditLogRepository) Create(ctx context.Context, a *entity.AuditLog) error {
	return r.db.WithContext(ctx).Create(a).Error
}

func (r *auditLogRepository) ListForBusiness(ctx context.Context, businessID uuid.UUID, offset, limit int) ([]entity.AuditLog, int64, error) {
	q := r.db.WithContext(ctx).Model(&entity.AuditLog{}).Where("business_id = ?", businessID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var logs []entity.AuditLog
	err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	return logs, total, nil
}
