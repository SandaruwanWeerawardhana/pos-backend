package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type RoleService interface {
	Create(ctx context.Context, businessID uuid.UUID, name, description string, level int, permissionIDs []uuid.UUID) (*entity.Role, error)
	Get(ctx context.Context, businessID, id uuid.UUID) (*entity.Role, error)
	List(ctx context.Context, businessID uuid.UUID) ([]entity.Role, error)
	Update(ctx context.Context, businessID, id uuid.UUID, description *string, level *int, permissionIDs []uuid.UUID) (*entity.Role, error)
	Delete(ctx context.Context, businessID, id uuid.UUID) error
	PermissionNames(ctx context.Context, roleID uuid.UUID) ([]string, error)
	PermissionNamesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error)
}

type roleService struct {
	roles repository.RoleRepository
}

func NewRoleService(roles repository.RoleRepository) RoleService {
	return &roleService{roles: roles}
}

func (s *roleService) Create(ctx context.Context, businessID uuid.UUID, name, description string, level int, permissionIDs []uuid.UUID) (*entity.Role, error) {
	if _, err := s.roles.FindByName(ctx, &businessID, name); err == nil {
		return nil, apperror.New(apperror.CodeConflict, "a role with this name already exists")
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to check existing role", err)
	}

	r := entity.Role{BusinessID: &businessID, Name: name, Level: level}
	if description != "" {
		r.Description = &description
	}
	if err := s.roles.Create(ctx, &r); err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to create role", err)
	}

	if len(permissionIDs) > 0 {
		if err := s.roles.SetPermissions(ctx, r.ID, permissionIDs); err != nil {
			return nil, apperror.Wrap(apperror.CodeDatabase, "failed to assign permissions", err)
		}
	}

	return &r, nil
}

func (s *roleService) Get(ctx context.Context, businessID, id uuid.UUID) (*entity.Role, error) {
	r, err := s.roles.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "role not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load role", err)
	}
	if r.BusinessID != nil && *r.BusinessID != businessID {
		return nil, apperror.New(apperror.CodeNotFound, "role not found")
	}
	return r, nil
}

func (s *roleService) List(ctx context.Context, businessID uuid.UUID) ([]entity.Role, error) {
	roles, err := s.roles.ListForBusiness(ctx, businessID)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to list roles", err)
	}
	return roles, nil
}

func (s *roleService) Update(ctx context.Context, businessID, id uuid.UUID, description *string, level *int, permissionIDs []uuid.UUID) (*entity.Role, error) {
	r, err := s.roles.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "role not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load role", err)
	}
	if r.IsSystem {
		return nil, apperror.New(apperror.CodeForbidden, "system roles cannot be modified")
	}
	if r.BusinessID == nil || *r.BusinessID != businessID {
		return nil, apperror.New(apperror.CodeNotFound, "role not found")
	}

	if description != nil {
		r.Description = description
	}
	if level != nil {
		r.Level = *level
	}
	if err := s.roles.Update(ctx, r); err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to update role", err)
	}

	if permissionIDs != nil {
		if err := s.roles.SetPermissions(ctx, r.ID, permissionIDs); err != nil {
			return nil, apperror.Wrap(apperror.CodeDatabase, "failed to assign permissions", err)
		}
	}

	return r, nil
}

func (s *roleService) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	if err := s.roles.Delete(ctx, businessID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperror.New(apperror.CodeNotFound, "role not found")
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to delete role", err)
	}
	return nil
}

func (s *roleService) PermissionNames(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	names, err := s.roles.ListPermissionNames(ctx, roleID)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load permissions", err)
	}
	return names, nil
}

func (s *roleService) PermissionNamesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error) {
	names, err := s.roles.ListPermissionNamesForRoles(ctx, roleIDs)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load permissions", err)
	}
	return names, nil
}
