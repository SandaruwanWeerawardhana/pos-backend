package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

type AuthHandler struct {
	auth   service.AuthService
	resets service.PasswordResetService
	// exposeDevResetToken echoes a freshly minted reset token back in the
	// response so a developer with no mail server can exercise the reset
	// screen. Wired from AppConfig.IsLocal() and false everywhere else —
	// returning it in a deployed environment would hand account takeover to
	// anyone who can name an email address.
	exposeDevResetToken bool
}

func NewAuthHandler(
	auth service.AuthService,
	resets service.PasswordResetService,
	exposeDevResetToken bool,
) *AuthHandler {
	return &AuthHandler{auth: auth, resets: resets, exposeDevResetToken: exposeDevResetToken}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req dto.RegisterRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	result, err := h.auth.Register(c.UserContext(), service.RegisterInput{
		OwnerName:    req.OwnerName,
		BusinessName: req.BusinessName,
		Email:        req.Email,
		Password:     req.Password,
		BusinessType: req.BusinessType,
	}, requestMeta(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusCreated, authResponse(result))
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req dto.LoginRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	result, err := h.auth.Login(c.UserContext(), service.LoginInput{
		Email: req.Email, Password: req.Password,
	}, requestMeta(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, authResponse(result))
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req dto.RefreshRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	result, err := h.auth.Refresh(c.UserContext(), req.RefreshToken, requestMeta(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, authResponse(result))
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req dto.RefreshRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	err := h.auth.Logout(
		c.UserContext(),
		middleware.AccessJTI(c),
		middleware.AccessExpiresAt(c),
		req.RefreshToken,
		requestMeta(c),
	)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, fiber.Map{})
}

func (h *AuthHandler) LogoutAll(c *fiber.Ctx) error {
	err := h.auth.LogoutAll(
		c.UserContext(),
		middleware.UserID(c),
		middleware.AccessJTI(c),
		middleware.AccessExpiresAt(c),
		requestMeta(c),
	)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, fiber.Map{})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	result, err := h.auth.Me(c.UserContext(), middleware.BusinessID(c), middleware.UserID(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, authUserResponse(result))
}

func (h *AuthHandler) UpdateProfile(c *fiber.Ctx) error {
	var req dto.UpdateProfileRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	// req.Email is accepted by the DTO and deliberately not forwarded: see
	// UpdateProfileInput on why changing a sign-in address needs verification
	// this endpoint cannot do.
	result, err := h.auth.UpdateProfile(
		c.UserContext(),
		middleware.BusinessID(c),
		middleware.UserID(c),
		service.UpdateProfileInput{
			Name:         req.Name,
			BusinessName: req.BusinessName,
		},
	)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, authUserResponse(result))
}

func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	var req dto.ChangePasswordRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	err := h.auth.ChangePassword(
		c.UserContext(),
		middleware.BusinessID(c),
		middleware.UserID(c),
		req.CurrentPassword,
		req.NewPassword,
		requestMeta(c),
	)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, fiber.Map{})
}

func (h *AuthHandler) RequestPasswordReset(c *fiber.Ctx) error {
	var req dto.PasswordResetRequestRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	rawToken, err := h.resets.Request(c.UserContext(), req.Email)
	if err != nil {
		return err
	}

	// 200 with an empty body whether or not the address is registered. The
	// service returns an empty token for an unknown account, and the response
	// must not differ, or this becomes an account-enumeration oracle.
	var res dto.PasswordResetRequestResponse
	if h.exposeDevResetToken {
		res.DevToken = rawToken
	}
	return ok(c, fiber.StatusOK, res)
}

func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	var req dto.PasswordResetConfirmRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	if err := h.resets.Reset(c.UserContext(), req.Token, req.NewPassword); err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, fiber.Map{})
}

// authResponse builds the login/register body: {token, user}.
//
// Only the access token goes out. The refresh token is minted and stored
// server-side but not returned, because the client has no refresh flow — it
// decodes this token's `exp` claim to end the session locally. Handing it a
// refresh token it would never spend only widens what a compromised
// localStorage yields.
func authResponse(result service.AuthResult) dto.LoginResponse {
	return dto.LoginResponse{
		Token: result.AccessToken,
		User:  authUserResponse(result),
	}
}

func authUserResponse(result service.AuthResult) dto.AuthUserResponse {
	return mapper.ToAuthUserResponse(
		result.User,
		result.Business,
		result.BranchID.String(),
		result.Roles,
		result.Permissions,
	)
}
