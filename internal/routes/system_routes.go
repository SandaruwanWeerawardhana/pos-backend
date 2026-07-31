package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func RegisterSystem(app *fiber.App, h *handler.HealthHandler) {
	app.Get("/health", h.Live)
	app.Get("/health/ready", h.Ready)
}
