// Package strutil holds small, dependency-free string helpers shared across
// layers: redaction of sensitive field names, safe ILIKE escaping, and
// bounded truncation for logging.
package strutil

import "strings"

var sensitiveFieldNames = map[string]struct{}{
	"password":      {},
	"password_hash": {},
	"token":         {},
	"secret":        {},
	"access_token":  {},
	"refresh_token": {},
}

// IsSensitive reports whether a field name must never echo its value back in
// an error response or a log line.
func IsSensitive(field string) bool {
	_, ok := sensitiveFieldNames[strings.ToLower(field)]
	return ok
}

// Redact returns "[REDACTED]" for a sensitive field name, or value unchanged.
func Redact(field string, value any) any {
	if IsSensitive(field) {
		return "[REDACTED]"
	}
	return value
}

// EscapeLike escapes backslash, %, and _ so a search term is matched
// literally inside a LIKE/ILIKE pattern instead of being interpreted as a
// wildcard. The caller still wraps the result in %...%.
func EscapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// Truncate cuts s to at most n runes, for safely logging user input of
// unbounded length.
func Truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}
