package handler

import (
	"github.com/gofiber/fiber/v2"

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
