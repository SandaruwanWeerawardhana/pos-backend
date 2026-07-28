package config

import (
	"net"
	"strconv"
	"time"
)

type RedisConfig struct {
	Host     string `env:"REDIS_HOST" envDefault:"localhost" validate:"required"`
	Port     int    `env:"REDIS_PORT" envDefault:"6379" validate:"required,min=1,max=65535"`
	Password string `env:"REDIS_PASSWORD" envDefault:""`
	DB       int    `env:"REDIS_DB" envDefault:"0" validate:"min=0,max=15"`

	PoolSize     int           `env:"REDIS_POOL_SIZE" envDefault:"10" validate:"required,min=1"`
	MinIdleConns int           `env:"REDIS_MIN_IDLE_CONNS" envDefault:"2" validate:"min=0"`
	DialTimeout  time.Duration `env:"REDIS_DIAL_TIMEOUT" envDefault:"5s" validate:"required"`
	ReadTimeout  time.Duration `env:"REDIS_READ_TIMEOUT" envDefault:"3s" validate:"required"`
	WriteTimeout time.Duration `env:"REDIS_WRITE_TIMEOUT" envDefault:"3s" validate:"required"`
}

func (c RedisConfig) Addr() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}
