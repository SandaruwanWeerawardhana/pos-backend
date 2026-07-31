package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	pkgjwt "github.com/SandaruwanWeerawardhana/pos-backend/pkg/jwt"
)

//go:generate go run go.uber.org/mock/mockgen -source=token_service.go -destination=mocks/token_service_mock.go -package=mocks

const denylistKeyPrefix = "denylist:jti:"

// TokenPair is the access+refresh pair minted on login/register/refresh.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64 // seconds until the access token expires
}

// TokenService owns the full lifecycle of both token kinds: minting,
// refresh-token rotation with reuse detection, and the TokenDenylist that
// makes logout kill a still-valid access token immediately instead of
// waiting out its 15-minute TTL.
type TokenService interface {
	IssuePair(ctx context.Context, userID, businessID, branchID uuid.UUID, roles []string, userAgent, ip string) (TokenPair, error)

	// VerifyRefresh looks up rawRefreshToken and validates it. Reuse of an
	// already-revoked token is treated as a compromise signal: it revokes
	// the whole family as a side effect before returning ErrCodeTokenReused.
	VerifyRefresh(ctx context.Context, rawRefreshToken string) (*entity.RefreshToken, error)
	// Rotate revokes the token verified by VerifyRefresh and issues a
	// successor in the same family.
	Rotate(ctx context.Context, verified *entity.RefreshToken, businessID, branchID uuid.UUID, roles []string, userAgent, ip string) (TokenPair, error)
	Revoke(ctx context.Context, rawRefreshToken, reason string) error
	RevokeAllForUser(ctx context.Context, userID uuid.UUID, reason string) error

	ParseAccessToken(tokenString string) (*pkgjwt.Claims, error)
	DenylistAccessToken(ctx context.Context, jti string, ttl time.Duration) error
	IsAccessTokenDenylisted(ctx context.Context, jti string) (bool, error)
}

type tokenService struct {
	refreshRepo  repository.RefreshTokenRepository
	denylist     TokenDenylist
	accessIssuer *pkgjwt.Issuer
	refreshTTL   time.Duration
}

func NewTokenService(refreshRepo repository.RefreshTokenRepository, denylist TokenDenylist, accessIssuer *pkgjwt.Issuer, refreshTTL time.Duration) TokenService {
	return &tokenService{
		refreshRepo:  refreshRepo,
		denylist:     denylist,
		accessIssuer: accessIssuer,
		refreshTTL:   refreshTTL,
	}
}

func (s *tokenService) IssuePair(ctx context.Context, userID, businessID, branchID uuid.UUID, roles []string, userAgent, ip string) (TokenPair, error) {
	return s.issue(ctx, userID, businessID, branchID, roles, uuid.New(), nil, userAgent, ip)
}

func (s *tokenService) VerifyRefresh(ctx context.Context, rawRefreshToken string) (*entity.RefreshToken, error) {
	existing, err := s.refreshRepo.FindByHash(ctx, hashToken(rawRefreshToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeTokenInvalid, "refresh token not recognized")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to look up refresh token", err)
	}

	if existing.RevokedAt != nil {
		// Reuse of an already-rotated-away token means the family may be
		// compromised (stolen and replayed) — revoke every descendant, not
		// just this one.
		_ = s.refreshRepo.RevokeFamily(ctx, existing.FamilyID, entity.RevokedReasonReused)
		return nil, apperror.New(apperror.CodeTokenReused, "refresh token has already been used")
	}
	if !existing.IsActive() {
		return nil, apperror.New(apperror.CodeTokenExpired, "refresh token has expired")
	}

	return existing, nil
}

func (s *tokenService) Rotate(ctx context.Context, verified *entity.RefreshToken, businessID, branchID uuid.UUID, roles []string, userAgent, ip string) (TokenPair, error) {
	if err := s.refreshRepo.RevokeByID(ctx, verified.ID, entity.RevokedReasonRotated); err != nil {
		return TokenPair{}, apperror.Wrap(apperror.CodeDatabase, "failed to revoke rotated refresh token", err)
	}
	return s.issue(ctx, verified.UserID, businessID, branchID, roles, verified.FamilyID, &verified.ID, userAgent, ip)
}

func (s *tokenService) Revoke(ctx context.Context, rawRefreshToken, reason string) error {
	existing, err := s.refreshRepo.FindByHash(ctx, hashToken(rawRefreshToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil // logging out an already-gone token is not an error
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to look up refresh token", err)
	}
	return s.refreshRepo.RevokeByID(ctx, existing.ID, reason)
}

func (s *tokenService) RevokeAllForUser(ctx context.Context, userID uuid.UUID, reason string) error {
	return s.refreshRepo.RevokeAllForUser(ctx, userID, reason)
}

func (s *tokenService) ParseAccessToken(tokenString string) (*pkgjwt.Claims, error) {
	claims, err := s.accessIssuer.Parse(tokenString)
	if err != nil {
		if errors.Is(err, pkgjwt.ErrExpiredToken) {
			return nil, apperror.New(apperror.CodeTokenExpired, "access token has expired")
		}
		return nil, apperror.New(apperror.CodeTokenInvalid, "access token is invalid")
	}
	return claims, nil
}

func (s *tokenService) DenylistAccessToken(ctx context.Context, jti string, ttl time.Duration) error {
	if ttl <= 0 {
		return nil // already expired, nothing to deny
	}
	return s.denylist.Add(ctx, jti, ttl)
}

func (s *tokenService) IsAccessTokenDenylisted(ctx context.Context, jti string) (bool, error) {
	return s.denylist.Has(ctx, jti)
}

func (s *tokenService) issue(ctx context.Context, userID, businessID, branchID uuid.UUID, roles []string, familyID uuid.UUID, parentID *uuid.UUID, userAgent, ip string) (TokenPair, error) {
	access, _, expiresAt, err := s.accessIssuer.Generate(userID.String(), businessID.String(), branchID.String(), roles)
	if err != nil {
		return TokenPair{}, apperror.Wrap(apperror.CodeInternal, "failed to issue access token", err)
	}

	raw, hash := newOpaqueToken()
	rt := entity.RefreshToken{
		UserID:    userID,
		TokenHash: hash,
		FamilyID:  familyID,
		ParentID:  parentID,
		ExpiresAt: time.Now().Add(s.refreshTTL),
	}
	if userAgent != "" {
		rt.UserAgent = &userAgent
	}
	if ip != "" {
		rt.IPAddress = &ip
	}

	if err := s.refreshRepo.Create(ctx, &rt); err != nil {
		return TokenPair{}, apperror.Wrap(apperror.CodeDatabase, "failed to persist refresh token", err)
	}

	return TokenPair{
		AccessToken:  access,
		RefreshToken: raw,
		ExpiresIn:    int64(time.Until(expiresAt).Seconds()),
	}, nil
}

func newOpaqueToken() (raw, hash string) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing means the OS entropy source is broken — there
		// is no safe way to continue minting session tokens.
		panic("service: crypto/rand unavailable: " + err.Error())
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, hashToken(raw)
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
