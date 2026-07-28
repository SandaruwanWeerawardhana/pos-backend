package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerRoles(app *fiber.App, h *handler.RoleHandler, auth fiber.Handler) {
	group := app.Group("/roles", auth)
	group.Get("/", h.List)
	group.Post("/", h.Create)
	group.Get("/:id", h.Get)
	group.Patch("/:id", h.Update)
	group.Delete("/:id", h.Delete)
}
