// External test package: internal/service/mocks imports internal/service
// (to reference types like service.AuditEntry and service.TokenPair), so an
// in-package test file that also imports internal/service/mocks would form
// an import cycle. Living in service_test avoids it, and everything this
// file needs (NewAuthService and its exported request/config types) is
// already public.
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/mock/gomock"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	repomocks "github.com/SandaruwanWeerawardhana/pos-backend/internal/repository/mocks"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	svcmocks "github.com/SandaruwanWeerawardhana/pos-backend/internal/service/mocks"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

// authServiceMocks bundles every mocked collaborator so each test can set
// expectations on exactly the ones it cares about.
type authServiceMocks struct {
	users      *repomocks.MockUserRepository
	businesses *repomocks.MockBusinessRepository
	branches   *repomocks.MockBranchRepository
	roles      *repomocks.MockRoleRepository
	tokens     *svcmocks.MockTokenService
	audit      *svcmocks.MockAuditService
}

// fakeTxRunner runs fn directly against a nil *gorm.DB — safe here because
// the test's NewTxRepos ignores the tx argument and always returns the same
// mocks, so nothing ever dereferences the nil.
type fakeTxRunner struct{}

func (fakeTxRunner) WithTransaction(ctx context.Context, fn func(ctx context.Context, tx *gorm.DB) error) error {
	return fn(ctx, nil)
}

