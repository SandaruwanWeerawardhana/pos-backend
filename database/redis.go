package database

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
)

// NewRedis opens a pooled client per cfg and PINGs it before returning, so a
// misconfigured Redis fails at boot instead of on the first request that
// needs the JWT denylist, rate limiter, or permission cache.
func NewRedis(ctx context.Context, cfg config.RedisConfig) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         cfg.Addr(),
		Password:     cfg.Password,
		DB:           cfg.DB,
		PoolSize:     cfg.PoolSize,
		MinIdleConns: cfg.MinIdleConns,
		DialTimeout:  cfg.DialTimeout,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	})

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("database: redis ping: %w", err)
	}

	return client, nil
}
