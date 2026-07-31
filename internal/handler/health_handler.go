package handler

import (
	"database/sql"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type HealthHandler struct {
	db    *sql.DB
	redis *redis.Client
}

func NewHealthHandler(db *sql.DB, redisClient *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: redisClient}
}

func (h *HealthHandler) Live(c *fiber.Ctx) error {
	return ok(c, fiber.StatusOK, fiber.Map{"status": "ok"})
}

func (h *HealthHandler) Ready(c *fiber.Ctx) error {
	ctx := c.UserContext()
	if err := h.db.PingContext(ctx); err != nil {
		return apperror.Wrap(apperror.CodeServiceUnavailable, "database unavailable", err)
	}
	if err := h.redis.Ping(ctx).Err(); err != nil {
		return apperror.Wrap(apperror.CodeServiceUnavailable, "redis unavailable", err)
	}
	return ok(c, fiber.StatusOK, fiber.Map{
		"status":   "ready",
		"database": "ok",
		"redis":    "ok",
	})
}
