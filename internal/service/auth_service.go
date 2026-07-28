package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

// RegisterInput/LoginInput are plain request bundles the handler builds
// after DTO validation — services never import internal/dto, so a
// wire-format change never forces a service-layer change.
type RegisterInput struct {
	OwnerName    string
	BusinessName string
	Email        string
	Password     string
	BusinessType string
}

type LoginInput struct {
	Email    string
	Password string
}

// RequestMeta carries the request-scoped values audit logging and refresh
// tokens both need, without pulling *fiber.Ctx into the service layer.
type RequestMeta struct {
	IPAddress string
	UserAgent string
	RequestID string
}

// AuthResult bundles everything a handler needs to build a response: the
// raw tokens plus the user/business/roles/permissions for AuthUserResponse.
type AuthResult struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
	User         entity.User
	Business     entity.Business
	BranchID     uuid.UUID
	Roles        []string
	Permissions  []string
}

type AuthService interface {
	Register(ctx context.Context, in RegisterInput, meta RequestMeta) (AuthResult, error)
	Login(ctx context.Context, in LoginInput, meta RequestMeta) (AuthResult, error)
	Refresh(ctx context.Context, rawRefreshToken string, meta RequestMeta) (AuthResult, error)
	Logout(ctx context.Context, accessJTI string, accessExpiresAt time.Time, rawRefreshToken string, meta RequestMeta) error
	LogoutAll(ctx context.Context, userID uuid.UUID, accessJTI string, accessExpiresAt time.Time, meta RequestMeta) error
	Me(ctx context.Context, businessID, userID uuid.UUID) (AuthResult, error)
	UpdateMe(ctx context.Context, businessID, userID uuid.UUID, fullName, phone *string) (AuthResult, error)
	ChangePassword(ctx context.Context, businessID, userID uuid.UUID, currentPassword, newPassword string, meta RequestMeta) error
}

// TxRunner is the subset of *repository.TxManager that Register needs.
// Declaring it here (rather than depending on the concrete type) lets a
// unit test substitute a fake that runs fn against a nil *gorm.DB, since
// NewTxRepos (below) is what actually decides what repository
// implementations the transaction closure sees.
type TxRunner interface {
	WithTransaction(ctx context.Context, fn func(ctx context.Context, tx *gorm.DB) error) error
}

// TxRepos bundles the repositories Register needs inside its transaction.
type TxRepos struct {
	Users      repository.UserRepository
	Businesses repository.BusinessRepository
	Branches   repository.BranchRepository
	Roles      repository.RoleRepository
}

// AuthServiceDeps groups AuthService's collaborators so the constructor
// isn't an unreadable wall of positional repository arguments.
type AuthServiceDeps struct {
	Users      repository.UserRepository
	Businesses repository.BusinessRepository
	Branches   repository.BranchRepository
	Roles      repository.RoleRepository
	Tokens     TokenService
	Audit      AuditService
	Tx         TxRunner

	// NewTxRepos builds the repositories Register runs its writes through,
	// bound to the transaction's *gorm.DB. Production wiring returns real
	// repository.New*Repository(tx) instances; tests substitute a factory
	// that returns the same mocks regardless of tx, so mock expectations
	// still apply inside the transaction closure.
	NewTxRepos func(tx *gorm.DB) TxRepos
}

type AuthServiceConfig struct {
	BcryptCost          int
	MaxFailedLogins     int
	LockoutDuration     time.Duration
	RegistrationEnabled bool
}

type authService struct {
	deps AuthServiceDeps
	cfg  AuthServiceConfig
}

// DefaultTxRepos is the production AuthServiceDeps.NewTxRepos: real
// repositories bound to the transaction's *gorm.DB.
func DefaultTxRepos(tx *gorm.DB) TxRepos {
	return TxRepos{
		Users:      repository.NewUserRepository(tx),
		Businesses: repository.NewBusinessRepository(tx),
		Branches:   repository.NewBranchRepository(tx),
		Roles:      repository.NewRoleRepository(tx),
	}
}

func NewAuthService(deps AuthServiceDeps, cfg AuthServiceConfig) AuthService {
	return &authService{deps: deps, cfg: cfg}
}