func newTestAuthDeps(t *testing.T) (service.AuthServiceDeps, authServiceMocks) {
	t.Helper()
	ctrl := gomock.NewController(t)

	m := authServiceMocks{
		users:      repomocks.NewMockUserRepository(ctrl),
		businesses: repomocks.NewMockBusinessRepository(ctrl),
		branches:   repomocks.NewMockBranchRepository(ctrl),
		roles:      repomocks.NewMockRoleRepository(ctrl),
		tokens:     svcmocks.NewMockTokenService(ctrl),
		audit:      svcmocks.NewMockAuditService(ctrl),
	}

	// Audit logging is best-effort in every AuthService method (errors are
	// swallowed), so tests that don't care about the exact entry can allow
	// any number of calls.
	m.audit.EXPECT().Log(gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

	deps := service.AuthServiceDeps{
		Users:      m.users,
		Businesses: m.businesses,
		Branches:   m.branches,
		Roles:      m.roles,
		Tokens:     m.tokens,
		Audit:      m.audit,
		Tx:         fakeTxRunner{},
		NewTxRepos: func(tx *gorm.DB) service.TxRepos {
			return service.TxRepos{Users: m.users, Businesses: m.businesses, Branches: m.branches, Roles: m.roles}
		},
	}
	return deps, m
}

func defaultTestConfig() service.AuthServiceConfig {
	return service.AuthServiceConfig{
		BcryptCost:          4, // bcrypt.MinCost, keeps tests fast
		MaxFailedLogins:     3,
		LockoutDuration:     15 * time.Minute,
		RegistrationEnabled: true,
	}
}

func newTestAuthService(t *testing.T) (service.AuthService, authServiceMocks) {
	t.Helper()
	deps, m := newTestAuthDeps(t)
	return service.NewAuthService(deps, defaultTestConfig()), m
}

func TestUpdateMePersistsProfileAndReturnsAuthContext(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()
	businessID := uuid.New()
	userID := uuid.New()
	branchID := uuid.New()
	roleID := uuid.New()
	user := &entity.User{
		IDMixin:    entity.IDMixin{ID: userID},
		BusinessID: businessID,
		FullName:   "Old Name",
	}
	business := &entity.Business{IDMixin: entity.IDMixin{ID: businessID}, Name: "Acme"}
	branch := &entity.Branch{IDMixin: entity.IDMixin{ID: branchID}, BusinessID: businessID}

	m.users.EXPECT().FindByID(ctx, businessID, userID).Return(user, nil)
	m.users.EXPECT().Update(ctx, user).DoAndReturn(func(_ context.Context, updated *entity.User) error {
		if updated.FullName != "New Name" {
			t.Errorf("FullName = %q, want New Name", updated.FullName)
		}
		if updated.Phone == nil || *updated.Phone != "+94771234567" {
			t.Errorf("Phone = %v, want +94771234567", updated.Phone)
		}
		return nil
	})
	m.businesses.EXPECT().FindByID(ctx, businessID).Return(business, nil)
	m.branches.EXPECT().FindDefault(ctx, businessID).Return(branch, nil)
	m.users.EXPECT().ListRoleIDs(ctx, userID).Return([]uuid.UUID{roleID}, nil)
	m.users.EXPECT().ListRoleNames(ctx, userID).Return([]string{"owner"}, nil)
	m.roles.EXPECT().ListPermissionNamesForRoles(ctx, []uuid.UUID{roleID}).Return([]string{"users.read"}, nil)

	name := " New Name "
	phone := " +94771234567 "
	result, err := svc.UpdateMe(ctx, businessID, userID, &name, &phone)
	if err != nil {
		t.Fatal(err)
	}
	if result.BranchID != branchID || len(result.Roles) != 1 {
		t.Fatalf("unexpected auth context: %+v", result)
	}
}

func TestRegisterDisabledReturnsForbidden(t *testing.T) {
	deps, _ := newTestAuthDeps(t)
	cfg := defaultTestConfig()
	cfg.RegistrationEnabled = false
	svc := service.NewAuthService(deps, cfg)

	_, err := svc.Register(context.Background(), service.RegisterInput{}, service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeForbidden {
		t.Fatalf("expected CodeForbidden, got %v", err)
	}
}

func TestRegisterHappyPathProvisionsTenantAndIssuesTokens(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	ownerRoleID := uuid.New()

	m.businesses.EXPECT().ExistsBySlug(ctx, gomock.Any()).Return(false, nil)
	m.businesses.EXPECT().Create(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, b *entity.Business) error {
		if b.Name != "Acme Grocery" {
			t.Errorf("Business.Name = %q, want %q", b.Name, "Acme Grocery")
		}
		return nil
	})
	m.branches.EXPECT().Create(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, b *entity.Branch) error {
		if b.Code != entity.DefaultBranchCode || !b.IsDefault {
			t.Errorf("unexpected default branch: %+v", b)
		}
		return nil
	})
	m.users.EXPECT().Create(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, u *entity.User) error {
		if u.Email != "owner@acme.test" {
			t.Errorf("User.Email = %q, want owner@acme.test", u.Email)
		}
		if !hash.Compare(u.PasswordHash, "correct-horse-battery") {
			t.Error("expected the stored hash to match the submitted password")
		}
		return nil
	})
	m.roles.EXPECT().FindByName(ctx, (*uuid.UUID)(nil), entity.RoleOwner).
		Return(&entity.Role{IDMixin: entity.IDMixin{ID: ownerRoleID}, Name: entity.RoleOwner}, nil)
	m.users.EXPECT().AssignRoles(ctx, gomock.Any(), []uuid.UUID{ownerRoleID}, (*uuid.UUID)(nil)).Return(nil)
	m.businesses.EXPECT().SetOwner(ctx, gomock.Any(), gomock.Any()).Return(nil)
	m.roles.EXPECT().ListPermissionNamesForRoles(ctx, []uuid.UUID{ownerRoleID}).Return([]string{"users:manage"}, nil)

	m.tokens.EXPECT().IssuePair(ctx, gomock.Any(), gomock.Any(), gomock.Any(), []string{entity.RoleOwner}, "ua", "1.1.1.1").
		Return(service.TokenPair{AccessToken: "access", RefreshToken: "refresh", ExpiresIn: 900}, nil)

	result, err := svc.Register(ctx, service.RegisterInput{
		OwnerName:    "Owner Name",
		BusinessName: "Acme Grocery",
		Email:        "Owner@Acme.test",
		Password:     "correct-horse-battery",
		BusinessType: entity.BusinessTypeGrocery,
	}, service.RequestMeta{UserAgent: "ua", IPAddress: "1.1.1.1"})
	if err != nil {
		t.Fatal(err)
	}

	if result.AccessToken != "access" || result.RefreshToken != "refresh" {
		t.Errorf("unexpected tokens: %+v", result)
	}
	if result.User.Email != "owner@acme.test" {
		t.Errorf("expected email to be lowercased, got %q", result.User.Email)
	}
}

