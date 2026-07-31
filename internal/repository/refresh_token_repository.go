package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=refresh_token_repository.go -destination=mocks/refresh_token_repository_mock.go -package=mocks

// RefreshTokenRepository persists refresh-token sessions. Only a token's
// SHA-256 is ever stored or looked up — the raw opaque token never touches
// the database.
type RefreshTokenRepository interface {
	Create(ctx context.Context, t *entity.RefreshToken) error
	FindByHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error)
	// RevokeFamily revokes every token sharing familyID — used when a
	// revoked token is presented again (reuse detection): the entire chain
	// descended from that login is invalidated.
	RevokeFamily(ctx context.Context, familyID uuid.UUID, reason string) error
	RevokeByID(ctx context.Context, id uuid.UUID, reason string) error
	RevokeAllForUser(ctx context.Context, userID uuid.UUID, reason string) error
}

type refreshTokenRepository struct {
	db *gorm.DB
}

func NewRefreshTokenRepository(db *gorm.DB) RefreshTokenRepository {
	return &refreshTokenRepository{db: db}
}

func (r *refreshTokenRepository) Create(ctx context.Context, t *entity.RefreshToken) error {
	return r.db.WithContext(ctx).Create(t).Error
}

func (r *refreshTokenRepository) FindByHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error) {
	var t entity.RefreshToken
	err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&t).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &t, nil
}

func (r *refreshTokenRepository) RevokeFamily(ctx context.Context, familyID uuid.UUID, reason string) error {
	return r.db.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("family_id = ? AND revoked_at IS NULL", familyID).
		Updates(map[string]any{"revoked_at": time.Now(), "revoked_reason": reason}).Error
}

func (r *refreshTokenRepository) RevokeByID(ctx context.Context, id uuid.UUID, reason string) error {
	return r.db.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Updates(map[string]any{"revoked_at": time.Now(), "revoked_reason": reason}).Error
}

func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uuid.UUID, reason string) error {
	return r.db.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Updates(map[string]any{"revoked_at": time.Now(), "revoked_reason": reason}).Error
}
