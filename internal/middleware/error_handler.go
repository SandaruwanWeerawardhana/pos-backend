package middleware

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"
)

// ErrorHandler is the single place that turns any error returned from a
// handler or middleware into the API's error envelope. Anything that isn't
// an *apperror.AppError becomes a generic 500 INTERNAL_ERROR — the real
// error is logged server-side under the request id, never echoed to the
// client.
func ErrorHandler(logger *slog.Logger) fiber.ErrorHandler {
	return func(c *fiber.Ctx, err error) error {
		requestID := RequestIDFromFiber(c)

		var fiberErr *fiber.Error
		if errors.As(err, &fiberErr) {
			err = apperror.New(mapFiberCode(fiberErr.Code), fiberErr.Message)
		}

		ae, ok := apperror.As(err)
		if !ok {
			logger.Error("unhandled error", "request_id", requestID, "error", err.Error(), "path", c.Path())
			ae = apperror.New(apperror.CodeInternal, "an unexpected error occurred")
		} else if ae.Internal != nil {
			logger.Error("request failed", "request_id", requestID, "code", string(ae.Code), "error", ae.Internal.Error(), "path", c.Path())
		}

		return c.Status(ae.HTTPStatus).JSON(response.FromAppError(requestID, ae))
	}
}

func mapFiberCode(code int) apperror.Code {
	switch code {
	case fiber.StatusBadRequest:
		return apperror.CodeBadRequest
	case fiber.StatusUnauthorized:
		return apperror.CodeUnauthenticated
	case fiber.StatusForbidden:
		return apperror.CodeForbidden
	case fiber.StatusNotFound:
		return apperror.CodeNotFound
	case fiber.StatusConflict:
		return apperror.CodeConflict
	case fiber.StatusTooManyRequests:
		return apperror.CodeRateLimited
	default:
		return apperror.CodeInternal
	}
}
