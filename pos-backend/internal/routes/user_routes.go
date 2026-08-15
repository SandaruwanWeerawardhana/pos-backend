package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerUsers(app *fiber.App, h *handler.UserHandler, auth fiber.Handler) {
	group := app.Group("/users", auth)
	group.Get("/", h.List)
	group.Post("/", h.Create)
	group.Get("/:id", h.Get)
	group.Patch("/:id", h.Update)
	group.Delete("/:id", h.Delete)
}