func (s *authService) Register(ctx context.Context, in RegisterInput, meta RequestMeta) (AuthResult, error) {
	if !s.cfg.RegistrationEnabled {
		return AuthResult{}, apperror.New(apperror.CodeForbidden, "self-service registration is disabled")
	}

	email := strings.ToLower(strings.TrimSpace(in.Email))
	slug := slugify(in.BusinessName)

	var result AuthResult
	// Tenant provisioning is atomic: create business -> default branch ->
	// owner user -> assign owner role -> set businesses.owner_user_id. Any
	// failure rolls back everything, so a half-created tenant never exists.
	err := s.deps.Tx.WithTransaction(ctx, func(ctx context.Context, tx *gorm.DB) error {
		repos := s.deps.NewTxRepos(tx)
		businesses := repos.Businesses
		branches := repos.Branches
		users := repos.Users
		roles := repos.Roles

		if exists, err := businesses.ExistsBySlug(ctx, slug); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to check business slug", err)
		} else if exists {
			slug = slug + "-" + randomSuffix()
		}

		hashedPassword, err := hash.Hash(in.Password, s.cfg.BcryptCost)
		if err != nil {
			return apperror.Wrap(apperror.CodeInternal, "failed to hash password", err)
		}

		business := entity.Business{
			Slug:         slug,
			Name:         in.BusinessName,
			BusinessType: in.BusinessType,
			CurrencyCode: "LKR",
		}
		if err := businesses.Create(ctx, &business); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to create business", err)
		}

		branch := entity.Branch{
			BusinessID: business.ID,
			Code:       entity.DefaultBranchCode,
			Name:       "Main Branch",
			IsDefault:  true,
		}
		if err := branches.Create(ctx, &branch); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to create default branch", err)
		}

		user := entity.User{
			BusinessID:   business.ID,
			Email:        email,
			PasswordHash: hashedPassword,
			FullName:     in.OwnerName,
			Status:       entity.UserStatusActive,
		}
		if err := users.Create(ctx, &user); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to create owner user", err)
		}

		ownerRole, err := roles.FindByName(ctx, nil, entity.RoleOwner)
		if err != nil {
			return apperror.Wrap(apperror.CodeInternal, "owner system role is not seeded", err)
		}
		if err := users.AssignRoles(ctx, user.ID, []uuid.UUID{ownerRole.ID}, nil); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to assign owner role", err)
		}

		if err := businesses.SetOwner(ctx, business.ID, user.ID); err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to set business owner", err)
		}

		permNames, err := roles.ListPermissionNamesForRoles(ctx, []uuid.UUID{ownerRole.ID})
		if err != nil {
			return apperror.Wrap(apperror.CodeDatabase, "failed to load owner permissions", err)
		}

		result.User = user
		result.Business = business
		result.BranchID = branch.ID
		result.Roles = []string{entity.RoleOwner}
		result.Permissions = permNames
		return nil
	})
	if err != nil {
		return AuthResult{}, err
	}

	pair, err := s.deps.Tokens.IssuePair(ctx, result.User.ID, result.Business.ID, result.BranchID, result.Roles, meta.UserAgent, meta.IPAddress)
	if err != nil {
		return AuthResult{}, err
	}
	result.AccessToken = pair.AccessToken
	result.RefreshToken = pair.RefreshToken
	result.ExpiresIn = pair.ExpiresIn

	s.logAudit(ctx, &result.Business.ID, &result.User.ID, entity.AuditActionRegister, entity.AuditStatusSuccess, nil, meta)

	return result, nil
}

func (s *authService) Login(ctx context.Context, in LoginInput, meta RequestMeta) (AuthResult, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))

	// The frontend contract keys login on email alone, with no business
	// selector, so this looks the user up across every tenant. Our schema
	// only enforces email uniqueness per business_id, so two different
	// businesses could each register the same owner email; this is a
	// documented pass-1 limitation (first match wins), not an oversight —
	// resolving it needs a business selector on the login form, which is
	// out of scope while client.ts is immutable.
	user, err := s.deps.Users.FindByEmailGlobal(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			hash.CompareDummy(in.Password)
			s.logAudit(ctx, nil, nil, entity.AuditActionLogin, entity.AuditStatusFailure, map[string]string{"reason": "no such account"}, meta)
			return AuthResult{}, apperror.New(apperror.CodeInvalidCredentials, "invalid email or password")
		}
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to look up user", err)
	}

	businessID := user.BusinessID

	if user.IsLocked() {
		s.logAudit(ctx, &businessID, &user.ID, entity.AuditActionLogin, entity.AuditStatusFailure, map[string]string{"reason": "account locked"}, meta)
		return AuthResult{}, apperror.New(apperror.CodeAccountLocked, "account is temporarily locked due to repeated failed logins")
	}
	if !user.IsActive() {
		s.logAudit(ctx, &businessID, &user.ID, entity.AuditActionLogin, entity.AuditStatusFailure, map[string]string{"reason": "account suspended"}, meta)
		return AuthResult{}, apperror.New(apperror.CodeAccountSuspended, "account is suspended")
	}

	if !hash.Compare(user.PasswordHash, in.Password) {
		attempts, incErr := s.deps.Users.IncrementFailedLogins(ctx, user.ID)
		if incErr == nil && attempts >= s.cfg.MaxFailedLogins {
			_ = s.deps.Users.Lock(ctx, user.ID, time.Now().Add(s.cfg.LockoutDuration))
		}
		s.logAudit(ctx, &businessID, &user.ID, entity.AuditActionLogin, entity.AuditStatusFailure, map[string]string{"reason": "invalid credentials"}, meta)
		return AuthResult{}, apperror.New(apperror.CodeInvalidCredentials, "invalid email or password")
	}

	if err := s.deps.Users.ResetFailedLogins(ctx, user.ID); err != nil {
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to reset failed login counter", err)
	}

	business, branch, _, roleNames, permNames, err := s.loadContext(ctx, *user)
	if err != nil {
		return AuthResult{}, err
	}

	pair, err := s.deps.Tokens.IssuePair(ctx, user.ID, business.ID, branch.ID, roleNames, meta.UserAgent, meta.IPAddress)
	if err != nil {
		return AuthResult{}, err
	}

	s.logAudit(ctx, &businessID, &user.ID, entity.AuditActionLogin, entity.AuditStatusSuccess, nil, meta)

	return AuthResult{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         *user,
		Business:     business,
		BranchID:     branch.ID,
		Roles:        roleNames,
		Permissions:  permNames,
	}, nil
}

