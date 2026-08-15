package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=business_repository.go -destination=mocks/business_repository_mock.go -package=mocks

// BusinessRepository persists the tenant root. Unlike every other
// repository, its reads are not business_id-scoped — a business scopes
// itself.
type BusinessRepository interface {
	Create(ctx context.Context, b *entity.Business) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Business, error)
	FindBySlug(ctx context.Context, slug string) (*entity.Business, error)
	ExistsBySlug(ctx context.Context, slug string) (bool, error)
	SetOwner(ctx context.Context, businessID, userID uuid.UUID) error
	Update(ctx context.Context, b *entity.Business) error
}

type businessRepository struct {
	db *gorm.DB
}

func NewBusinessRepository(db *gorm.DB) BusinessRepository {
	return &businessRepository{db: db}
}

func (r *businessRepository) Create(ctx context.Context, b *entity.Business) error {
	return r.db.WithContext(ctx).Create(b).Error
}

func (r *businessRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Business, error) {
	var b entity.Business
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&b).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &b, nil
}

func (r *businessRepository) FindBySlug(ctx context.Context, slug string) (*entity.Business, error) {
	var b entity.Business
	err := r.db.WithContext(ctx).Where("slug = ?", slug).First(&b).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &b, nil
}

func (r *businessRepository) ExistsBySlug(ctx context.Context, slug string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&entity.Business{}).Where("slug = ?", slug).Count(&count).Error
	return count > 0, err
}

func (r *businessRepository) SetOwner(ctx context.Context, businessID, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&entity.Business{}).
		Where("id = ?", businessID).
		Update("owner_user_id", userID).Error
}

func (r *businessRepository) Update(ctx context.Context, b *entity.Business) error {
	return r.db.WithContext(ctx).Save(b).Error
}
