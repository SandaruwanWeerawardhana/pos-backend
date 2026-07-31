package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerOrders(app *fiber.App, h *handler.OrderHandler, auth fiber.Handler) {
	group := app.Group("/orders", auth)
	group.Post("/sync", h.Sync)
}
