package middleware

import (
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/mock/gomock"

	servicemocks "github.com/SandaruwanWeerawardhana/pos-backend/internal/service/mocks"
	pkgjwt "github.com/SandaruwanWeerawardhana/pos-backend/pkg/jwt"
)

func TestAuthRejectsMissingBearerToken(t *testing.T) {
	tokens := servicemocks.NewMockTokenService(gomock.NewController(t))
	app := authTestApp(tokens)

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusUnauthorized)
	}
}

func TestAuthRejectsDenylistedToken(t *testing.T) {
	tokens := servicemocks.NewMockTokenService(gomock.NewController(t))
	claims := validTestClaims()
	tokens.EXPECT().ParseAccessToken("access").Return(claims, nil)
	tokens.EXPECT().IsAccessTokenDenylisted(gomock.Any(), claims.ID).Return(true, nil)
	app := authTestApp(tokens)

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(fiber.HeaderAuthorization, "Bearer access")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusUnauthorized)
	}
}

func TestAuthFailsClosedWhenDenylistUnavailable(t *testing.T) {
	tokens := servicemocks.NewMockTokenService(gomock.NewController(t))
	claims := validTestClaims()
	tokens.EXPECT().ParseAccessToken("access").Return(claims, nil)
	tokens.EXPECT().IsAccessTokenDenylisted(gomock.Any(), claims.ID).Return(false, errors.New("redis down"))
	app := authTestApp(tokens)

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(fiber.HeaderAuthorization, "Bearer access")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusServiceUnavailable)
	}
}

func TestAuthPopulatesIdentityContext(t *testing.T) {
	tokens := servicemocks.NewMockTokenService(gomock.NewController(t))
	claims := validTestClaims()
	tokens.EXPECT().ParseAccessToken("access").Return(claims, nil)
	tokens.EXPECT().IsAccessTokenDenylisted(gomock.Any(), claims.ID).Return(false, nil)

	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler(discardLogger())})
	app.Use(Auth(tokens))
	app.Get("/", func(c *fiber.Ctx) error {
		if UserID(c).String() != claims.Subject {
			t.Errorf("user id = %s, want %s", UserID(c), claims.Subject)
		}
		if BusinessID(c).String() != claims.BusinessID {
			t.Errorf("business id = %s, want %s", BusinessID(c), claims.BusinessID)
		}
		if BranchID(c).String() != claims.BranchID {
			t.Errorf("branch id = %s, want %s", BranchID(c), claims.BranchID)
		}
		if AccessJTI(c) != claims.ID {
			t.Errorf("jti = %s, want %s", AccessJTI(c), claims.ID)
		}
		if len(Roles(c)) != 1 || Roles(c)[0] != "owner" {
			t.Errorf("roles = %v, want [owner]", Roles(c))
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(fiber.HeaderAuthorization, "Bearer access")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusNoContent)
	}
}

func authTestApp(tokens *servicemocks.MockTokenService) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler(discardLogger())})
	app.Use(Auth(tokens))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	return app
}

func validTestClaims() *pkgjwt.Claims {
	now := time.Now()
	return &pkgjwt.Claims{
		BusinessID: uuid.NewString(),
		BranchID:   uuid.NewString(),
		Roles:      []string{"owner"},
		Type:       pkgjwt.TypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uuid.NewString(),
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute)),
		},
	}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
