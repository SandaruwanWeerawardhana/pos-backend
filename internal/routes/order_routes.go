package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerOrders(app *fiber.App, h *handler.OrderHandler, auth fiber.Handler) {
	group := app.Group("/orders", auth)
	/*
		Registered before the parameterised route: Fiber matches in declaration
		order, so "/sync" would otherwise be swallowed as a client_generated_id.
	*/
	group.Post("/sync", h.Sync)
	group.Get("/", h.List)
	group.Get("/:clientGeneratedID", h.Get)
}
