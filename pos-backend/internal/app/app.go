package app

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/routes"
)

func New(container *Container) *fiber.App {
	cfg := container.Config
	app := fiber.New(fiber.Config{
		AppName:                 cfg.App.Name,
		BodyLimit:               cfg.HTTP.BodyLimit,
		ReadTimeout:             cfg.HTTP.ReadTimeout,
		WriteTimeout:            cfg.HTTP.WriteTimeout,
		IdleTimeout:             cfg.HTTP.IdleTimeout,
		EnableTrustedProxyCheck: len(cfg.HTTP.TrustedProxies) > 0,
		TrustedProxies:          cfg.HTTP.TrustedProxies,
		ErrorHandler:            middleware.ErrorHandler(container.Logger),
	})

	app.Use(middleware.Recover())
	app.Use(middleware.RequestID())
	app.Use(middleware.Logger(container.Logger))
	app.Use(middleware.Helmet())
	app.Use(middleware.CORS(cfg.Security))
	app.Use(middleware.Compress())

	routes.RegisterSystem(app, container.Health)

	app.Use(middleware.RateLimit(
		cfg.Redis,
		cfg.Security.RateLimitMax,
		cfg.Security.RateLimitWindow,
	))
	routes.Register(
		app,
		container.Handlers,
		middleware.Auth(container.Tokens),
		middleware.AuthRateLimit(
			cfg.Redis,
			cfg.Security.AuthRateLimitMax,
			cfg.Security.AuthRateLimitWindow,
		),
	)
	return app
}