func (s *authService) Refresh(ctx context.Context, rawRefreshToken string, meta RequestMeta) (AuthResult, error) {
	verified, err := s.deps.Tokens.VerifyRefresh(ctx, rawRefreshToken)
	if err != nil {
		if ae, ok := apperror.As(err); ok && ae.Code == apperror.CodeTokenReused {
			s.logAudit(ctx, nil, nil, entity.AuditActionRefreshReuseDetected, entity.AuditStatusFailure, nil, meta)
		}
		return AuthResult{}, err
	}

	user, err := s.deps.Users.FindByIDGlobal(ctx, verified.UserID)
	if err != nil {
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to load user for refresh", err)
	}
	if !user.IsActive() {
		return AuthResult{}, apperror.New(apperror.CodeAccountSuspended, "account is suspended")
	}

	business, branch, _, roleNames, permNames, err := s.loadContext(ctx, *user)
	if err != nil {
		return AuthResult{}, err
	}

	pair, err := s.deps.Tokens.Rotate(ctx, verified, business.ID, branch.ID, roleNames, meta.UserAgent, meta.IPAddress)
	if err != nil {
		return AuthResult{}, err
	}

	s.logAudit(ctx, &business.ID, &user.ID, entity.AuditActionRefresh, entity.AuditStatusSuccess, nil, meta)

	return AuthResult{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         *user,
		Business:     business,
		BranchID:     branch.ID,
		Roles:        roleNames,
		Permissions:  permNames,
	}, nil
}

func (s *authService) Logout(ctx context.Context, accessJTI string, accessExpiresAt time.Time, rawRefreshToken string, meta RequestMeta) error {
	if err := s.deps.Tokens.Revoke(ctx, rawRefreshToken, entity.RevokedReasonLogout); err != nil {
		return err
	}
	return s.deps.Tokens.DenylistAccessToken(ctx, accessJTI, time.Until(accessExpiresAt))
}

func (s *authService) LogoutAll(ctx context.Context, userID uuid.UUID, accessJTI string, accessExpiresAt time.Time, meta RequestMeta) error {
	if err := s.deps.Tokens.RevokeAllForUser(ctx, userID, entity.RevokedReasonLogoutAll); err != nil {
		return err
	}
	return s.deps.Tokens.DenylistAccessToken(ctx, accessJTI, time.Until(accessExpiresAt))
}

func (s *authService) Me(ctx context.Context, businessID, userID uuid.UUID) (AuthResult, error) {
	user, err := s.deps.Users.FindByID(ctx, businessID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return AuthResult{}, apperror.New(apperror.CodeNotFound, "user not found")
		}
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to load user", err)
	}

	business, branch, _, roleNames, permNames, err := s.loadContext(ctx, *user)
	if err != nil {
		return AuthResult{}, err
	}

	return AuthResult{
		User:        *user,
		Business:    business,
		BranchID:    branch.ID,
		Roles:       roleNames,
		Permissions: permNames,
	}, nil
}

