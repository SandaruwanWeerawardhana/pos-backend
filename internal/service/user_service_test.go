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
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

func newTestUserService(t *testing.T) (UserService, *mocks.MockUserRepository) {
	t.Helper()
	ctrl := gomock.NewController(t)
	repo := mocks.NewMockUserRepository(ctrl)
	return NewUserService(repo, 4), repo
}

func TestUserCreateRejectsDuplicateEmail(t *testing.T) {
	svc, repo := newTestUserService(t)
	ctx := context.Background()
	businessID := uuid.New()

	repo.EXPECT().FindByEmail(ctx, businessID, "dup@biz.test").Return(&entity.User{}, nil)

	_, err := svc.Create(ctx, businessID, "dup@biz.test", "Name", "password123", nil)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeEmailAlreadyExists {
		t.Fatalf("expected CodeEmailAlreadyExists, got %v", err)
	}
}

func TestUserCreateHashesPasswordAndAssignsRoles(t *testing.T) {
	svc, repo := newTestUserService(t)
	ctx := context.Background()
	businessID := uuid.New()
	roleID := uuid.New()

	repo.EXPECT().FindByEmail(ctx, businessID, "new@biz.test").Return(nil, repository.ErrNotFound)
	repo.EXPECT().Create(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, u *entity.User) error {
		if !hash.Compare(u.PasswordHash, "password123") {
			t.Error("expected stored hash to match submitted password")
		}
		return nil
	})
	repo.EXPECT().AssignRoles(ctx, gomock.Any(), []uuid.UUID{roleID}, (*uuid.UUID)(nil)).Return(nil)

	u, err := svc.Create(ctx, businessID, "new@biz.test", "New User", "password123", []uuid.UUID{roleID})
	if err != nil {
		t.Fatal(err)
	}
	if u.Status != entity.UserStatusActive {
		t.Errorf("Status = %q, want active", u.Status)
	}
}

func TestUserGetMapsNotFound(t *testing.T) {
	svc, repo := newTestUserService(t)
	ctx := context.Background()
	businessID, id := uuid.New(), uuid.New()

	repo.EXPECT().FindByID(ctx, businessID, id).Return(nil, repository.ErrNotFound)

	_, err := svc.Get(ctx, businessID, id)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v", err)
	}
}

func TestUserDeleteMapsNotFound(t *testing.T) {
	svc, repo := newTestUserService(t)
	ctx := context.Background()
	businessID, id := uuid.New(), uuid.New()

	repo.EXPECT().Delete(ctx, businessID, id).Return(repository.ErrNotFound)

	err := svc.Delete(ctx, businessID, id)
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v", err)
	}
}

func TestUserUpdatePartialFieldsAndSkipsRoleAssignmentWhenNil(t *testing.T) {
	svc, repo := newTestUserService(t)
	ctx := context.Background()
	businessID, id := uuid.New(), uuid.New()
	existing := &entity.User{IDMixin: entity.IDMixin{ID: id}, FullName: "Old Name", Status: entity.UserStatusActive}

	repo.EXPECT().FindByID(ctx, businessID, id).Return(existing, nil)
	repo.EXPECT().Update(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, u *entity.User) error {
		if u.FullName != "New Name" {
			t.Errorf("FullName = %q, want New Name", u.FullName)
		}
		return nil
	})
	// AssignRoles must NOT be called since roleIDs is nil (no role change
	// requested) — no .EXPECT() registered for it, so gomock fails the test
	// if it is.

	newName := "New Name"
	_, err := svc.Update(ctx, businessID, id, &newName, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
}
