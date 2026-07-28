package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

type AuthHandler struct {
	auth service.AuthService
}

func NewAuthHandler(auth service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
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
	return ok(c, fiber.StatusCreated, "registration successful", authResponse(result))
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
	return ok(c, fiber.StatusOK, "login successful", authResponse(result))
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
	return ok(c, fiber.StatusOK, "token refreshed", authResponse(result))
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
	return ok(c, fiber.StatusOK, "logout successful", fiber.Map{})
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
	return ok(c, fiber.StatusOK, "all sessions logged out", fiber.Map{})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	result, err := h.auth.Me(c.UserContext(), middleware.BusinessID(c), middleware.UserID(c))
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, "profile retrieved", authUserResponse(result))
}

func (h *AuthHandler) UpdateMe(c *fiber.Ctx) error {
	var req dto.UpdateMeRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	result, err := h.auth.UpdateMe(
		c.UserContext(),
		middleware.BusinessID(c),
		middleware.UserID(c),
		req.FullName,
		req.Phone,
	)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, "profile updated", authUserResponse(result))
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
	return ok(c, fiber.StatusOK, "password changed", fiber.Map{})
}

func authResponse(result service.AuthResult) dto.TokenPairResponse {
	return dto.TokenPairResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    result.ExpiresIn,
		User:         authUserResponse(result),
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
