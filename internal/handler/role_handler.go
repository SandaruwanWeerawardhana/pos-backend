package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

type RoleHandler struct {
	roles service.RoleService
}

func NewRoleHandler(roles service.RoleService) *RoleHandler {
	return &RoleHandler{roles: roles}
}

func (h *RoleHandler) Create(c *fiber.Ctx) error {
	var req dto.CreateRoleRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	permissionIDs, err := parseIDs(req.PermissionIDs, "permission_ids")
	if err != nil {
		return err
	}
	role, err := h.roles.Create(
		c.UserContext(), middleware.BusinessID(c), req.Name,
		req.Description, req.Level, permissionIDs,
	)
	if err != nil {
		return err
	}
	permissions, err := h.roles.PermissionNames(c.UserContext(), role.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusCreated, "role created", mapper.ToRoleResponse(*role, permissions))
}

func (h *RoleHandler) Get(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	role, err := h.roles.Get(c.UserContext(), middleware.BusinessID(c), id)
	if err != nil {
		return err
	}
	permissions, err := h.roles.PermissionNames(c.UserContext(), role.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, "role retrieved", mapper.ToRoleResponse(*role, permissions))
}

func (h *RoleHandler) List(c *fiber.Ctx) error {
	roles, err := h.roles.List(c.UserContext(), middleware.BusinessID(c))
	if err != nil {
		return err
	}
	permissionsByRoleID := make(map[string][]string, len(roles))
	for _, role := range roles {
		permissions, permissionErr := h.roles.PermissionNames(c.UserContext(), role.ID)
		if permissionErr != nil {
			return permissionErr
		}
		permissionsByRoleID[role.ID.String()] = permissions
	}
	return ok(c, fiber.StatusOK, "roles retrieved", mapper.ToRoleResponseList(roles, permissionsByRoleID))
}

func (h *RoleHandler) Update(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	var req dto.UpdateRoleRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	var permissionIDs []uuid.UUID
	if req.PermissionIDs != nil {
		permissionIDs, err = parseIDs(req.PermissionIDs, "permission_ids")
		if err != nil {
			return err
		}
	}
	role, err := h.roles.Update(
		c.UserContext(), middleware.BusinessID(c), id,
		req.Description, req.Level, permissionIDs,
	)
	if err != nil {
		return err
	}
	permissions, err := h.roles.PermissionNames(c.UserContext(), role.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, "role updated", mapper.ToRoleResponse(*role, permissions))
}

func (h *RoleHandler) Delete(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	if err := h.roles.Delete(c.UserContext(), middleware.BusinessID(c), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
