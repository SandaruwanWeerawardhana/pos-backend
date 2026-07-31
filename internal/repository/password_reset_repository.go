package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=password_reset_repository.go -destination=mocks/password_reset_repository_mock.go -package=mocks

// PasswordResetRepository persists password reset grants. Lookup is by token
// hash only: the plaintext token never reaches the database, so there is no
// by-token query to offer.
type PasswordResetRepository interface {
	Create(ctx context.Context, r *entity.PasswordReset) error
	FindByTokenHash(ctx context.Context, tokenHash string) (*entity.PasswordReset, error)
	// MarkConsumed burns a grant. It returns ErrNotFound when the row was
	// already consumed, which is what makes redemption single-use even if two
	// requests present the same token at once — the update is conditional on
	// consumed_at still being NULL rather than on a prior read.
	MarkConsumed(ctx context.Context, id uuid.UUID, at time.Time) error
	// DeleteForUser clears any outstanding grants for a user, so issuing a new
	// link invalidates older ones and a completed reset leaves nothing usable.
	DeleteForUser(ctx context.Context, userID uuid.UUID) error
}

type passwordResetRepository struct {
	db *gorm.DB
}

func NewPasswordResetRepository(db *gorm.DB) PasswordResetRepository {
	return &passwordResetRepository{db: db}
}

func (r *passwordResetRepository) Create(ctx context.Context, reset *entity.PasswordReset) error {
	return r.db.WithContext(ctx).Create(reset).Error
}

func (r *passwordResetRepository) FindByTokenHash(ctx context.Context, tokenHash string) (*entity.PasswordReset, error) {
	var reset entity.PasswordReset
	err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&reset).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &reset, nil
}

func (r *passwordResetRepository) MarkConsumed(ctx context.Context, id uuid.UUID, at time.Time) error {
	res := r.db.WithContext(ctx).
		Model(&entity.PasswordReset{}).
		Where("id = ? AND consumed_at IS NULL", id).
		Update("consumed_at", at)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *passwordResetRepository) DeleteForUser(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Delete(&entity.PasswordReset{}).Error
}
