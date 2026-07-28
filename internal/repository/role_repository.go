package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=role_repository.go -destination=mocks/role_repository_mock.go -package=mocks

// RoleRepository persists roles and their permission assignments. A role's
// business_id is NULL for a global system role (owner/manager/cashier/
// warehouse_staff); ListForBusiness returns both a business's own roles and
// every system role.
type RoleRepository interface {
	Create(ctx context.Context, r *entity.Role) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Role, error)
	FindByName(ctx context.Context, businessID *uuid.UUID, name string) (*entity.Role, error)
	ListForBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Role, error)
	Update(ctx context.Context, r *entity.Role) error
	Delete(ctx context.Context, businessID, id uuid.UUID) error

	// SetPermissions replaces a role's permission assignments in one call —
	// run inside a TxManager transaction when it isn't the operation's only
	// write.
	SetPermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error
	ListPermissionIDs(ctx context.Context, roleID uuid.UUID) ([]uuid.UUID, error)
	ListPermissionNames(ctx context.Context, roleID uuid.UUID) ([]string, error)
	// ListPermissionNamesForRoles aggregates and dedupes permission names
	// across several roles — used to build a user's effective permission
	// claim from all of their assigned roles.
	ListPermissionNamesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error)
}

type roleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) RoleRepository {
	return &roleRepository{db: db}
}

func (r *roleRepository) Create(ctx context.Context, role *entity.Role) error {
	return r.db.WithContext(ctx).Create(role).Error
}

func (r *roleRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Role, error) {
	var role entity.Role
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&role).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &role, nil
}

func (r *roleRepository) FindByName(ctx context.Context, businessID *uuid.UUID, name string) (*entity.Role, error) {
	q := r.db.WithContext(ctx).Where("name = ?", name)
	if businessID == nil {
		q = q.Where("business_id IS NULL")
	} else {
		q = q.Where("business_id = ?", *businessID)
	}

	var role entity.Role
	if err := q.First(&role).Error; err != nil {
		return nil, wrapNotFound(err)
	}
	return &role, nil
}

func (r *roleRepository) ListForBusiness(ctx context.Context, businessID uuid.UUID) ([]entity.Role, error) {
	var roles []entity.Role
	err := r.db.WithContext(ctx).
		Where("business_id = ? OR business_id IS NULL", businessID).
		Order("level DESC, name").
		Find(&roles).Error
	return roles, err
}

func (r *roleRepository) Update(ctx context.Context, role *entity.Role) error {
	return r.db.WithContext(ctx).Save(role).Error
}

func (r *roleRepository) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	res := r.db.WithContext(ctx).
		Where("business_id = ? AND id = ? AND is_system = false", businessID, id).
		Delete(&entity.Role{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *roleRepository) SetPermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error {
	db := r.db.WithContext(ctx)
	if err := db.Where("role_id = ?", roleID).Delete(&entity.RolePermission{}).Error; err != nil {
		return err
	}
	if len(permissionIDs) == 0 {
		return nil
	}

	rows := make([]entity.RolePermission, 0, len(permissionIDs))
	for _, permissionID := range permissionIDs {
		rows = append(rows, entity.RolePermission{RoleID: roleID, PermissionID: permissionID, Effect: entity.EffectAllow})
	}
	return db.Create(&rows).Error
}

func (r *roleRepository) ListPermissionIDs(ctx context.Context, roleID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&entity.RolePermission{}).
		Where("role_id = ? AND effect = ?", roleID, entity.EffectAllow).
		Pluck("permission_id", &ids).Error
	return ids, err
}

func (r *roleRepository) ListPermissionNames(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	return r.ListPermissionNamesForRoles(ctx, []uuid.UUID{roleID})
}

func (r *roleRepository) ListPermissionNamesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error) {
	if len(roleIDs) == 0 {
		return []string{}, nil
	}

	var names []string
	err := r.db.WithContext(ctx).
		Model(&entity.Permission{}).
		Distinct("permissions.name").
		Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Where("role_permissions.role_id IN ? AND role_permissions.effect = ?", roleIDs, entity.EffectAllow).
		Pluck("permissions.name", &names).Error
	return names, err
}