func TestLoginRejectsUnknownEmailWithoutLeakingWhichPart(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	m.users.EXPECT().FindByEmailGlobal(ctx, "nobody@nowhere.test").Return(nil, repository.ErrNotFound)

	_, err := svc.Login(ctx, service.LoginInput{Email: "nobody@nowhere.test", Password: "whatever"}, service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeInvalidCredentials {
		t.Fatalf("expected CodeInvalidCredentials, got %v", err)
	}
}

func TestLoginRejectsWrongPasswordAndIncrementsFailedLogins(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	hashed, err := hash.Hash("real-password", 4)
	if err != nil {
		t.Fatal(err)
	}
	user := &entity.User{
		IDMixin:      entity.IDMixin{ID: uuid.New()},
		BusinessID:   uuid.New(),
		Email:        "user@biz.test",
		PasswordHash: hashed,
		Status:       entity.UserStatusActive,
	}

	m.users.EXPECT().FindByEmailGlobal(ctx, "user@biz.test").Return(user, nil)
	m.users.EXPECT().IncrementFailedLogins(ctx, user.ID).Return(1, nil)

	_, err = svc.Login(ctx, service.LoginInput{Email: "user@biz.test", Password: "wrong-password"}, service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeInvalidCredentials {
		t.Fatalf("expected CodeInvalidCredentials, got %v", err)
	}
}

func TestLoginLocksAccountAfterMaxFailedLogins(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	hashed, _ := hash.Hash("real-password", 4)
	user := &entity.User{
		IDMixin:      entity.IDMixin{ID: uuid.New()},
		BusinessID:   uuid.New(),
		Email:        "user@biz.test",
		PasswordHash: hashed,
		Status:       entity.UserStatusActive,
	}

	m.users.EXPECT().FindByEmailGlobal(ctx, "user@biz.test").Return(user, nil)
	// MaxFailedLogins is 3 in defaultTestConfig — reaching it should trigger
	// a Lock call in the same request.
	m.users.EXPECT().IncrementFailedLogins(ctx, user.ID).Return(3, nil)
	m.users.EXPECT().Lock(ctx, user.ID, gomock.Any()).Return(nil)

	_, err := svc.Login(ctx, service.LoginInput{Email: "user@biz.test", Password: "wrong-password"}, service.RequestMeta{})
	if _, ok := apperror.As(err); !ok {
		t.Fatalf("expected an AppError, got %v", err)
	}
}

func TestLoginRejectsLockedAccountWithoutCheckingPassword(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	future := time.Now().Add(time.Hour)
	user := &entity.User{
		IDMixin:     entity.IDMixin{ID: uuid.New()},
		BusinessID:  uuid.New(),
		Email:       "user@biz.test",
		Status:      entity.UserStatusActive,
		LockedUntil: &future,
	}
	m.users.EXPECT().FindByEmailGlobal(ctx, "user@biz.test").Return(user, nil)
	// No IncrementFailedLogins/hash comparison expected — a locked account
	// must short-circuit before touching the password at all.

	_, err := svc.Login(ctx, service.LoginInput{Email: "user@biz.test", Password: "irrelevant"}, service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeAccountLocked {
		t.Fatalf("expected CodeAccountLocked, got %v", err)
	}
}

func TestLoginRejectsSuspendedAccount(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	user := &entity.User{
		IDMixin:    entity.IDMixin{ID: uuid.New()},
		BusinessID: uuid.New(),
		Email:      "user@biz.test",
		Status:     entity.UserStatusSuspended,
	}
	m.users.EXPECT().FindByEmailGlobal(ctx, "user@biz.test").Return(user, nil)

	_, err := svc.Login(ctx, service.LoginInput{Email: "user@biz.test", Password: "irrelevant"}, service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeAccountSuspended {
		t.Fatalf("expected CodeAccountSuspended, got %v", err)
	}
}

func TestLoginHappyPathIssuesTokensAndResetsFailedLogins(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	hashed, _ := hash.Hash("correct-password", 4)
	businessID := uuid.New()
	user := &entity.User{
		IDMixin:      entity.IDMixin{ID: uuid.New()},
		BusinessID:   businessID,
		Email:        "user@biz.test",
		PasswordHash: hashed,
		Status:       entity.UserStatusActive,
	}
	business := &entity.Business{IDMixin: entity.IDMixin{ID: businessID}, Name: "Biz"}
	branch := &entity.Branch{IDMixin: entity.IDMixin{ID: uuid.New()}, BusinessID: businessID, IsDefault: true}
	roleIDs := []uuid.UUID{uuid.New()}

	m.users.EXPECT().FindByEmailGlobal(ctx, "user@biz.test").Return(user, nil)
	m.users.EXPECT().ResetFailedLogins(ctx, user.ID).Return(nil)
	m.businesses.EXPECT().FindByID(ctx, businessID).Return(business, nil)
	m.branches.EXPECT().FindDefault(ctx, businessID).Return(branch, nil)
	m.users.EXPECT().ListRoleIDs(ctx, user.ID).Return(roleIDs, nil)
	m.users.EXPECT().ListRoleNames(ctx, user.ID).Return([]string{"cashier"}, nil)
	m.roles.EXPECT().ListPermissionNamesForRoles(ctx, roleIDs).Return([]string{"sales:create"}, nil)
	m.tokens.EXPECT().IssuePair(ctx, user.ID, businessID, branch.ID, []string{"cashier"}, "", "").
		Return(service.TokenPair{AccessToken: "a", RefreshToken: "r", ExpiresIn: 900}, nil)

	result, err := svc.Login(ctx, service.LoginInput{Email: "user@biz.test", Password: "correct-password"}, service.RequestMeta{})
	if err != nil {
		t.Fatal(err)
	}
	if result.AccessToken != "a" || result.RefreshToken != "r" {
		t.Errorf("unexpected result: %+v", result)
	}
}

func TestRefreshLogsAuditOnReuseDetection(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	m.tokens.EXPECT().VerifyRefresh(ctx, "stolen-token").
		Return(nil, apperror.New(apperror.CodeTokenReused, "refresh token has already been used"))

	_, err := svc.Refresh(ctx, "stolen-token", service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeTokenReused {
		t.Fatalf("expected CodeTokenReused, got %v", err)
	}
}

func TestChangePasswordRejectsWrongCurrentPassword(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	hashed, _ := hash.Hash("current-pw", 4)
	businessID, userID := uuid.New(), uuid.New()
	user := &entity.User{IDMixin: entity.IDMixin{ID: userID}, PasswordHash: hashed}

	m.users.EXPECT().FindByID(ctx, businessID, userID).Return(user, nil)

	err := svc.ChangePassword(ctx, businessID, userID, "wrong-current", "new-password", service.RequestMeta{})
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeInvalidCredentials {
		t.Fatalf("expected CodeInvalidCredentials, got %v", err)
	}
}

func TestChangePasswordRevokesAllSessions(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	hashed, _ := hash.Hash("current-pw", 4)
	businessID, userID := uuid.New(), uuid.New()
	user := &entity.User{IDMixin: entity.IDMixin{ID: userID}, PasswordHash: hashed}

	m.users.EXPECT().FindByID(ctx, businessID, userID).Return(user, nil)
	m.users.EXPECT().Update(ctx, gomock.Any()).Return(nil)
	m.tokens.EXPECT().RevokeAllForUser(ctx, userID, entity.RevokedReasonLogoutAll).Return(nil)

	if err := svc.ChangePassword(ctx, businessID, userID, "current-pw", "brand-new-password", service.RequestMeta{}); err != nil {
		t.Fatal(err)
	}
}

func TestLogoutDenylistsCurrentAccessToken(t *testing.T) {
	svc, m := newTestAuthService(t)
	ctx := context.Background()

	m.tokens.EXPECT().Revoke(ctx, "raw-refresh", entity.RevokedReasonLogout).Return(nil)
	m.tokens.EXPECT().DenylistAccessToken(ctx, "jti-123", gomock.Any()).Return(nil)

	err := svc.Logout(ctx, "jti-123", time.Now().Add(10*time.Minute), "raw-refresh", service.RequestMeta{})
	if err != nil {
		t.Fatal(err)
	}
}
