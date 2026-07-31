package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

type ProductHandler struct {
	products service.ProductService
}

func NewProductHandler(products service.ProductService) *ProductHandler {
	return &ProductHandler{products: products}
}

// List serves GET /products as a bare JSON array — no envelope, no pagination.
// The till caches the whole catalogue for offline selling, and the client's
// productService types the response as Product[] directly.
func (h *ProductHandler) List(c *fiber.Ctx) error {
	products, err := h.products.List(c.UserContext(), middleware.BusinessID(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, mapper.ToProductResponseList(products))
}

// Create serves POST /products, the push half of the catalogue.
//
// A product is created offline in IndexedDB first and pushed on a later sync
// cycle, so the body carries the id the till already assigned it. Replaying a
// push whose response was lost therefore answers 200 with the stored row rather
// than inserting a second copy; a genuinely new product answers 201. Both
// return the full product, so the client can replace its local row with the
// server's canonical version in one step.
func (h *ProductHandler) Create(c *fiber.Ctx) error {
	var req dto.ProductCreateRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}

	id, err := parseID(req.ID, "id")
	if err != nil {
		return err
	}

	businessID := middleware.BusinessID(c)
	product := mapper.ToProductEntity(businessID, id, req)

	result, err := h.products.Create(c.UserContext(), businessID, &product)
	if err != nil {
		return err
	}

	status := fiber.StatusCreated
	if result.AlreadyExisted {
		status = fiber.StatusOK
	}
	return ok(c, status, mapper.ToProductResponse(*result.Product))
}

// Update serves PUT /products/{id}: a full replacement of the product's
// catalogue fields, returning the stored row.
//
// Replacement, not a patch — see dto.ProductUpdateRequest for why. Stock and
// batches are not part of the body and are left as the server holds them, so
// the response is the authoritative copy for the client to write back.
func (h *ProductHandler) Update(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}

	var req dto.ProductUpdateRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}

	product, err := h.products.Update(
		c.UserContext(), middleware.BusinessID(c), id,
		func(p *entity.Product) { mapper.ApplyProductUpdate(p, req) },
	)
	if err != nil {
		return err
	}

	return ok(c, fiber.StatusOK, mapper.ToProductResponse(*product))
}

// Delete serves DELETE /products/{id} → 204.
//
// Soft delete: order items reference the product, so the row has to survive for
// a past receipt to still name what was sold. The partial unique indexes are
// scoped to non-deleted rows, so the SKU and barcode become reusable.
func (h *ProductHandler) Delete(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}

	if err := h.products.Delete(c.UserContext(), middleware.BusinessID(c), id); err != nil {
		return err
	}

	return c.SendStatus(fiber.StatusNoContent)
}
