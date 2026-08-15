package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
)

// CORS must run before the rate limiter (see routes registration order) —
// otherwise a rate-limited preflight returns 429 without CORS headers and
// the browser reports an opaque "network error" instead of the real cause.
func CORS(cfg config.SecurityConfig) fiber.Handler {
	return cors.New(cors.Config{
		AllowOrigins:     strings.Join(cfg.CORSAllowedOrigins, ","),
		AllowMethods:     strings.Join(cfg.CORSAllowedMethods, ","),
		AllowHeaders:     strings.Join(cfg.CORSAllowedHeaders, ","),
		ExposeHeaders:    strings.Join(cfg.CORSExposedHeaders, ","),
		AllowCredentials: cfg.CORSAllowCreds,
		MaxAge:           cfg.CORSMaxAge,
	})
}
