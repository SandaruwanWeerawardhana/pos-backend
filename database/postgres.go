// Package database holds the infrastructure connectors (Postgres, Redis) and
// the goose migration runner. Nothing here is a package-global — every
// connection is constructed from a typed config.DBConfig/RedisConfig and
// handed to the DI container, which is what makes repositories testable.
package database

import (
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
)

// NewPostgres opens a pooled *gorm.DB per cfg. GORM is a query layer only —
// schema changes always go through goose migrations (see Migrator), never
// AutoMigrate.
func NewPostgres(cfg config.DBConfig) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormLogLevel(cfg.LogLevel)),
	})
	if err != nil {
		return nil, fmt.Errorf("database: open postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("database: unwrap sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)

	return db, nil
}

func gormLogLevel(level string) gormlogger.LogLevel {
	switch level {
	case "silent":
		return gormlogger.Silent
	case "error":
		return gormlogger.Error
	case "info":
		return gormlogger.Info
	default:
		return gormlogger.Warn
	}
}
