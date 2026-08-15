package service_test

import (
	"context"
	"encoding/json"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	"testing"

	"github.com/google/uuid"
	"go.uber.org/mock/gomock"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository/mocks"
)

func TestAuditLogPopulatesOptionalFieldsOnlyWhenSet(t *testing.T) {
	ctrl := gomock.NewController(t)
	repo := mocks.NewMockAuditLogRepository(ctrl)
	svc := service.NewAuditService(repo)

	businessID := uuid.New()
	userID := uuid.New()

	repo.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, log *entity.AuditLog) error {
		if log.BusinessID == nil || *log.BusinessID != businessID {
			t.Errorf("BusinessID = %v, want %v", log.BusinessID, businessID)
		}
		if log.UserID == nil || *log.UserID != userID {
			t.Errorf("UserID = %v, want %v", log.UserID, userID)
		}
		if log.Action != entity.AuditActionLogin || log.Status != entity.AuditStatusSuccess {
			t.Errorf("unexpected action/status: %s/%s", log.Action, log.Status)
		}
		if log.IPAddress == nil || *log.IPAddress != "1.2.3.4" {
			t.Errorf("IPAddress = %v, want 1.2.3.4", log.IPAddress)
		}
		return nil
	})

	err := svc.Log(context.Background(), service.AuditEntry{
		BusinessID: &businessID,
		UserID:     &userID,
		Action:     entity.AuditActionLogin,
		Status:     entity.AuditStatusSuccess,
		IPAddress:  "1.2.3.4",
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestAuditLogLeavesOptionalFieldsNilWhenNotSet(t *testing.T) {
	ctrl := gomock.NewController(t)
	repo := mocks.NewMockAuditLogRepository(ctrl)
	svc := service.NewAuditService(repo)

	repo.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, log *entity.AuditLog) error {
		if log.BusinessID != nil || log.UserID != nil || log.IPAddress != nil || log.UserAgent != nil || log.RequestID != nil {
			t.Errorf("expected nil optional fields, got %+v", log)
		}
		return nil
	})

	err := svc.Log(context.Background(), service.AuditEntry{
		Action: entity.AuditActionLogin,
		Status: entity.AuditStatusFailure,
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestAuditLogMarshalsNewValues(t *testing.T) {
	ctrl := gomock.NewController(t)
	repo := mocks.NewMockAuditLogRepository(ctrl)
	svc := service.NewAuditService(repo)

	repo.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, log *entity.AuditLog) error {
		var decoded map[string]string
		if err := json.Unmarshal(log.NewValues, &decoded); err != nil {
			t.Fatalf("failed to unmarshal NewValues: %v", err)
		}
		if decoded["reason"] != "invalid credentials" {
			t.Errorf("decoded = %+v", decoded)
		}
		return nil
	})

	err := svc.Log(context.Background(), service.AuditEntry{
		Action:    entity.AuditActionLogin,
		Status:    entity.AuditStatusFailure,
		NewValues: map[string]string{"reason": "invalid credentials"},
	})
	if err != nil {
		t.Fatal(err)
	}
}
