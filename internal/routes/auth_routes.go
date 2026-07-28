package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

func registerAuth(app *fiber.App, h *handler.AuthHandler, auth, strictLimit fiber.Handler) {
	group := app.Group("/auth")
	group.Post("/register", strictLimit, h.Register)
	group.Post("/login", strictLimit, h.Login)
	group.Post("/refresh", strictLimit, h.Refresh)

	group.Post("/logout", auth, h.Logout)
	group.Post("/logout-all", auth, h.LogoutAll)
	group.Get("/me", auth, h.Me)
	group.Patch("/me", auth, h.UpdateMe)
	group.Post("/change-password", auth, h.ChangePassword)
}
