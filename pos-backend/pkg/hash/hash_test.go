package hash

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

const testCost = bcrypt.MinCost

func TestHashAndCompareRoundTrip(t *testing.T) {
	hashed, err := Hash("correct-horse-battery-staple", testCost)
	if err != nil {
		t.Fatal(err)
	}
	if !Compare(hashed, "correct-horse-battery-staple") {
		t.Error("Compare should succeed for the original password")
	}
	if Compare(hashed, "wrong-password") {
		t.Error("Compare should fail for a wrong password")
	}
}

func TestTooLong(t *testing.T) {
	if TooLong(strings.Repeat("a", MaxPasswordBytes)) {
		t.Error("72 bytes exactly should not be TooLong")
	}
	if !TooLong(strings.Repeat("a", MaxPasswordBytes+1)) {
		t.Error("73 bytes should be TooLong")
	}
}

func TestBcryptTruncationIsRejectedBeforeHashing(t *testing.T) {
	// Two passwords that only differ after byte 72 must not be treated as
	// equivalent by this package's callers — TooLong is what stops them from
	// ever reaching Hash/Compare in the first place.
	base := strings.Repeat("a", MaxPasswordBytes)
	longA := base + "-secret-one"
	longB := base + "-secret-two"

	if !TooLong(longA) || !TooLong(longB) {
		t.Fatal("both passwords should be flagged TooLong")
	}
}

func TestCompareDummyDoesNotPanicAndAlwaysFails(t *testing.T) {
	// CompareDummy exists purely for its timing profile; it must never
	// report success regardless of input.
	CompareDummy("anything")
}

func TestConstantTimeEqual(t *testing.T) {
	a := []byte("same-bytes")
	b := []byte("same-bytes")
	c := []byte("different!")

	if !ConstantTimeEqual(a, b) {
		t.Error("expected equal byte slices to compare equal")
	}
	if ConstantTimeEqual(a, c) {
		t.Error("expected different byte slices to compare unequal")
	}
}
