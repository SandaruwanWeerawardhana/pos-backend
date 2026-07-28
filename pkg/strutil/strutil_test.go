package strutil

import "testing"

func TestIsSensitive(t *testing.T) {
	cases := map[string]bool{
		"password":      true,
		"Password":      true,
		"PASSWORD_HASH": true,
		"token":         true,
		"secret":        true,
		"email":         false,
		"name":          false,
	}
	for field, want := range cases {
		if got := IsSensitive(field); got != want {
			t.Errorf("IsSensitive(%q) = %v, want %v", field, got, want)
		}
	}
}

func TestRedact(t *testing.T) {
	if got := Redact("password", "hunter2"); got != "[REDACTED]" {
		t.Errorf("Redact(password) = %v, want [REDACTED]", got)
	}
	if got := Redact("email", "a@b.com"); got != "a@b.com" {
		t.Errorf("Redact(email) = %v, want unchanged", got)
	}
}

func TestEscapeLike(t *testing.T) {
	cases := map[string]string{
		"100%":       `100\%`,
		"a_b":        `a\_b`,
		`back\slash`: `back\\slash`,
		"plain":      "plain",
	}
	for in, want := range cases {
		if got := EscapeLike(in); got != want {
			t.Errorf("EscapeLike(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTruncate(t *testing.T) {
	if got := Truncate("hello", 3); got != "hel" {
		t.Errorf("Truncate = %q, want %q", got, "hel")
	}
	if got := Truncate("hi", 10); got != "hi" {
		t.Errorf("Truncate = %q, want unchanged", got)
	}
}
