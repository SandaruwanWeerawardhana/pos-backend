// Package validator wraps go-playground/validator so handlers only ever see
// *apperror.AppError, never validator.ValidationErrors directly.
package validator

import (
	"errors"
	"reflect"
	"strings"

	govalidator "github.com/go-playground/validator/v10"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/strutil"
)

// V is the process-wide validator instance. Struct tags report the JSON
// field name (via RegisterTagNameFunc), so a validation error's "field"
// matches what the client actually sent, not the Go struct field name.
var V = newValidator()

func newValidator() *govalidator.Validate {
	v := govalidator.New(govalidator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
		if name == "-" || name == "" {
			return f.Name
		}
		return name
	})
	registerRules(v)
	return v
}

// Struct validates s and converts every failure into one AppError carrying
// a FieldError per invalid field, so the handler layer never touches
// validator.ValidationErrors directly.
func Struct(s any) error {
	err := V.Struct(s)
	if err == nil {
		return nil
	}

	var fieldErrs govalidator.ValidationErrors
	if !errors.As(err, &fieldErrs) {
		return apperror.Wrap(apperror.CodeValidationError, "invalid request", err)
	}

	fields := make([]apperror.FieldError, 0, len(fieldErrs))
	for _, fe := range fieldErrs {
		fields = append(fields, apperror.FieldError{
			Field:   fe.Field(),
			Rule:    fe.Tag(),
			Message: translate(fe),
			Value:   strutil.Redact(fe.Field(), fe.Value()),
		})
	}

	return apperror.WithFields(apperror.CodeValidationError, "validation failed", fields)
}
