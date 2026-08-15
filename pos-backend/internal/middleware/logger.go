package middleware

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Logger writes one structured line per request after it completes, so the
// final status code and latency are known at log time — a deferred write,
// not a pre-request one. base should already carry the app's configured
// level/format (see pkg/logger.New).
func Logger(base *slog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		handlerErr := c.Next()

		status := c.Response().StatusCode()
		level := slog.LevelInfo
		switch {
		case status >= 500:
			level = slog.LevelError
		case status >= 400:
			level = slog.LevelWarn
		}

		attrs := []any{
			"method", c.Method(),
			"path", c.Path(),
			"status", status,
			"latency_ms", time.Since(start).Milliseconds(),
			"request_id", RequestIDFromFiber(c),
			"ip", c.IP(),
		}
		if handlerErr != nil {
			attrs = append(attrs, "error", handlerErr.Error())
		}
		base.Log(c.Context(), level, "http_request", attrs...)

		return handlerErr
	}
}
