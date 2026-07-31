package middleware

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func newTestApp() *fiber.App {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return fiber.New(fiber.Config{ErrorHandler: ErrorHandler(logger)})
}

func TestErrorHandlerMapsAppErrorToMessageBody(t *testing.T) {
	app := newTestApp()
	app.Get("/notfound", func(c *fiber.Ctx) error {
		return apperror.New(apperror.CodeNotFound, "user not found")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/notfound", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	// The status code carries the category; the body carries only the message
	// the client renders to a cashier.
	if body["message"] != "user not found" {
		t.Errorf("message = %v, want %q", body["message"], "user not found")
	}
	if len(body) != 1 {
		t.Errorf("body has %d fields, want only message: %+v", len(body), body)
	}
}

func TestErrorHandlerConvertsUnknownErrorToGenericInternalError(t *testing.T) {
	app := newTestApp()
	app.Get("/boom", func(c *fiber.Ctx) error {
		return errSentinel
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/boom", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("status = %d, want 500", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	// The raw error text must never leak to the client — only the generic
	// message.
	if body["message"] != "an unexpected error occurred" {
		t.Errorf("expected the generic message, got %+v", body)
	}
}

func TestErrorHandlerMapsFiberErrorCode(t *testing.T) {
	app := newTestApp()
	app.Get("/bad", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusBadRequest, "malformed body")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/bad", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

type sentinelError struct{}

func (sentinelError) Error() string { return "internal database explosion, do not leak this" }

var errSentinel = sentinelError{}
