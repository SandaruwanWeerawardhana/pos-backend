package middleware

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/ctxkey"
)

const (
	HeaderRequestID    = "X-Request-ID"
	requestIDLocalsKey = "requestid"
)

// RequestID assigns (or echoes) a request id, exposes it on the response
// header, and stores it on both Fiber Locals and the request's stdlib
// context.Context (under pkg/ctxkey.RequestID) — the latter is what lets
// pkg/logger.FromContext and every downstream service call see the same id
// a plain *fiber.Ctx can't be threaded into.
func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Get(HeaderRequestID)
		if id == "" {
			id = uuid.NewString()
		}
		c.Locals(requestIDLocalsKey, id)
		c.Set(HeaderRequestID, id)
		c.SetUserContext(context.WithValue(c.UserContext(), ctxkey.RequestID, id))
		return c.Next()
	}
}

// RequestIDFromFiber reads the id set by RequestID(), for middleware and
// handlers that only have a *fiber.Ctx.
func RequestIDFromFiber(c *fiber.Ctx) string {
	id, _ := c.Locals(requestIDLocalsKey).(string)
	return id
}