func (s *authService) UpdateMe(ctx context.Context, businessID, userID uuid.UUID, fullName, phone *string) (AuthResult, error) {
	user, err := s.deps.Users.FindByID(ctx, businessID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return AuthResult{}, apperror.New(apperror.CodeNotFound, "user not found")
		}
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to load user", err)
	}

	if fullName != nil {
		user.FullName = strings.TrimSpace(*fullName)
	}
	if phone != nil {
		trimmed := strings.TrimSpace(*phone)
		user.Phone = &trimmed
	}
	if err := s.deps.Users.Update(ctx, user); err != nil {
		return AuthResult{}, apperror.Wrap(apperror.CodeDatabase, "failed to update profile", err)
	}

	business, branch, _, roleNames, permNames, err := s.loadContext(ctx, *user)
	if err != nil {
		return AuthResult{}, err
	}
	return AuthResult{
		User:        *user,
		Business:    business,
		BranchID:    branch.ID,
		Roles:       roleNames,
		Permissions: permNames,
	}, nil
}

func (s *authService) ChangePassword(ctx context.Context, businessID, userID uuid.UUID, currentPassword, newPassword string, meta RequestMeta) error {
	user, err := s.deps.Users.FindByID(ctx, businessID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperror.New(apperror.CodeNotFound, "user not found")
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to load user", err)
	}

	if !hash.Compare(user.PasswordHash, currentPassword) {
		return apperror.New(apperror.CodeInvalidCredentials, "current password is incorrect")
	}

	hashed, err := hash.Hash(newPassword, s.cfg.BcryptCost)
	if err != nil {
		return apperror.Wrap(apperror.CodeInternal, "failed to hash new password", err)
	}
	user.PasswordHash = hashed
	if err := s.deps.Users.Update(ctx, user); err != nil {
		return apperror.Wrap(apperror.CodeDatabase, "failed to update password", err)
	}

	// A password change invalidates every existing session, otherwise a
	// fix for a stolen credential wouldn't actually end the attacker's
	// session.
	if err := s.deps.Tokens.RevokeAllForUser(ctx, user.ID, entity.RevokedReasonLogoutAll); err != nil {
		return apperror.Wrap(apperror.CodeDatabase, "failed to revoke sessions", err)
	}

	s.logAudit(ctx, &businessID, &user.ID, entity.AuditActionChangePassword, entity.AuditStatusSuccess, nil, meta)
	return nil
}

// loadContext resolves everything an AuthResult needs beyond the user row
// itself: business, default branch, and the role/permission claims. Shared
// by Login, Refresh, and Me so they build identical response shapes.
func (s *authService) loadContext(ctx context.Context, user entity.User) (entity.Business, entity.Branch, []uuid.UUID, []string, []string, error) {
	business, err := s.deps.Businesses.FindByID(ctx, user.BusinessID)
	if err != nil {
		return entity.Business{}, entity.Branch{}, nil, nil, nil, apperror.Wrap(apperror.CodeDatabase, "failed to load business", err)
	}
	branch, err := s.deps.Branches.FindDefault(ctx, user.BusinessID)
	if err != nil {
		return entity.Business{}, entity.Branch{}, nil, nil, nil, apperror.Wrap(apperror.CodeDatabase, "failed to load default branch", err)
	}
	roleIDs, err := s.deps.Users.ListRoleIDs(ctx, user.ID)
	if err != nil {
		return entity.Business{}, entity.Branch{}, nil, nil, nil, apperror.Wrap(apperror.CodeDatabase, "failed to load roles", err)
	}
	roleNames, err := s.deps.Users.ListRoleNames(ctx, user.ID)
	if err != nil {
		return entity.Business{}, entity.Branch{}, nil, nil, nil, apperror.Wrap(apperror.CodeDatabase, "failed to load role names", err)
	}
	permNames, err := s.deps.Roles.ListPermissionNamesForRoles(ctx, roleIDs)
	if err != nil {
		return entity.Business{}, entity.Branch{}, nil, nil, nil, apperror.Wrap(apperror.CodeDatabase, "failed to load permissions", err)
	}
	return *business, *branch, roleIDs, roleNames, permNames, nil
}

func (s *authService) logAudit(ctx context.Context, businessID, userID *uuid.UUID, action, status string, newValues any, meta RequestMeta) {
	_ = s.deps.Audit.Log(ctx, AuditEntry{
		BusinessID: businessID,
		UserID:     userID,
		Action:     action,
		Status:     status,
		NewValues:  newValues,
		IPAddress:  meta.IPAddress,
		UserAgent:  meta.UserAgent,
		RequestID:  meta.RequestID,
	})
}

// slugify turns a business name into a URL-safe slug: lowercase
// alphanumerics separated by single hyphens, trimmed of leading/trailing
// hyphens, falling back to "business" if nothing alphanumeric survives.
func slugify(name string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		default:
			if !prevDash && b.Len() > 0 {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "business"
	}
	return slug
}

func randomSuffix() string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		panic("service: crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(buf)
}
