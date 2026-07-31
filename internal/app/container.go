package app

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
	"github.com/SandaruwanWeerawardhana/pos-backend/database"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/routes"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	pkgjwt "github.com/SandaruwanWeerawardhana/pos-backend/pkg/jwt"
	pkglogger "github.com/SandaruwanWeerawardhana/pos-backend/pkg/logger"
)

const auditQueueSize = 1024

type Container struct {
	Config      *config.Config
	Logger      *slog.Logger
	DB          *gorm.DB
	Redis       *redis.Client
	Tokens      service.TokenService
	Permissions service.PermissionService
	AuditWorker *middleware.AuditWorker
	Handlers    routes.Handlers
	Health      *handler.HealthHandler
}

func NewContainer(ctx context.Context) (*Container, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	logger := pkglogger.New(cfg.App.LogFormat, cfg.App.LogLevel)

	db, err := database.NewPostgres(cfg.DB)
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("app: unwrap postgres: %w", err)
	}
	closeDB := true
	defer func() {
		if closeDB {
			_ = sqlDB.Close()
		}
	}()

	if cfg.DB.AutoMigrate {
		migrator, migrateErr := database.NewMigrator(sqlDB)
		if migrateErr != nil {
			return nil, migrateErr
		}
		if migrateErr = migrator.Up(); migrateErr != nil {
			return nil, fmt.Errorf("app: migrate database: %w", migrateErr)
		}
	}

	redisClient, err := database.NewRedis(ctx, cfg.Redis)
	if err != nil {
		return nil, err
	}

	users := repository.NewUserRepository(db)
	businesses := repository.NewBusinessRepository(db)
	branches := repository.NewBranchRepository(db)
	roles := repository.NewRoleRepository(db)
	permissions := repository.NewPermissionRepository(db)
	refreshTokens := repository.NewRefreshTokenRepository(db)
	passwordResets := repository.NewPasswordResetRepository(db)
	auditLogs := repository.NewAuditLogRepository(db)
	products := repository.NewProductRepository(db)
	orders := repository.NewOrderRepository(db)
	stock := repository.NewStockRepository(db)
	tx := repository.NewTxManager(db)

	issuer := pkgjwt.NewIssuer(
		cfg.JWT.AccessSecret,
		cfg.JWT.Issuer,
		cfg.JWT.Audience,
		cfg.JWT.AccessTTL,
	)
	tokenService := service.NewTokenService(refreshTokens, redisClient, issuer, cfg.JWT.RefreshTTL)
	auditService := service.NewAuditService(auditLogs)
	auditWorker := middleware.NewAuditWorker(auditService, auditQueueSize, logger)
	authService := service.NewAuthService(service.AuthServiceDeps{
		Users:      users,
		Businesses: businesses,
		Branches:   branches,
		Roles:      roles,
		Tokens:     tokenService,
		Audit:      auditWorker,
		Tx:         tx,
		NewTxRepos: service.DefaultTxRepos,
	}, service.AuthServiceConfig{
		BcryptCost:          cfg.Bcrypt.Cost,
		MaxFailedLogins:     cfg.Auth.MaxFailedLogins,
		LockoutDuration:     cfg.Auth.LockoutDuration,
		RegistrationEnabled: cfg.Auth.RegistrationEnabled,
	})
	userService := service.NewUserService(users, cfg.Bcrypt.Cost, roles)
	roleService := service.NewRoleService(roles)
	permissionService := service.NewPermissionService(permissions)
	passwordResetService := service.NewPasswordResetService(
		users, passwordResets, tokenService, cfg.Bcrypt.Cost,
	)
	productService := service.NewProductService(products)
	orderSyncService := service.NewOrderSyncService(
		orders, stock, tx, service.DefaultOrderTxRepos,
	)

	closeDB = false
	return &Container{
		Config:      cfg,
		Logger:      logger,
		DB:          db,
		Redis:       redisClient,
		Tokens:      tokenService,
		Permissions: permissionService,
		AuditWorker: auditWorker,
		Handlers: routes.Handlers{
			// The reset token is echoed back in the response only in a local
			// environment, where there is no mail server to deliver it.
			Auth:    handler.NewAuthHandler(authService, passwordResetService, cfg.App.IsLocal()),
			User:    handler.NewUserHandler(userService),
			Role:    handler.NewRoleHandler(roleService),
			Product: handler.NewProductHandler(productService),
			Order:   handler.NewOrderHandler(orderSyncService),
		},
		Health: handler.NewHealthHandler(sqlDB, redisClient),
	}, nil
}

func (c *Container) Close() error {
	c.AuditWorker.Close()

	var closeErr error
	if sqlDB, err := c.DB.DB(); err != nil {
		closeErr = err
	} else if err = sqlDB.Close(); err != nil {
		closeErr = err
	}
	if err := c.Redis.Close(); err != nil && closeErr == nil {
		closeErr = err
	}
	return closeErr
}
