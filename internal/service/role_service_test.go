package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"go.uber.org/mock/gomock"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository/mocks"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func newTestRoleService(t *testing.T) (RoleService, *mocks.MockRoleRepository) {
	t.Helper()
	ctrl := gomock.NewController(t)
	repo := mocks.NewMockRoleRepository(ctrl)
	return NewRoleService(repo), repo
}

func TestRoleCreateRejectsDuplicateName(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	businessID := uuid.New()

	repo.EXPECT().FindByName(ctx, &businessID, "supervisor").Return(&entity.Role{}, nil)

	_, err := svc.Create(ctx, businessID, "supervisor", "", 50, nil)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeConflict {
		t.Fatalf("expected CodeConflict, got %v", err)
	}
}

func TestRoleUpdateRejectsSystemRole(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	roleID := uuid.New()
	businessID := uuid.New()

	repo.EXPECT().FindByID(ctx, roleID).Return(&entity.Role{IDMixin: entity.IDMixin{ID: roleID}, IsSystem: true}, nil)

	_, err := svc.Update(ctx, businessID, roleID, nil, nil, nil)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeForbidden {
		t.Fatalf("expected CodeForbidden, got %v", err)
	}
}

func TestRoleUpdateAppliesPartialChangesAndSetsPermissions(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	roleID := uuid.New()
	permID := uuid.New()
	businessID := uuid.New()

	repo.EXPECT().FindByID(ctx, roleID).Return(&entity.Role{
		IDMixin:    entity.IDMixin{ID: roleID},
		BusinessID: &businessID,
		Level:      10,
	}, nil)
	repo.EXPECT().Update(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, r *entity.Role) error {
		if r.Level != 20 {
			t.Errorf("Level = %d, want 20", r.Level)
		}
		return nil
	})
	repo.EXPECT().SetPermissions(ctx, roleID, []uuid.UUID{permID}).Return(nil)

	newLevel := 20
	_, err := svc.Update(ctx, businessID, roleID, nil, &newLevel, []uuid.UUID{permID})
	if err != nil {
		t.Fatal(err)
	}
}

func TestRoleGetMapsNotFound(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	roleID := uuid.New()
	businessID := uuid.New()

	repo.EXPECT().FindByID(ctx, roleID).Return(nil, repository.ErrNotFound)

	_, err := svc.Get(ctx, businessID, roleID)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v", err)
	}
}

func TestRoleGetHidesCrossTenantRole(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	businessID := uuid.New()
	otherBusinessID := uuid.New()
	roleID := uuid.New()

	repo.EXPECT().FindByID(ctx, roleID).Return(&entity.Role{
		IDMixin:    entity.IDMixin{ID: roleID},
		BusinessID: &otherBusinessID,
	}, nil)

	_, err := svc.Get(ctx, businessID, roleID)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v", err)
	}
}

func TestRolePermissionNamesForRolesWrapsError(t *testing.T) {
	svc, repo := newTestRoleService(t)
	ctx := context.Background()
	roleIDs := []uuid.UUID{uuid.New()}

	repo.EXPECT().ListPermissionNamesForRoles(ctx, roleIDs).Return(nil, assertAnError{})

	_, err := svc.PermissionNamesForRoles(ctx, roleIDs)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeDatabase {
		t.Fatalf("expected CodeDatabase, got %v", err)
	}
}

type assertAnError struct{}

func (assertAnError) Error() string { return "boom" }
