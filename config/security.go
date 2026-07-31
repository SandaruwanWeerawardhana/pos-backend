package config

import (
	"slices"
	"strings"
	"time"
)

type SecurityConfig struct {
	CORSAllowedOrigins []string `env:"CORS_ALLOWED_ORIGINS" envDefault:"http://localhost:3000" envSeparator:"," validate:"required,min=1"`
	CORSAllowedMethods []string `env:"CORS_ALLOWED_METHODS" envDefault:"GET,POST,PUT,PATCH,DELETE,OPTIONS" envSeparator:"," validate:"required,min=1"`
	CORSAllowedHeaders []string `env:"CORS_ALLOWED_HEADERS" envDefault:"Origin,Content-Type,Accept,Authorization,X-Request-ID,X-Branch-Id" envSeparator:","`
	CORSExposedHeaders []string `env:"CORS_EXPOSED_HEADERS" envDefault:"X-Request-ID,Retry-After" envSeparator:","`
	CORSAllowCreds     bool     `env:"CORS_ALLOW_CREDENTIALS" envDefault:"false"`
	CORSMaxAge         int      `env:"CORS_MAX_AGE" envDefault:"3600" validate:"min=0"`

	RateLimitMax    int           `env:"RATE_LIMIT_MAX" envDefault:"120" validate:"required,min=1"`
	RateLimitWindow time.Duration `env:"RATE_LIMIT_WINDOW" envDefault:"1m" validate:"required"`

	// The auth limiter sits on top of the global one and is the actual
	// brute-force defence for unauthenticated credential endpoints.
	AuthRateLimitMax    int           `env:"AUTH_RATE_LIMIT_MAX" envDefault:"5" validate:"required,min=1"`
	AuthRateLimitWindow time.Duration `env:"AUTH_RATE_LIMIT_WINDOW" envDefault:"15m" validate:"required"`
}

// CORSAllowsWildcard reports whether any configured origin is the "*" wildcard.
func (c SecurityConfig) CORSAllowsWildcard() bool {
	return slices.ContainsFunc(c.CORSAllowedOrigins, func(o string) bool {
		return strings.TrimSpace(o) == "*"
	})
}

type SwaggerConfig struct {
	Enabled bool   `env:"SWAGGER_ENABLED" envDefault:"true"`
	Route   string `env:"SWAGGER_ROUTE" envDefault:"/swagger" validate:"required,startswith=/"`
}
