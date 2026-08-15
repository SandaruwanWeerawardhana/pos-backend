package repository

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=permission_repository.go -destination=mocks/permission_repository_mock.go -package=mocks

// PermissionRepository persists the system-global permission catalogue.
// Permissions are never business-scoped and never deleted through the API.
type PermissionRepository interface {
	// Upsert inserts a (resource, action) permission if it doesn't already
	// exist, or updates its description if it does. The seeder relies on
	// this to be idempotent across repeated runs.
	Upsert(ctx context.Context, resource, action, description string) (*entity.Permission, error)
	List(ctx context.Context) ([]entity.Permission, error)
}

type permissionRepository struct {
	db *gorm.DB
}

func NewPermissionRepository(db *gorm.DB) PermissionRepository {
	return &permissionRepository{db: db}
}

func (r *permissionRepository) Upsert(ctx context.Context, resource, action, description string) (*entity.Permission, error) {
	p := entity.Permission{Resource: resource, Action: action, Description: &description}

	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "resource"}, {Name: "action"}},
			DoUpdates: clause.AssignmentColumns([]string{"description", "updated_at"}),
		}).
		Create(&p).Error
	if err != nil {
		return nil, err
	}

	// clause.OnConflict with DoUpdates doesn't populate the struct with the
	// existing row's id on a conflict path in every driver version, so
	// re-read to be certain the caller gets the real row.
	var out entity.Permission
	err = r.db.WithContext(ctx).Where("resource = ? AND action = ?", resource, action).First(&out).Error
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *permissionRepository) List(ctx context.Context) ([]entity.Permission, error) {
	var perms []entity.Permission
	err := r.db.WithContext(ctx).Order("resource, action").Find(&perms).Error
	return perms, err
}
