package logger

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/ctxkey"
)

func TestNewJSONFormat(t *testing.T) {
	l := New("json", "info")
	if l == nil {
		t.Fatal("expected a non-nil logger")
	}
}

func TestNewTextFormat(t *testing.T) {
	l := New("text", "debug")
	if l == nil {
		t.Fatal("expected a non-nil logger")
	}
}

func TestNewUnknownLevelDefaultsToInfo(t *testing.T) {
	var buf bytes.Buffer
	handler := slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: parseLevel("bogus")})
	l := slog.New(handler)

	l.Debug("should not appear")
	l.Info("should appear")

	out := buf.String()
	if strings.Contains(out, "should not appear") {
		t.Error("debug line should be filtered at the default info level")
	}
	if !strings.Contains(out, "should appear") {
		t.Error("info line should be logged at the default info level")
	}
}

func TestFromContextAttachesRequestID(t *testing.T) {
	var buf bytes.Buffer
	base := slog.New(slog.NewTextHandler(&buf, nil))

	ctx := context.WithValue(context.Background(), ctxkey.RequestID, "req-123")
	l := FromContext(ctx, base)
	l.Info("hello")

	if !strings.Contains(buf.String(), "req-123") {
		t.Errorf("expected request_id in log output, got %s", buf.String())
	}
}

func TestFromContextWithoutRequestIDReturnsBaseUnchanged(t *testing.T) {
	var buf bytes.Buffer
	base := slog.New(slog.NewTextHandler(&buf, nil))

	l := FromContext(context.Background(), base)
	l.Info("hello")

	if strings.Contains(buf.String(), "request_id") {
		t.Errorf("did not expect request_id in log output, got %s", buf.String())
	}
}
