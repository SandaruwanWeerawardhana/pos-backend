package config

import "time"

type JWTConfig struct {
	Algorithm string `env:"JWT_ALGORITHM" envDefault:"HS256" validate:"required,oneof=HS256 HS384 HS512"`

	// No envDefault on either secret. A defaulted signing key is the single most
	// common way a Go service ships forgeable tokens, so a missing value must
	// fail startup rather than silently work.
	AccessSecret  string `env:"JWT_ACCESS_SECRET" validate:"required,min=32"`
	RefreshSecret string `env:"JWT_REFRESH_SECRET" validate:"required,min=32"`

	AccessTTL  time.Duration `env:"JWT_ACCESS_TTL" envDefault:"15m" validate:"required"`
	RefreshTTL time.Duration `env:"JWT_REFRESH_TTL" envDefault:"720h" validate:"required"`

	Issuer   string `env:"JWT_ISSUER" envDefault:"pos-backend" validate:"required"`
	Audience string `env:"JWT_AUDIENCE" envDefault:"pos-frontend" validate:"required"`
}

type BcryptConfig struct {
	// 12 is ~250ms on commodity hardware. Integration suites override this to
	// the bcrypt minimum via BCRYPT_COST=4.
	Cost int `env:"BCRYPT_COST" envDefault:"12" validate:"required,min=4,max=15"`
}

type AuthConfig struct {
	// RegistrationEnabled gates self-service tenant provisioning. Open
	// registration lets anyone create a business, so deployments that onboard by
	// invitation should turn this off.
	RegistrationEnabled bool `env:"AUTH_REGISTRATION_ENABLED" envDefault:"true"`

	// RefreshCookie switches refresh-token delivery from the JSON body to an
	// HttpOnly cookie, and enables CSRF protection alongside it. See the pass-1
	// plan for the trade-off.
	RefreshCookie bool `env:"AUTH_REFRESH_COOKIE" envDefault:"false"`

	MaxFailedLogins int           `env:"AUTH_MAX_FAILED_LOGINS" envDefault:"10" validate:"required,min=1"`
	LockoutDuration time.Duration `env:"AUTH_LOCKOUT_DURATION" envDefault:"15m" validate:"required"`

	// PermissionCacheTTL bounds how long a revoked permission can still be
	// honoured if an invalidation is missed.
	PermissionCacheTTL time.Duration `env:"AUTH_PERMISSION_CACHE_TTL" envDefault:"5m" validate:"required"`
}

type SeedConfig struct {
	OwnerEmail    string `env:"SEED_OWNER_EMAIL" envDefault:"owner@pos.local" validate:"required,email"`
	OwnerName     string `env:"SEED_OWNER_NAME" envDefault:"System Owner" validate:"required"`
	OwnerPassword string `env:"SEED_OWNER_PASSWORD" envDefault:""`
	BusinessName  string `env:"SEED_BUSINESS_NAME" envDefault:"Demo Grocery" validate:"required"`
	BusinessType  string `env:"SEED_BUSINESS_TYPE" envDefault:"grocery" validate:"required,oneof=grocery bookshop"`
	Demo          bool   `env:"SEED_DEMO" envDefault:"false"`
}
