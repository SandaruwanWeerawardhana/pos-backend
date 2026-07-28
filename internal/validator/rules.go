package validator

import (
	govalidator "github.com/go-playground/validator/v10"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/hash"
)

func registerRules(v *govalidator.Validate) {
	_ = v.RegisterValidation("bcryptsafe", bcryptSafe)
}

// bcryptSafe rejects a password whose UTF-8 byte length exceeds bcrypt's
// 72-byte input limit. The builtin "max" tag counts runes, not bytes, so it
// would silently accept a password that bcrypt then truncates — letting two
// different long passwords authenticate the same account.
func bcryptSafe(fl govalidator.FieldLevel) bool {
	return !hash.TooLong(fl.Field().String())
}
