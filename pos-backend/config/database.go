package config

import (
	"fmt"
	"net"
	"strconv"
	"time"
)

type DBConfig struct {
	Host     string `env:"DB_HOST" envDefault:"localhost" validate:"required"`
	Port     int    `env:"DB_PORT" envDefault:"5432" validate:"required,min=1,max=65535"`
	User     string `env:"DB_USER" envDefault:"postgres" validate:"required"`
	Password string `env:"DB_PASSWORD" envDefault:""`
	Name     string `env:"DB_NAME" envDefault:"pos" validate:"required"`
	SSLMode  string `env:"DB_SSLMODE" envDefault:"disable" validate:"required,oneof=disable allow prefer require verify-ca verify-full"`
	TimeZone string `env:"DB_TIMEZONE" envDefault:"UTC" validate:"required"`

	MaxOpenConns    int           `env:"DB_MAX_OPEN_CONNS" envDefault:"25" validate:"required,min=1"`
	MaxIdleConns    int           `env:"DB_MAX_IDLE_CONNS" envDefault:"5" validate:"required,min=1"`
	ConnMaxLifetime time.Duration `env:"DB_CONN_MAX_LIFETIME" envDefault:"1h" validate:"required"`
	ConnMaxIdleTime time.Duration `env:"DB_CONN_MAX_IDLE_TIME" envDefault:"10m" validate:"required"`

	LogLevel string `env:"DB_LOG_LEVEL" envDefault:"warn" validate:"required,oneof=silent error warn info"`

	// AutoMigrate runs goose migrations on API boot. Convenient locally and in
	// compose; in production migration is a separate deploy step so a rolling
	// restart never races the schema.
	AutoMigrate bool `env:"DB_AUTO_MIGRATE" envDefault:"true"`
}

// DSN builds a key/value libpq connection string. Values are not quoted, so
// they must not contain spaces; DSNURL is the escape hatch for passwords that
// do.
func (c DBConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode, c.TimeZone,
	)
}

func (c DBConfig) Addr() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}
