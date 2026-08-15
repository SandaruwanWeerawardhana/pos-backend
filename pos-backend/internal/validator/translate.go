package validator

import (
	"fmt"

	govalidator "github.com/go-playground/validator/v10"
)

// translate renders a validator.FieldError as an end-user message. Keep in
// sync with config.describe()'s tag set — same tags, different audience
// (request body vs. environment variables).
func translate(fe govalidator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", fe.Field())
	case "email":
		return fmt.Sprintf("%s must be a valid email address", fe.Field())
	case "min":
		return fmt.Sprintf("%s must be at least %s characters", fe.Field(), fe.Param())
	case "max":
		return fmt.Sprintf("%s must be at most %s characters", fe.Field(), fe.Param())
	case "oneof":
		return fmt.Sprintf("%s must be one of [%s]", fe.Field(), fe.Param())
	case "uuid4":
		return fmt.Sprintf("%s must be a valid UUID", fe.Field())
	case "e164":
		return fmt.Sprintf("%s must be a valid phone number in E.164 format", fe.Field())
	case "bcryptsafe":
		return fmt.Sprintf("%s must be at most 72 bytes", fe.Field())
	default:
		return fmt.Sprintf("%s failed validation %q", fe.Field(), fe.Tag())
	}
}
