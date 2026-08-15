package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
)

type Handlers struct {
	Auth    *handler.AuthHandler
	User    *handler.UserHandler
	Role    *handler.RoleHandler
	Product *handler.ProductHandler
	Order   *handler.OrderHandler
}

func Register(app *fiber.App, handlers Handlers, auth, authRateLimit fiber.Handler) {
	registerAuth(app, handlers.Auth, auth, authRateLimit)
	registerUsers(app, handlers.User, auth)
	registerRoles(app, handlers.Role, auth)
	registerProducts(app, handlers.Product, auth)
	registerOrders(app, handlers.Order, auth)
}
