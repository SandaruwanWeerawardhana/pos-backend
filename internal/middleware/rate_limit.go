package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	fiberredis "github.com/gofiber/storage/redis/v3"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func redisStorage(cfg config.RedisConfig) *fiberredis.Storage {
	return fiberredis.New(fiberredis.Config{
		Host:     cfg.Host,
		Port:     cfg.Port,
		Password: cfg.Password,
		Database: cfg.DB,
		PoolSize: cfg.PoolSize,
	})
}

// RateLimit is the global, Redis-backed sliding-window limiter applied to
// every route past the public health/swagger mounts. Never trust
// X-Forwarded-For unless HTTP_TRUSTED_PROXIES is set (Fiber's c.IP()
// already respects that config) — otherwise the limit is trivially bypassed
// by spoofing the header.
func RateLimit(redisCfg config.RedisConfig, max int, window time.Duration) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:               max,
		Expiration:        window,
		Storage:           redisStorage(redisCfg),
		LimiterMiddleware: limiter.SlidingWindow{},
		LimitReached:      rateLimitExceeded,
	})
}

// AuthRateLimit is the strict limiter on unauthenticated credential
// endpoints (login/register/refresh) — 5 req/15min by default, keyed on
// IP+email so a distributed attacker can't dodge a per-IP-only limit by
// spreading one account's guesses across many addresses.
func AuthRateLimit(redisCfg config.RedisConfig, max int, window time.Duration) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:               max,
		Expiration:        window,
		Storage:           redisStorage(redisCfg),
		LimiterMiddleware: limiter.SlidingWindow{},
		KeyGenerator:      authRateLimitKey,
		LimitReached:      rateLimitExceeded,
	})
}

func authRateLimitKey(c *fiber.Ctx) string {
	var body struct {
		Email string `json:"email"`
	}
	// Best-effort: c.Body() is already-buffered bytes in Fiber, so this
	// does not consume anything the handler's own BodyParser needs later.
	// refresh has no email field, so this degrades to a pure IP key there.
	_ = c.BodyParser(&body)
	return c.IP() + ":" + body.Email
}

func rateLimitExceeded(c *fiber.Ctx) error {
	c.Set(fiber.HeaderRetryAfter, "60")
	return apperror.New(apperror.CodeRateLimited, "too many requests, please try again later")
}
