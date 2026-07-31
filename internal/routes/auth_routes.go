package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

// Paths here are fixed by the client, which is already written: see the calls in
// pos-frontend/src/lib/services/auth.service.ts. /auth/password/* and
// /auth/profile are what it requests, so they are not free to rename.
func registerAuth(app *fiber.App, h *handler.AuthHandler, auth, strictLimit fiber.Handler) {
	group := app.Group("/auth")

	// Unauthenticated, so all strictly rate-limited: these are the endpoints
	// reachable without a token, where credential stuffing and reset-token
	// fishing would otherwise be free.
	group.Post("/register", strictLimit, h.Register)
	group.Post("/login", strictLimit, h.Login)
	group.Post("/refresh", strictLimit, h.Refresh)
	group.Post("/password/reset-request", strictLimit, h.RequestPasswordReset)
	group.Post("/password/reset", strictLimit, h.ResetPassword)

	group.Post("/logout", auth, h.Logout)
	group.Post("/logout-all", auth, h.LogoutAll)
	group.Get("/me", auth, h.Me)
	group.Patch("/profile", auth, h.UpdateProfile)
	group.Post("/password/change", auth, h.ChangePassword)
}
