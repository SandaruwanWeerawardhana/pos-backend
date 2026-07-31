package service

import (
	"context"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

type PermissionService interface {
	List(ctx context.Context) ([]entity.Permission, error)
	Upsert(ctx context.Context, resource, action, description string) (*entity.Permission, error)
}

type permissionService struct {
	permissions repository.PermissionRepository
}

func NewPermissionService(permissions repository.PermissionRepository) PermissionService {
	return &permissionService{permissions: permissions}
}

func (s *permissionService) List(ctx context.Context) ([]entity.Permission, error) {
	perms, err := s.permissions.List(ctx)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to list permissions", err)
	}
	return perms, nil
}

func (s *permissionService) Upsert(ctx context.Context, resource, action, description string) (*entity.Permission, error) {
	p, err := s.permissions.Upsert(ctx, resource, action, description)
	if err != nil {
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to upsert permission", err)
	}
	return p, nil
}
