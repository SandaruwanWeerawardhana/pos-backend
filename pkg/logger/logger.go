// Package logger builds the application's slog.Logger and attaches the
// per-request correlation id (see pkg/ctxkey) so every log line from one
// request, and its error envelope, share the same request_id.
package logger

import (
	"context"
	"log/slog"
	"os"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/ctxkey"
)

// New builds a logger writing to stdout. format/level mirror
// config.AppConfig's LOG_FORMAT/LOG_LEVEL ("text"|"json", "debug".."error").
func New(format, level string) *slog.Logger {
	return slog.New(newHandler(format, parseLevel(level)))
}

func newHandler(format string, level slog.Level) slog.Handler {
	opts := &slog.HandlerOptions{Level: level}
	if format == "json" {
		return slog.NewJSONHandler(os.Stdout, opts)
	}
	return slog.NewTextHandler(os.Stdout, opts)
}

func parseLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// FromContext returns base enriched with ctx's request id, if the request-id
// middleware has set one, so every log line in this call chain carries it.
func FromContext(ctx context.Context, base *slog.Logger) *slog.Logger {
	if id, ok := ctx.Value(ctxkey.RequestID).(string); ok && id != "" {
		return base.With("request_id", id)
	}
	return base
}
