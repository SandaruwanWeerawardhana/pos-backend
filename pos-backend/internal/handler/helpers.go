package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	appvalidator "github.com/SandaruwanWeerawardhana/pos-backend/internal/validator"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

func parseAndValidate(c *fiber.Ctx, dst any) error {
	if err := c.BodyParser(dst); err != nil {
		return apperror.Wrap(apperror.CodeBadRequest, "invalid JSON request body", err)
	}
	return appvalidator.Struct(dst)
}

func parseID(value, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, apperror.WithFields(
			apperror.CodeValidationError,
			"validation failed",
			[]apperror.FieldError{{
				Field:   field,
				Rule:    "uuid",
				Message: field + " must be a valid UUID",
				Value:   value,
			}},
		)
	}
	return id, nil
}

func parseIDs(values []string, field string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := parseID(value, field)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func requestMeta(c *fiber.Ctx) service.RequestMeta {
	return service.RequestMeta{
		IPAddress: c.IP(),
		UserAgent: c.Get(fiber.HeaderUserAgent),
		RequestID: middleware.RequestIDFromFiber(c),
	}
}

// ok writes data as the response body with no envelope around it. The
// frontend's httpClient returns the parsed body directly to its caller, so
// what a handler passes here is exactly what the client receives.
func ok(c *fiber.Ctx, status int, data any) error {
	return c.Status(status).JSON(data)
}
