package service_test

import (
	"context"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/mock/gomock"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository/mocks"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	pkgjwt "github.com/SandaruwanWeerawardhana/pos-backend/pkg/jwt"
)

/*
Builds the service through its exported constructor rather than by filling the
tokenService struct literal directly, which is what the in-package version of
this test did. Same four dependencies, same values — but the struct is
unexported, so from outside the package the constructor is the only way in.

That also means these tests now exercise the service strictly through the
TokenService interface, which is what every caller in the application uses.
*/
func newTestTokenService(t *testing.T) (service.TokenService, *mocks.MockRefreshTokenRepository) {
	t.Helper()
	ctrl := gomock.NewController(t)
	refreshRepo := mocks.NewMockRefreshTokenRepository(ctrl)

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	issuer := pkgjwt.NewIssuer("test-secret-at-least-32-bytes-long!", "pos-backend", "pos-frontend", 15*time.Minute)

	svc := service.NewTokenService(
		refreshRepo,
		service.NewRedisDenylist(rdb),
		issuer,
		720*time.Hour,
	)
	return svc, refreshRepo
}

func TestIssuePairCreatesRefreshTokenAndSignsAccessToken(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	userID, businessID, branchID := uuid.New(), uuid.New(), uuid.New()

	refreshRepo.EXPECT().
		Create(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, rt *entity.RefreshToken) error {
			if rt.UserID != userID {
				t.Errorf("UserID = %v, want %v", rt.UserID, userID)
			}
			if rt.TokenHash == "" {
				t.Error("expected a non-empty token hash")
			}
			return nil
		})

	pair, err := svc.IssuePair(context.Background(), userID, businessID, branchID, []string{"owner"}, "ua", "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("expected non-empty tokens")
	}

	claims, err := svc.ParseAccessToken(pair.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != userID.String() || claims.BusinessID != businessID.String() {
		t.Errorf("unexpected claims: %+v", claims)
	}
}

func TestVerifyRefreshRejectsUnknownToken(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	refreshRepo.EXPECT().FindByHash(gomock.Any(), gomock.Any()).Return(nil, repository.ErrNotFound)

	_, err := svc.VerifyRefresh(context.Background(), "does-not-exist")
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeTokenInvalid {
		t.Fatalf("expected CodeTokenInvalid, got %v", err)
	}
}

func TestVerifyRefreshRejectsExpiredToken(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	expired := &entity.RefreshToken{
		IDMixin:   entity.IDMixin{ID: uuid.New()},
		UserID:    uuid.New(),
		ExpiresAt: time.Now().Add(-time.Hour),
	}
	refreshRepo.EXPECT().FindByHash(gomock.Any(), gomock.Any()).Return(expired, nil)

	_, err := svc.VerifyRefresh(context.Background(), "some-raw-token")
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeTokenExpired {
		t.Fatalf("expected CodeTokenExpired, got %v", err)
	}
}

func TestVerifyRefreshDetectsReuseAndRevokesFamily(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	revokedAt := time.Now().Add(-time.Minute)
	familyID := uuid.New()
	reused := &entity.RefreshToken{
		IDMixin:   entity.IDMixin{ID: uuid.New()},
		UserID:    uuid.New(),
		FamilyID:  familyID,
		RevokedAt: &revokedAt,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	refreshRepo.EXPECT().FindByHash(gomock.Any(), gomock.Any()).Return(reused, nil)
	refreshRepo.EXPECT().RevokeFamily(gomock.Any(), familyID, entity.RevokedReasonReused).Return(nil)

	_, err := svc.VerifyRefresh(context.Background(), "stolen-and-replayed-token")
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeTokenReused {
		t.Fatalf("expected CodeTokenReused, got %v", err)
	}
}

func TestRotateRevokesOldAndIssuesSuccessorInSameFamily(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	familyID := uuid.New()
	verified := &entity.RefreshToken{
		IDMixin:  entity.IDMixin{ID: uuid.New()},
		UserID:   uuid.New(),
		FamilyID: familyID,
	}

	refreshRepo.EXPECT().RevokeByID(gomock.Any(), verified.ID, entity.RevokedReasonRotated).Return(nil)
	refreshRepo.EXPECT().
		Create(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, rt *entity.RefreshToken) error {
			if rt.FamilyID != familyID {
				t.Errorf("successor FamilyID = %v, want %v (same family)", rt.FamilyID, familyID)
			}
			if rt.ParentID == nil || *rt.ParentID != verified.ID {
				t.Errorf("successor ParentID = %v, want %v", rt.ParentID, verified.ID)
			}
			return nil
		})

	pair, err := svc.Rotate(context.Background(), verified, uuid.New(), uuid.New(), []string{"cashier"}, "ua", "ip")
	if err != nil {
		t.Fatal(err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("expected non-empty tokens")
	}
}

func TestRevokeOnAlreadyGoneTokenIsNotAnError(t *testing.T) {
	svc, refreshRepo := newTestTokenService(t)
	refreshRepo.EXPECT().FindByHash(gomock.Any(), gomock.Any()).Return(nil, repository.ErrNotFound)

	if err := svc.Revoke(context.Background(), "already-gone", entity.RevokedReasonLogout); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestParseAccessTokenRejectsTamperedToken(t *testing.T) {
	svc, _ := newTestTokenService(t)
	_, err := svc.ParseAccessToken("not.a.valid.jwt")
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeTokenInvalid {
		t.Fatalf("expected CodeTokenInvalid, got %v", err)
	}
}

func TestDenylistRoundTrip(t *testing.T) {
	svc, _ := newTestTokenService(t)
	ctx := context.Background()
	jti := uuid.NewString()

	denylisted, err := svc.IsAccessTokenDenylisted(ctx, jti)
	if err != nil {
		t.Fatal(err)
	}
	if denylisted {
		t.Fatal("expected a fresh jti to not be denylisted")
	}

	if err := svc.DenylistAccessToken(ctx, jti, time.Minute); err != nil {
		t.Fatal(err)
	}

	denylisted, err = svc.IsAccessTokenDenylisted(ctx, jti)
	if err != nil {
		t.Fatal(err)
	}
	if !denylisted {
		t.Fatal("expected jti to be denylisted after DenylistAccessToken")
	}
}

func TestDenylistWithZeroTTLIsNoop(t *testing.T) {
	svc, _ := newTestTokenService(t)
	ctx := context.Background()
	jti := uuid.NewString()

	if err := svc.DenylistAccessToken(ctx, jti, 0); err != nil {
		t.Fatal(err)
	}
	denylisted, err := svc.IsAccessTokenDenylisted(ctx, jti)
	if err != nil {
		t.Fatal(err)
	}
	if denylisted {
		t.Fatal("expected a zero-TTL denylist call to be a no-op")
	}
}
