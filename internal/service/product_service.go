package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type ProductService interface {
	List(ctx context.Context, businessID uuid.UUID) ([]entity.Product, error)
}

type productService struct {
	products repository.ProductRepository
}

func NewProductService(products repository.ProductRepository) ProductService {
	return &productService{products: products}
}

// List returns the whole catalogue for a business. Unpaginated by design: the
// till caches it in IndexedDB and sells offline from that copy, so a truncated
// response would leave it unable to ring up whatever was cut off.
func (s *productService) List(ctx context.Context, businessID uuid.UUID) ([]entity.Product, error) {
	products, err := s.products.ListForBusiness(ctx, businessID)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load products", err)
	}
	return products, nil
}
