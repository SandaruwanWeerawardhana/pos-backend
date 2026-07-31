package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

// CreateProductResult reports which of the two success paths a push took, so
// the handler can answer 201 for a new row and 200 for a replay of one already
// stored. The client treats both as done; the distinction exists so a replay is
// not read as a fresh insert.
type CreateProductResult struct {
	Product        *entity.Product
	AlreadyExisted bool
}

// ApplyProductUpdate mutates a loaded product in place with the caller's edit.
// Passed in as a function so the service stays free of internal/dto, which the
// depguard rules keep out of this layer.
type ApplyProductUpdate func(p *entity.Product)

type ProductService interface {
	List(ctx context.Context, businessID uuid.UUID) ([]entity.Product, error)
	Create(ctx context.Context, businessID uuid.UUID, p *entity.Product) (CreateProductResult, error)
	Update(ctx context.Context, businessID, id uuid.UUID, apply ApplyProductUpdate) (*entity.Product, error)
	Delete(ctx context.Context, businessID, id uuid.UUID) error
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

// Create stores a product the till created offline.
//
// Two conflicts are possible and they are not the same thing:
//
//   - The same id is already stored — a replayed push whose first response was
//     lost. Reported as success with AlreadyExisted set, because the client's
//     copy and the server's are the same row; an error here would leave the
//     till retrying the same product forever.
//   - A *different* product already holds this SKU or barcode — a real clash
//     only the operator can resolve, so it is a 409 the client stops retrying
//     on rather than a transient error it backs off from.
func (s *productService) Create(ctx context.Context, businessID uuid.UUID, p *entity.Product) (CreateProductResult, error) {
	p.BusinessID = businessID

	existing, err := s.products.FindByIdentifier(ctx, businessID, p.SKU, p.Barcode)
	switch {
	case err == nil && existing.ID == p.ID:
		return CreateProductResult{Product: existing, AlreadyExisted: true}, nil
	case err == nil && existing.SKU == p.SKU:
		return CreateProductResult{}, apperror.New(
			apperror.CodeConflict, "a product with this SKU already exists",
		)
	case err == nil:
		return CreateProductResult{}, apperror.New(
			apperror.CodeConflict, "a product with this barcode already exists",
		)
	case !errors.Is(err, repository.ErrNotFound):
		return CreateProductResult{}, apperror.Wrap(
			apperror.CodeDatabase, "failed to check existing product", err,
		)
	}

	// Still guarded by the primary-key conflict below: the check above races
	// with a concurrent push of the same product from a second till.
	if err := s.products.Create(ctx, p); err != nil {
		if errors.Is(err, repository.ErrAlreadyExists) {
			return CreateProductResult{Product: p, AlreadyExisted: true}, nil
		}
		return CreateProductResult{}, apperror.Wrap(
			apperror.CodeDatabase, "failed to create product", err,
		)
	}

	return CreateProductResult{Product: p}, nil
}

// Update replaces a product's catalogue fields.
//
// The product is loaded first so the edit applies to the stored row rather than
// to whatever the client believed it held — that is what keeps stock_quantity
// and the batches out of the client's reach while still returning a complete
// product in the response.
func (s *productService) Update(
	ctx context.Context, businessID, id uuid.UUID, apply ApplyProductUpdate,
) (*entity.Product, error) {
	product, err := s.products.FindByID(ctx, businessID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "product not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load product", err)
	}

	apply(product)

	if err := s.assertIdentifiersFree(ctx, businessID, product); err != nil {
		return nil, err
	}

	if err := s.products.Update(ctx, product); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "product not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to update product", err)
	}

	return product, nil
}

// Delete soft-deletes a product. Deleting one already gone is a 404 rather than
// a silent success: the till only pushes a delete for a row it has, so a miss
// means the two sides disagree about what exists and that should be visible.
func (s *productService) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	if err := s.products.Delete(ctx, businessID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperror.New(apperror.CodeNotFound, "product not found")
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to delete product", err)
	}
	return nil
}

// assertIdentifiersFree rejects a SKU or barcode that belongs to a different
// product in the same business. Matching this product's own id is expected —
// an edit that leaves the identifiers alone finds itself.
func (s *productService) assertIdentifiersFree(
	ctx context.Context, businessID uuid.UUID, p *entity.Product,
) error {
	existing, err := s.products.FindByIdentifier(ctx, businessID, p.SKU, p.Barcode)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		return nil
	case err != nil:
		return apperror.Wrap(apperror.CodeDatabase, "failed to check existing product", err)
	case existing.ID == p.ID:
		return nil
	case existing.SKU == p.SKU:
		return apperror.New(apperror.CodeConflict, "a product with this SKU already exists")
	default:
		return apperror.New(apperror.CodeConflict, "a product with this barcode already exists")
	}
}
