package service

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// TokenDenylist holds the jti of access tokens killed before their natural
// expiry — logout, password reset, admin revoke — so the auth middleware can
// reject them without waiting out the access TTL.
type TokenDenylist interface {
	Add(ctx context.Context, jti string, ttl time.Duration) error
	Has(ctx context.Context, jti string) (bool, error)
}

type redisDenylist struct {
	client *redis.Client
}

// NewRedisDenylist is the real denylist: shared by every instance and it
// survives a restart. Use this everywhere except local development.
func NewRedisDenylist(client *redis.Client) TokenDenylist {
	return &redisDenylist{client: client}
}

func (d *redisDenylist) Add(ctx context.Context, jti string, ttl time.Duration) error {
	return d.client.Set(ctx, denylistKeyPrefix+jti, "1", ttl).Err()
}

func (d *redisDenylist) Has(ctx context.Context, jti string) (bool, error) {
	n, err := d.client.Exists(ctx, denylistKeyPrefix+jti).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// memoryDenylist is the REDIS_ENABLED=false fallback. It is process-local and
// lost on restart, so a token revoked here is honoured again by the next boot
// until its own expiry catches up, and a second instance never sees it at all.
// Local development only.
type memoryDenylist struct {
	mu      sync.Mutex
	expires map[string]time.Time
}

func NewMemoryDenylist() TokenDenylist {
	return &memoryDenylist{expires: make(map[string]time.Time)}
}

func (d *memoryDenylist) Add(_ context.Context, jti string, ttl time.Duration) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.purgeExpired()
	d.expires[jti] = time.Now().Add(ttl)
	return nil
}

func (d *memoryDenylist) Has(_ context.Context, jti string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	expiry, found := d.expires[jti]
	if !found {
		return false, nil
	}
	if time.Now().After(expiry) {
		delete(d.expires, jti)
		return false, nil
	}
	return true, nil
}

// purgeExpired keeps the map from growing without bound. Entries are only ever
// added on revoke, so sweeping on every write is cheap.
func (d *memoryDenylist) purgeExpired() {
	now := time.Now()
	for jti, expiry := range d.expires {
		if now.After(expiry) {
			delete(d.expires, jti)
		}
	}
}
