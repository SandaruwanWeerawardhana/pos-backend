package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/pagination"
)

type UserHandler struct {
	users service.UserService
}

func NewUserHandler(users service.UserService) *UserHandler {
	return &UserHandler{users: users}
}

func (h *UserHandler) Create(c *fiber.Ctx) error {
	var req dto.CreateUserRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	roleIDs, err := parseIDs(req.RoleIDs, "role_ids")
	if err != nil {
		return err
	}
	user, err := h.users.Create(c.UserContext(), middleware.BusinessID(c), req.Email, req.FullName, req.Password, roleIDs)
	if err != nil {
		return err
	}
	roles, err := h.users.RolesFor(c.UserContext(), user.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusCreated, mapper.ToUserResponse(*user, roles))
}

func (h *UserHandler) Get(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	user, err := h.users.Get(c.UserContext(), middleware.BusinessID(c), id)
	if err != nil {
		return err
	}
	roles, err := h.users.RolesFor(c.UserContext(), user.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, mapper.ToUserResponse(*user, roles))
}

func (h *UserHandler) List(c *fiber.Ctx) error {
	var query dto.PaginationQuery
	if err := c.QueryParser(&query); err != nil {
		return apperror.Wrap(apperror.CodeBadRequest, "invalid query parameters", err)
	}
	params, err := pagination.Parse(
		query.Page, query.PerPage, query.Sort, query.Order, query.Search,
		[]string{"created_at", "full_name", "email", "status"},
	)
	if err != nil {
		return err
	}
	users, total, err := h.users.List(
		c.UserContext(), middleware.BusinessID(c), params.Offset(), params.PerPage,
		params.Sort, params.Order, params.Search,
	)
	if err != nil {
		return err
	}
	rolesByUserID := make(map[string][]string, len(users))
	for _, user := range users {
		roles, roleErr := h.users.RolesFor(c.UserContext(), user.ID)
		if roleErr != nil {
			return roleErr
		}
		rolesByUserID[user.ID.String()] = roles
	}
	// No envelope, but a paginated list still has to carry its page counts
	// somewhere, so items and meta are siblings. Nothing on the frontend
	// consumes this endpoint yet (staff management is Phase 2), so the shape is
	// still free to change when a caller appears.
	return ok(c, fiber.StatusOK, dto.UserListResponse{
		Items: mapper.ToUserResponseList(users, rolesByUserID),
		Meta:  pagination.NewMeta(params, total),
	})
}

func (h *UserHandler) Update(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	var req dto.UpdateUserRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}
	var roleIDs []uuid.UUID
	if req.RoleIDs != nil {
		roleIDs, err = parseIDs(req.RoleIDs, "role_ids")
		if err != nil {
			return err
		}
	}
	user, err := h.users.Update(
		c.UserContext(), middleware.BusinessID(c), id,
		req.FullName, req.Status, roleIDs,
	)
	if err != nil {
		return err
	}
	roles, err := h.users.RolesFor(c.UserContext(), user.ID)
	if err != nil {
		return err
	}
	return ok(c, fiber.StatusOK, mapper.ToUserResponse(*user, roles))
}

func (h *UserHandler) Delete(c *fiber.Ctx) error {
	id, err := parseID(c.Params("id"), "id")
	if err != nil {
		return err
	}
	if err := h.users.Delete(c.UserContext(), middleware.BusinessID(c), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
