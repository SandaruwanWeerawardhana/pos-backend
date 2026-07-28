package middleware

import (
	"context"
	"log/slog"
	"sync"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

// AuditWorker decouples audit writes from the request path. It implements
// service.AuditService itself, so it is a drop-in replacement for the
// synchronous implementation at the DI wiring point: Enqueue (via Log)
// never blocks the caller — a full buffer drops the entry rather than
// stalling a checkout — and a single background goroutine drains it into
// the real AuditService.
type AuditWorker struct {
	svc    service.AuditService
	queue  chan service.AuditEntry
	logger *slog.Logger
	once   sync.Once
	done   chan struct{}
}

func NewAuditWorker(svc service.AuditService, bufferSize int, logger *slog.Logger) *AuditWorker {
	w := &AuditWorker{
		svc:    svc,
		queue:  make(chan service.AuditEntry, bufferSize),
		logger: logger,
		done:   make(chan struct{}),
	}
	go w.run()
	return w
}

// Log satisfies service.AuditService by enqueuing instead of writing
// synchronously. It always returns nil — a dropped or delayed audit entry
// must never fail the request it describes.
func (w *AuditWorker) Log(_ context.Context, entry service.AuditEntry) error {
	select {
	case w.queue <- entry:
	default:
		w.logger.Warn("audit queue full, dropping entry", "action", entry.Action)
	}
	return nil
}

func (w *AuditWorker) run() {
	defer close(w.done)
	for entry := range w.queue {
		if err := w.svc.Log(context.Background(), entry); err != nil {
			w.logger.Error("failed to persist audit log", "action", entry.Action, "error", err.Error())
		}
	}
}

// Close stops accepting new entries. Call it during graceful shutdown,
// after the HTTP server has stopped accepting requests, so in-flight
// entries still get a chance to drain.
func (w *AuditWorker) Close() {
	w.once.Do(func() {
		close(w.queue)
		<-w.done
	})
}
