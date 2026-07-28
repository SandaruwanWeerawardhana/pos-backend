package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

type UserService interface {
	Create(ctx context.Context, businessID uuid.UUID, email, fullName, password string, roleIDs []uuid.UUID) (*entity.User, error)
	Get(ctx context.Context, businessID, id uuid.UUID) (*entity.User, error)
	List(ctx context.Context, businessID uuid.UUID, offset, limit int, sort, order, search string) ([]entity.User, int64, error)
	Update(ctx context.Context, businessID, id uuid.UUID, fullName, status *string, roleIDs []uuid.UUID) (*entity.User, error)
	Delete(ctx context.Context, businessID, id uuid.UUID) error
	RolesFor(ctx context.Context, userID uuid.UUID) ([]string, error)
}

type userService struct {
	users      repository.UserRepository
	roles      repository.RoleRepository
	bcryptCost int
}

func NewUserService(users repository.UserRepository, bcryptCost int, roles ...repository.RoleRepository) UserService {
	var roleRepo repository.RoleRepository
	if len(roles) > 0 {
		roleRepo = roles[0]
	}
	return &userService{users: users, roles: roleRepo, bcryptCost: bcryptCost}
}

func (s *userService) Create(ctx context.Context, businessID uuid.UUID, email, fullName, password string, roleIDs []uuid.UUID) (*entity.User, error) {
	if err := s.validateRoleIDs(ctx, businessID, roleIDs); err != nil {
		return nil, err
	}
	if _, err := s.users.FindByEmail(ctx, businessID, email); err == nil {
		return nil, apperror.New(apperror.CodeEmailAlreadyExists, "a user with this email already exists")
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to check existing email", err)
	}

	hashed, err := hash.Hash(password, s.bcryptCost)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeInternal, "failed to hash password", err)
	}

	u := entity.User{
		BusinessID:   businessID,
		Email:        email,
		PasswordHash: hashed,
		FullName:     fullName,
		Status:       entity.UserStatusActive,
	}
	if err := s.users.Create(ctx, &u); err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to create user", err)
	}

	if len(roleIDs) > 0 {
		if err := s.users.AssignRoles(ctx, u.ID, roleIDs, nil); err != nil {
			return nil, apperror.Wrap(apperror.CodeDatabase, "failed to assign roles", err)
		}
	}

	return &u, nil
}

func (s *userService) Get(ctx context.Context, businessID, id uuid.UUID) (*entity.User, error) {
	u, err := s.users.FindByID(ctx, businessID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "user not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load user", err)
	}
	return u, nil
}

func (s *userService) List(ctx context.Context, businessID uuid.UUID, offset, limit int, sort, order, search string) ([]entity.User, int64, error) {
	users, total, err := s.users.List(ctx, businessID, offset, limit, sort, order, search)
	if err != nil {
		return nil, 0, apperror.Wrap(apperror.CodeDatabase, "failed to list users", err)
	}
	return users, total, nil
}

func (s *userService) Update(ctx context.Context, businessID, id uuid.UUID, fullName, status *string, roleIDs []uuid.UUID) (*entity.User, error) {
	if roleIDs != nil {
		if err := s.validateRoleIDs(ctx, businessID, roleIDs); err != nil {
			return nil, err
		}
	}
	u, err := s.users.FindByID(ctx, businessID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "user not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load user", err)
	}

	if fullName != nil {
		u.FullName = *fullName
	}
	if status != nil {
		u.Status = *status
	}
	if err := s.users.Update(ctx, u); err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to update user", err)
	}

	if roleIDs != nil {
		if err := s.users.AssignRoles(ctx, u.ID, roleIDs, nil); err != nil {
			return nil, apperror.Wrap(apperror.CodeDatabase, "failed to assign roles", err)
		}
	}

	return u, nil
}

func (s *userService) validateRoleIDs(ctx context.Context, businessID uuid.UUID, roleIDs []uuid.UUID) error {
	if s.roles == nil {
		return nil
	}
	for _, roleID := range roleIDs {
		role, err := s.roles.FindByID(ctx, roleID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return apperror.New(apperror.CodeNotFound, "role not found")
			}
			return apperror.Wrap(apperror.CodeDatabase, "failed to validate role", err)
		}
		if role.BusinessID != nil && *role.BusinessID != businessID {
			return apperror.New(apperror.CodeNotFound, "role not found")
		}
	}
	return nil
}

func (s *userService) Delete(ctx context.Context, businessID, id uuid.UUID) error {
	if err := s.users.Delete(ctx, businessID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperror.New(apperror.CodeNotFound, "user not found")
		}
		return apperror.Wrap(apperror.CodeDatabase, "failed to delete user", err)
	}
	return nil
}

func (s *userService) RolesFor(ctx context.Context, userID uuid.UUID) ([]string, error) {
	names, err := s.users.ListRoleNames(ctx, userID)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load roles", err)
	}
	return names, nil
}
