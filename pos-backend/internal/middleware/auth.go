package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/ctxkey"
)

// Auth verifies the access token, rejects denylisted sessions, and exposes
// typed identity values to handlers and downstream services.
func Auth(tokens service.TokenService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw, err := bearerToken(c.Get(fiber.HeaderAuthorization))
		if err != nil {
			return err
		}

		claims, err := tokens.ParseAccessToken(raw)
		if err != nil {
			return err
		}
		if claims.ExpiresAt == nil || claims.ID == "" {
			return apperror.New(apperror.CodeTokenInvalid, "access token is invalid")
		}

		userID, err := uuid.Parse(claims.Subject)
		if err != nil {
			return apperror.New(apperror.CodeTokenInvalid, "access token is invalid")
		}
		businessID, err := uuid.Parse(claims.BusinessID)
		if err != nil {
			return apperror.New(apperror.CodeTokenInvalid, "access token is invalid")
		}
		branchID := uuid.Nil
		if claims.BranchID != "" {
			branchID, err = uuid.Parse(claims.BranchID)
			if err != nil {
				return apperror.New(apperror.CodeTokenInvalid, "access token is invalid")
			}
		}

		denied, err := tokens.IsAccessTokenDenylisted(c.UserContext(), claims.ID)
		if err != nil {
			return apperror.Wrap(apperror.CodeServiceUnavailable, "authentication service unavailable", err)
		}
		if denied {
			return apperror.New(apperror.CodeTokenRevoked, "access token has been revoked")
		}

		expiresAt := claims.ExpiresAt.Time
		setAuthValue(c, ctxkey.UserID, userID)
		setAuthValue(c, ctxkey.BusinessID, businessID)
		setAuthValue(c, ctxkey.BranchID, branchID)
		setAuthValue(c, ctxkey.Roles, claims.Roles)
		setAuthValue(c, ctxkey.AccessJTI, claims.ID)
		setAuthValue(c, ctxkey.AccessExp, expiresAt)
		return c.Next()
	}
}

func bearerToken(header string) (string, error) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", apperror.New(apperror.CodeUnauthenticated, "bearer access token is required")
	}
	return parts[1], nil
}

func setAuthValue(c *fiber.Ctx, key ctxkey.Key, value any) {
	c.Locals(key, value)
	c.SetUserContext(context.WithValue(c.UserContext(), key, value))
}

func UserID(c *fiber.Ctx) uuid.UUID     { return localUUID(c, ctxkey.UserID) }
func BusinessID(c *fiber.Ctx) uuid.UUID { return localUUID(c, ctxkey.BusinessID) }
func BranchID(c *fiber.Ctx) uuid.UUID   { return localUUID(c, ctxkey.BranchID) }
func Roles(c *fiber.Ctx) []string       { value, _ := c.Locals(ctxkey.Roles).([]string); return value }
func AccessJTI(c *fiber.Ctx) string     { value, _ := c.Locals(ctxkey.AccessJTI).(string); return value }
func AccessExpiresAt(c *fiber.Ctx) time.Time {
	value, _ := c.Locals(ctxkey.AccessExp).(time.Time)
	return value
}

func localUUID(c *fiber.Ctx, key ctxkey.Key) uuid.UUID {
	value, _ := c.Locals(key).(uuid.UUID)
	return value
}
