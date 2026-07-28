package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=user_repository.go -destination=mocks/user_repository_mock.go -package=mocks

// UserRepository persists users, always scoped to a business — the tenant
// isolation rule (a cross-tenant read returns 404, never 403) depends on
// every method here filtering by business_id in the same query as id.
type UserRepository interface {
	Create(ctx context.Context, u *entity.User) error
	FindByID(ctx context.Context, businessID, id uuid.UUID) (*entity.User, error)
	FindByEmail(ctx context.Context, businessID uuid.UUID, email string) (*entity.User, error)

	// FindByEmailGlobal and FindByIDGlobal skip the business_id filter.
	// Only for internal flows that already trust the lookup key (login,
	// which the frontend contract keys on email alone with no business
	// selector; and refresh-token rotation, which trusts the user id
	// embedded in an already-verified refresh token) — never call these
	// with a client-supplied id from a URL param, or the tenant-isolation
	// rule (404 not 403) is bypassed.
	FindByEmailGlobal(ctx context.Context, email string) (*entity.User, error)
	FindByIDGlobal(ctx context.Context, id uuid.UUID) (*entity.User, error)

	List(ctx context.Context, businessID uuid.UUID, offset, limit int, sort, order, search string) ([]entity.User, int64, error)
	Update(ctx context.Context, u *entity.User) error
	IncrementFailedLogins(ctx context.Context, id uuid.UUID) (int, error)
	ResetFailedLogins(ctx context.Context, id uuid.UUID) error
	Lock(ctx context.Context, id uuid.UUID, until time.Time) error
	Delete(ctx context.Context, businessID, id uuid.UUID) error

	// AssignRoles replaces a user's role assignments in one call — the
	// caller is expected to run this inside a TxManager transaction when it
	// isn't the only write in the operation.
	AssignRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID, branchID *uuid.UUID) error
	ListRoleIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
	ListRoleNames(ctx context.Context, userID uuid.UUID) ([]string, error)
}

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, u *entity.User) error {
	return r.db.WithContext(ctx).Create(u).Error
}

func (r *userRepository) FindByID(ctx context.Context, businessID, id uuid.UUID) (*entity.User, error) {
	var u entity.User
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND id = ?", businessID, id).
		First(&u).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &u, nil
}

func (r *userRepository) FindByEmail(ctx context.Context, businessID uuid.UUID, email string) (*entity.User, error) {
	var u entity.User
	err := r.db.WithContext(ctx).
		Where("business_id = ? AND email = ?", businessID, email).
		First(&u).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &u, nil
}

func (r *userRepository) FindByEmailGlobal(ctx context.Context, email string) (*entity.User, error) {
	var u entity.User
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &u, nil
}

func (r *userRepository) FindByIDGlobal(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	var u entity.User
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &u, nil
}

func (r *userRepository) List(ctx context.Context, businessID uuid.UUID, offset, limit int, sort, order, search string) ([]entity.User, int64, error) {
	q := r.db.WithContext(ctx).Model(&entity.User{}).Where("business_id = ?", businessID)
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("full_name ILIKE ? OR email ILIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []entity.User
	// sort/order are validated against a per-endpoint whitelist by
	// pkg/pagination before reaching here — never pass a raw client value.
	err := q.Order(fmt.Sprintf("%s %s", sort, order)).Offset(offset).Limit(limit).Find(&users).Error
	if err != nil {
		return nil, 0, err
	}
	return users, total, nil
}

func (r *userRepository) Update(ctx context.Context, u *entity.User) error {
	return r.db.WithContext(ctx).Save(u).Error
}

func (r *userRepository) IncrementFailedLogins(ctx context.Context, id uuid.UUID) (int, error) {
	err := r.db.WithContext(ctx).Model(&entity.User{}).
		Where("id = ?", id).
		UpdateColumn("failed_login_attempts", gorm.Expr("failed_login_attempts + 1")).Error
	if err != nil {
		return 0, err
	}

	var count int
	err = r.db.WithContext(ctx).Model(&entity.User{}).
		Select("failed_login_attempts").
		Where("id = ?", id).
		Scan(&count).Error
	return count, err
}

func (r *userRepository) ResetFailedLogins(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&entity.User{}).
		Where("id = ?", id).
		Updates(map[string]any{"failed_login_attempts": 0, "locked_until": nil}).Error
}

func (r *userRepository) Lock(ctx context.Context, id uuid.UUID, until time.Time) error {
	return r.db.WithContext(ctx).Model(&entity.User{}).
		Where("id = ?", id).
		Update("locked_until", until).Error
}

func (r *userRepository) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	res := r.db.WithContext(ctx).
		Where("business_id = ? AND id = ?", businessID, id).
		Delete(&entity.User{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *userRepository) AssignRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID, branchID *uuid.UUID) error {
	db := r.db.WithContext(ctx)
	if err := db.Where("user_id = ?", userID).Delete(&entity.UserRole{}).Error; err != nil {
		return err
	}
	if len(roleIDs) == 0 {
		return nil
	}

	rows := make([]entity.UserRole, 0, len(roleIDs))
	for _, roleID := range roleIDs {
		rows = append(rows, entity.UserRole{UserID: userID, RoleID: roleID, BranchID: branchID})
	}
	return db.Create(&rows).Error
}

func (r *userRepository) ListRoleIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&entity.UserRole{}).
		Where("user_id = ?", userID).
		Pluck("role_id", &ids).Error
	return ids, err
}

func (r *userRepository) ListRoleNames(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var names []string
	err := r.db.WithContext(ctx).
		Model(&entity.Role{}).
		Distinct("roles.name").
		Joins("JOIN user_roles ON user_roles.role_id = roles.id").
		Where("user_roles.user_id = ?", userID).
		Pluck("roles.name", &names).Error
	return names, err
}

func wrapNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	return err
}
