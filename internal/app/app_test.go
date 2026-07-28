package app

import (
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/handler"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"
)

func TestHealthRouteDoesNotRequireInfrastructure(t *testing.T) {
	redisServer := miniredis.RunT(t)
	host, portText, err := net.SplitHostPort(redisServer.Addr())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	container := &Container{
		Config: &config.Config{
			App: config.AppConfig{Name: "test"},
			HTTP: config.HTTPConfig{
				BodyLimit:    1024,
				ReadTimeout:  time.Second,
				WriteTimeout: time.Second,
				IdleTimeout:  time.Second,
			},
			Redis: config.RedisConfig{
				Host: host, Port: port, PoolSize: 1,
			},
			Security: config.SecurityConfig{
				CORSAllowedOrigins:  []string{"http://localhost"},
				CORSAllowedMethods:  []string{"GET"},
				RateLimitMax:        1,
				RateLimitWindow:     time.Minute,
				AuthRateLimitMax:    1,
				AuthRateLimitWindow: time.Minute,
			},
		},
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Health: handler.NewHealthHandler(nil, nil),
	}
	app := New(container)

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/health", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusOK)
	}

	var envelope response.Envelope
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	if !envelope.Success {
		t.Fatal("health response success = false")
	}
}
