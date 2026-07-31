package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=product_repository.go -destination=mocks/product_repository_mock.go -package=mocks

// ProductRepository reads the catalogue. Phase 1 is read-only from the client's
// point of view — the till pulls the whole catalogue and never pushes a product
// back — so there is no Create/Update here yet.
type ProductRepository interface {
	// ListForBusiness returns the full catalogue with batches preloaded. The
	// client caches it wholesale in IndexedDB, so this is deliberately not
	// paginated: a partial page would leave the till unable to sell whatever
	// was cut off.
	ListForBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Product, error)
	// FindManyByID loads a subset in one query, for order sync resolving the
	// products named by a batch of sold lines.
	FindManyByID(ctx context.Context, businessID uuid.UUID, ids []uuid.UUID) ([]entity.Product, error)
}

type productRepository struct {
	db *gorm.DB
}

func NewProductRepository(db *gorm.DB) ProductRepository {
	return &productRepository{db: db}
}

func (r *productRepository) ListForBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Product, error) {
	var products []entity.Product
	err := r.db.WithContext(ctx).
		Preload("Batches").
		Where("business_id = ?", businessID).
		Order("name").
		Find(&products).Error
	return products, err
}

func (r *productRepository) FindManyByID(ctx context.Context, businessID uuid.UUID, ids []uuid.UUID) ([]entity.Product, error) {
	if len(ids) == 0 {
		return []entity.Product{}, nil
	}
	var products []entity.Product
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND id IN ?", businessID, ids).
		Find(&products).Error
	return products, err
}
