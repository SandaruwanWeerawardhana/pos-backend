package middleware

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"
)

// ErrorHandler is the single place that turns any error returned from a
// handler or middleware into the API's error body, {"message": "..."}.
// Anything that isn't an *apperror.AppError becomes a generic 500 — the real
// error is logged server-side under the request id, never echoed to the
// client, since the client renders the message string raw to a cashier.
//
// The error's stable code and field detail stay in the log line only: they are
// what makes a failure debuggable, and dropping them from the wire is a
// deliberate consequence of the client reading nothing but `message`.
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
		} else {
			// No wrapped cause, so nothing above logged this. Record it anyway:
			// the code and field detail are dropped from the response body, and
			// this line is the only remaining trace of which rule rejected the
			// request.
			logger.Warn("request rejected", "request_id", requestID, "code", string(ae.Code), "message", ae.Message, "path", c.Path())
		}

		// The request id travels in the X-Request-ID response header (see
		// RequestID middleware), so dropping it from the body loses nothing.
		return c.Status(ae.HTTPStatus).JSON(response.FromAppError(ae))
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
