package config

import (
	"fmt"
	"time"
)

// Application environments. Anything outside this set is rejected at startup.
const (
	EnvLocal   = "local"
	EnvTest    = "test"
	EnvDev     = "dev"
	EnvStaging = "staging"
	EnvProd    = "prod"
)

type AppConfig struct {
	Env       string `env:"APP_ENV" envDefault:"local" validate:"required,oneof=local test dev staging prod"`
	Name      string `env:"APP_NAME" envDefault:"pos-backend" validate:"required"`
	URL       string `env:"APP_URL" envDefault:"http://localhost:8080" validate:"required,url"`
	LogLevel  string `env:"LOG_LEVEL" envDefault:"debug" validate:"required,oneof=debug info warn error"`
	LogFormat string `env:"LOG_FORMAT" envDefault:"text" validate:"required,oneof=text json"`
}

func (c AppConfig) IsProd() bool  { return c.Env == EnvProd }
func (c AppConfig) IsLocal() bool { return c.Env == EnvLocal }
func (c AppConfig) IsTest() bool  { return c.Env == EnvTest }

// UsesDotEnv reports whether a .env file should be read. Only local and test
// do; every deployed environment gets its config from real environment
// variables so a stray .env can never override them.
func (c AppConfig) UsesDotEnv() bool { return c.IsLocal() || c.IsTest() }

type HTTPConfig struct {
	Port            int           `env:"APP_PORT" envDefault:"8080" validate:"required,min=1,max=65535"`
	ReadTimeout     time.Duration `env:"HTTP_READ_TIMEOUT" envDefault:"15s" validate:"required"`
	WriteTimeout    time.Duration `env:"HTTP_WRITE_TIMEOUT" envDefault:"15s" validate:"required"`
	IdleTimeout     time.Duration `env:"HTTP_IDLE_TIMEOUT" envDefault:"60s" validate:"required"`
	ShutdownTimeout time.Duration `env:"HTTP_SHUTDOWN_TIMEOUT" envDefault:"15s" validate:"required"`
	BodyLimit       int           `env:"HTTP_BODY_LIMIT" envDefault:"4194304" validate:"required,min=1024"`

	// TrustedProxies must be set before any X-Forwarded-For header is honoured.
	// Left empty, the rate limiter keys on the direct peer address, which is the
	// only value a client cannot forge.
	TrustedProxies []string `env:"HTTP_TRUSTED_PROXIES" envSeparator:","`
}

func (c HTTPConfig) Addr() string { return fmt.Sprintf(":%d", c.Port) }
