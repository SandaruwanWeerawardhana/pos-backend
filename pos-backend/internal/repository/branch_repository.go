package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=branch_repository.go -destination=mocks/branch_repository_mock.go -package=mocks

type BranchRepository interface {
	Create(ctx context.Context, b *entity.Branch) error
	FindByID(ctx context.Context, businessID, id uuid.UUID) (*entity.Branch, error)
	FindDefault(ctx context.Context, businessID uuid.UUID) (*entity.Branch, error)
	ListByBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Branch, error)
}

type branchRepository struct {
	db *gorm.DB
}

func NewBranchRepository(db *gorm.DB) BranchRepository {
	return &branchRepository{db: db}
}

func (r *branchRepository) Create(ctx context.Context, b *entity.Branch) error {
	return r.db.WithContext(ctx).Create(b).Error
}

func (r *branchRepository) FindByID(ctx context.Context, businessID, id uuid.UUID) (*entity.Branch, error) {
	var b entity.Branch
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND id = ?", businessID, id).
		First(&b).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &b, nil
}

func (r *branchRepository) FindDefault(ctx context.Context, businessID uuid.UUID) (*entity.Branch, error) {
	var b entity.Branch
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND is_default = true", businessID).
		First(&b).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &b, nil
}

func (r *branchRepository) ListByBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Branch, error) {
	var branches []entity.Branch
	err := r.db.WithContext(ctx).Where("business_id = ?", businessID).Order("is_default DESC, code").Find(&branches).Error
	return branches, err
}
