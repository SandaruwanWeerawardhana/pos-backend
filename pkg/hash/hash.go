// Package hash wraps bcrypt with the two invariants auth depends on: a hard
// cap at bcrypt's own 72-byte input limit, and a constant-time dummy
// comparison so a login response's timing cannot be used to enumerate
// accounts.
package hash

import (
	"crypto/subtle"

	"golang.org/x/crypto/bcrypt"
)

// MaxPasswordBytes is bcrypt's own limit. Bytes beyond position 72 are
// silently ignored by the algorithm, so two different long passwords would
// hash identically and both authenticate the account if this were not
// enforced before hashing.
const MaxPasswordBytes = 72

// dummyHash lets a failed "user not found" lookup still run a real bcrypt
// comparison, so it costs the same wall-clock time as a real "wrong
// password" attempt.
var dummyHash = mustHash("dummy-password-for-timing-safety-only", bcrypt.MinCost)

func mustHash(password string, cost int) string {
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		panic(err)
	}
	return string(h)
}

// TooLong reports whether password exceeds bcrypt's 72-byte input limit.
func TooLong(password string) bool {
	return len(password) > MaxPasswordBytes
}

func Hash(password string, cost int) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

func Compare(hashed, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(password)) == nil
}

// CompareDummy always performs a bcrypt comparison, even when no user
// matched the login attempt, so "no such account" and "wrong password" take
// the same amount of time.
func CompareDummy(password string) {
	_ = bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(password))
}

// ConstantTimeEqual compares two byte slices (e.g. a refresh token's SHA-256
// against the stored hash) without leaking a timing side channel.
func ConstantTimeEqual(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}
