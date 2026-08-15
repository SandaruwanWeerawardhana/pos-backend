package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

// How long a reset link stays redeemable. Short enough that a link sitting in
// an unattended inbox stops working, long enough that a user who reads mail an
// hour later is not stuck.
const passwordResetTTL = 30 * time.Minute

// resetTokenBytes is the entropy behind a reset token. 32 bytes (256 bits)
// makes the token itself unguessable, which matters because possessing it is
// sufficient to take over the account.
const resetTokenBytes = 32

type PasswordResetService interface {
	// Request issues a reset grant. It returns the plaintext token only so a
	// local environment can echo it back in place of sending mail; it must
	// never be surfaced to a client in a deployed environment.
	//
	// It resolves successfully for an unknown address, returning an empty
	// token: a caller must not be able to tell registered addresses from
	// unregistered ones.
	Request(ctx context.Context, email string) (string, error)
	Reset(ctx context.Context, rawToken, newPassword string) error
}

type passwordResetService struct {
	users      repository.UserRepository
	resets     repository.PasswordResetRepository
	tokens     TokenService
	bcryptCost int
}

func NewPasswordResetService(
	users repository.UserRepository,
	resets repository.PasswordResetRepository,
	tokens TokenService,
	bcryptCost int,
) PasswordResetService {
	return &passwordResetService{
		users:      users,
		resets:     resets,
		tokens:     tokens,
		bcryptCost: bcryptCost,
	}
}

func (s *passwordResetService) Request(ctx context.Context, email string) (string, error) {
	normalised := strings.ToLower(strings.TrimSpace(email))

	user, err := s.users.FindByEmailGlobal(ctx, normalised)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Deliberately indistinguishable from the success path. Returning a
			// 404 here would turn this endpoint into an account-existence
			// oracle.
			return "", nil
		}
		return "", apperror.Wrap(apperror.CodeDatabase, "failed to look up account", err)
	}

	rawToken, err := randomToken()
	if err != nil {
		return "", apperror.Wrap(apperror.CodeInternal, "failed to generate reset token", err)
	}

	// Issuing a new link invalidates any outstanding one, so a user who clicks
	// "forgot password" twice cannot leave a second working token behind.
	if err = s.resets.DeleteForUser(ctx, user.ID); err != nil {
		return "", apperror.Wrap(apperror.CodeDatabase, "failed to clear previous reset tokens", err)
	}

	reset := entity.PasswordReset{
		UserID:    user.ID,
		TokenHash: hashToken(rawToken),
		ExpiresAt: time.Now().Add(passwordResetTTL),
	}
	if err = s.resets.Create(ctx, &reset); err != nil {
		return "", apperror.Wrap(apperror.CodeDatabase, "failed to store reset token", err)
	}

	return rawToken, nil
}

func (s *passwordResetService) Reset(ctx context.Context, rawToken, newPassword string) error {
	// Every failure below returns the same message. Distinguishing "no such
	// token" from "expired" from "already used" would tell an attacker probing
	// tokens which guesses were once valid.
	invalid := apperror.New(apperror.CodeBadRequest, "this reset link is invalid or has expired")

	reset, err := s.resets.FindByTokenHash(ctx, hashToken(rawToken))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return invalid
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to load reset token", err)
	}
	if !reset.IsUsable(time.Now()) {
		return invalid
	}

	user, err := s.users.FindByIDGlobal(ctx, reset.UserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return invalid
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to load account", err)
	}

	hashedPassword, err := hash.Hash(newPassword, s.bcryptCost)
	if err != nil {
		return apperror.Wrap(apperror.CodeInternal, "failed to hash password", err)
	}

	// Burn the grant before writing the new password. If the update below
	// fails, the link is spent and the user must request another — the safe
	// direction. Doing it the other way round would leave a usable token behind
	// after a successful reset.
	if err = s.resets.MarkConsumed(ctx, reset.ID, time.Now()); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Lost a race with a concurrent redemption of the same token.
			return invalid
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to consume reset token", err)
	}

	user.PasswordHash = hashedPassword
	// A reset is the recovery path for a possibly-compromised account, so any
	// lockout from failed guesses is cleared along with the credential.
	user.FailedLoginAttempts = 0
	user.LockedUntil = nil
	if err = s.users.Update(ctx, user); err != nil {
		return apperror.Wrap(apperror.CodeDatabase, "failed to update password", err)
	}

	// Whoever held the old password may still hold live sessions. Revoking
	// every refresh token forces re-authentication everywhere, which is the
	// point of a reset.
	if err = s.tokens.RevokeAllForUser(ctx, user.ID, "password reset"); err != nil {
		return apperror.Wrap(apperror.CodeDatabase, "failed to revoke existing sessions", err)
	}

	return nil
}

// randomToken mints the plaintext reset token. It is hashed with the package's
// hashToken (SHA-256, shared with refresh tokens) before storage: the value is
// 256 bits of random data, so there is no dictionary for bcrypt to slow down,
// and the reset endpoint has to find the row BY hash — which a per-row bcrypt
// salt would make impossible.
func randomToken() (string, error) {
	buf := make([]byte, resetTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
