package middleware

import (
	"context"
	"testing"

	"go.uber.org/mock/gomock"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	servicemocks "github.com/SandaruwanWeerawardhana/pos-backend/internal/service/mocks"
)

func TestAuditWorkerCloseDrainsQueue(t *testing.T) {
	audit := servicemocks.NewMockAuditService(gomock.NewController(t))
	audit.EXPECT().Log(gomock.Any(), service.AuditEntry{Action: "login"}).Return(nil)
	audit.EXPECT().Log(gomock.Any(), service.AuditEntry{Action: "logout"}).Return(nil)

	worker := NewAuditWorker(audit, 2, discardLogger())
	if err := worker.Log(context.Background(), service.AuditEntry{Action: "login"}); err != nil {
		t.Fatal(err)
	}
	if err := worker.Log(context.Background(), service.AuditEntry{Action: "logout"}); err != nil {
		t.Fatal(err)
	}
	worker.Close()
}
