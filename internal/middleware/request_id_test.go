package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestRequestIDExecutesHandlerOnceAndEchoesHeader(t *testing.T) {
	app := fiber.New()
	app.Use(RequestID())
	calls := 0
	app.Get("/", func(c *fiber.Ctx) error {
		calls++
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(HeaderRequestID, "request-123")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", resp.StatusCode, fiber.StatusNoContent)
	}
	if calls != 1 {
		t.Fatalf("handler calls = %d, want 1", calls)
	}
	if got := resp.Header.Get(HeaderRequestID); got != "request-123" {
		t.Fatalf("request id = %q, want request-123", got)
	}
}
