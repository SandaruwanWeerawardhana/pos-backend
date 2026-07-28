// Package middleware holds the Fiber middleware chain. Fiber ships
// cors/helmet/limiter/recover/requestid/compress/csrf as subpackages, so
// most files here just configure those instead of reimplementing them.
package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

// Recover must be the outermost middleware in the chain (registered first)
// so a panic anywhere downstream still reaches ErrorHandler and produces a
// JSON envelope instead of Fiber's default plaintext 500.
func Recover() fiber.Handler {
	return recover.New(recover.Config{EnableStackTrace: true})
}
