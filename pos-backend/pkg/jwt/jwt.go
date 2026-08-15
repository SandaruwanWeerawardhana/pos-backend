// Package jwt issues and verifies the stateless HS256 access token. Refresh
// tokens are deliberately not JWTs (see internal/service/token_service.go) —
// this package only ever handles the 15-minute access token.
package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("jwt: invalid token")
	ErrExpiredToken = errors.New("jwt: expired token")
)

const TypeAccess = "access"

type Claims struct {
	BusinessID string   `json:"bid"`
	BranchID   string   `json:"brid,omitempty"`
	Roles      []string `json:"roles"`
	Type       string   `json:"typ"`
	jwt.RegisteredClaims
}

// Issuer mints and verifies access tokens for one configured secret/issuer/
// audience/TTL. Access and refresh tokens use different secrets, so callers
// hold one Issuer per token kind.
type Issuer struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
}

func NewIssuer(secret, issuer, audience string, ttl time.Duration) *Issuer {
	return &Issuer{secret: []byte(secret), issuer: issuer, audience: audience, ttl: ttl}
}

// Generate mints a signed access token for userID, returning the token, its
// jti (used as the Redis denylist key on logout), and its expiry.
func (i *Issuer) Generate(userID, businessID, branchID string, roles []string) (token, jti string, expiresAt time.Time, err error) {
	jti = uuid.NewString()
	now := time.Now()
	expiresAt = now.Add(i.ttl)

	claims := Claims{
		BusinessID: businessID,
		BranchID:   branchID,
		Roles:      roles,
		Type:       TypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    i.issuer,
			Audience:  jwt.ClaimStrings{i.audience},
			ID:        jti,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(i.secret)
	return signed, jti, expiresAt, err
}

// Parse verifies signature, issuer, audience, expiry, and that typ=="access".
// It never accepts an alg other than the configured HMAC method — trusting
// a token's own "alg" header is a classic algorithm-confusion bypass.
func (i *Issuer) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return i.secret, nil
	},
		jwt.WithIssuer(i.issuer),
		jwt.WithAudience(i.audience),
		jwt.WithExpirationRequired(),
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Name}),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}
	if !token.Valid || claims.Type != TypeAccess {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
