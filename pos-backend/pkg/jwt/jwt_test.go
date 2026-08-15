package jwt

import (
	"testing"
	"time"

	goJwt "github.com/golang-jwt/jwt/v5"
)

func newTestIssuer(ttl time.Duration) *Issuer {
	return NewIssuer("test-secret-at-least-32-bytes-long!", "pos-backend", "pos-frontend", ttl)
}

func TestGenerateAndParseRoundTrip(t *testing.T) {
	issuer := newTestIssuer(15 * time.Minute)

	token, jti, expiresAt, err := issuer.Generate("user-1", "biz-1", "branch-1", []string{"owner"})
	if err != nil {
		t.Fatal(err)
	}
	if token == "" || jti == "" {
		t.Fatal("expected non-empty token and jti")
	}
	if !expiresAt.After(time.Now()) {
		t.Fatal("expiresAt should be in the future")
	}

	claims, err := issuer.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "user-1" || claims.BusinessID != "biz-1" || claims.BranchID != "branch-1" {
		t.Errorf("unexpected claims: %+v", claims)
	}
	if claims.ID != jti {
		t.Errorf("claims.ID = %s, want %s", claims.ID, jti)
	}
	if claims.Type != TypeAccess {
		t.Errorf("claims.Type = %s, want %s", claims.Type, TypeAccess)
	}
}

func TestParseRejectsExpiredToken(t *testing.T) {
	issuer := newTestIssuer(-1 * time.Minute) // already expired
	token, _, _, err := issuer.Generate("user-1", "biz-1", "", nil)
	if err != nil {
		t.Fatal(err)
	}

	_, err = issuer.Parse(token)
	if err != ErrExpiredToken {
		t.Errorf("err = %v, want ErrExpiredToken", err)
	}
}

func TestParseRejectsWrongSecret(t *testing.T) {
	issuer := newTestIssuer(15 * time.Minute)
	token, _, _, err := issuer.Generate("user-1", "biz-1", "", nil)
	if err != nil {
		t.Fatal(err)
	}

	other := NewIssuer("a-completely-different-32-byte-secret!!", "pos-backend", "pos-frontend", 15*time.Minute)
	_, err = other.Parse(token)
	if err != ErrInvalidToken {
		t.Errorf("err = %v, want ErrInvalidToken", err)
	}
}

func TestParseRejectsAlgNone(t *testing.T) {
	// Forge a token with alg=none and no signature — the classic
	// algorithm-confusion bypass. Parse must reject it even though the
	// claims themselves look valid.
	claims := Claims{
		Type: TypeAccess,
		RegisteredClaims: goJwt.RegisteredClaims{
			Subject:   "user-1",
			Issuer:    "pos-backend",
			Audience:  goJwt.ClaimStrings{"pos-frontend"},
			ExpiresAt: goJwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := goJwt.NewWithClaims(goJwt.SigningMethodNone, claims)
	forged, err := tok.SignedString(goJwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}

	issuer := newTestIssuer(15 * time.Minute)
	_, err = issuer.Parse(forged)
	if err != ErrInvalidToken {
		t.Errorf("err = %v, want ErrInvalidToken for alg=none", err)
	}
}

func TestParseRejectsWrongAudience(t *testing.T) {
	issuer := newTestIssuer(15 * time.Minute)
	other := NewIssuer("test-secret-at-least-32-bytes-long!", "pos-backend", "some-other-audience", 15*time.Minute)

	token, _, _, err := other.Generate("user-1", "biz-1", "", nil)
	if err != nil {
		t.Fatal(err)
	}

	_, err = issuer.Parse(token)
	if err != ErrInvalidToken {
		t.Errorf("err = %v, want ErrInvalidToken for mismatched audience", err)
	}
}
