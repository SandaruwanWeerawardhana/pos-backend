package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerProducts(app *fiber.App, h *handler.ProductHandler, auth fiber.Handler) {
	group := app.Group("/products", auth)
	group.Get("/", h.List)
	group.Post("/", h.Create)
	group.Put("/:id", h.Update)
	group.Delete("/:id", h.Delete)
}
