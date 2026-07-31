# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

POS (Point of Sale) backend. Go + Fiber + PostgreSQL + Redis. Multi-tenant with role-based permissions.

API is HTTP-only, no gRPC. Frontend at pos-frontend/ calls eleven endpoints (Phase 1) — shapes in docs/API_CONTRACT.md are the spec. Frontend caches product catalogue in IndexedDB; offline-first, syncs orders back in batches of ≤ 50 and pushes product creates, edits and deletes one at a time.

## Stack

| Layer | Tech |
|-------|------|
| HTTP | Fiber v2 |
| DB | PostgreSQL + GORM |
| Cache/sessions | Redis |
| Auth | JWT (HS256), refresh tokens in Redis, access TTL **12h** (not 15m — cashiers work long shifts) |
| Logging | slog, text or JSON |
| Migrations | goose (in database/migrations/) |

## Build and run

```bash
make run                    # API on localhost:8080
make build                  # bin/api, bin/migrate, bin/seed
```

Config from `.env` (local dev only). Prod uses real env vars; `.env` is ignored by the app. Every var in `.env.example` is required; many have sensible defaults but `JWT_*_SECRET` do not.

## Test

```bash
make test                   # unit tests (-short -race)
make test-integration       # integration tests (needs local Postgres/Redis running)
make cover                  # coverage report for internal/ and pkg/
```

Failing test? Integration tests need a live local Postgres and Redis — check they're running and reachable per `.env`.

## Database

```bash
make migrate-up             # apply all pending migrations
make migrate-down           # revert last batch
make migrate-status         # show pending
make seed                   # provision owner + demo business
```

Migrations are in database/migrations/ with goose numbering (00001_*.sql). `DB_AUTO_MIGRATE=true` in .env runs migrations on startup; set to false for production to audit first.

Seed script is cmd/seed/main.go. Creates one owner user, one business, one branch; skips if any exist. Owner credentials from `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (empty password means randomly generated and printed to stdout).

## Architecture

### DI container

Entry point: cmd/api/main.go → internal/app/NewContainer(ctx) → internal/app/New(container).

Container (internal/app/container.go) wires up:
- Config (validated at startup, fails fast)
- Logger (slog, format from config)
- PostgreSQL connection pool
- Redis client
- Repositories (User, Business, Branch, Role, Permission, RefreshToken, PasswordReset, AuditLog, Product, Order, Stock)
- Services (Auth, Token, Audit, Order sync, Password reset, Product, Permission)
- Handlers routed by internal/routes/routes.go

### Repositories

All in internal/repository/, using GORM. No N+1 magic; Preload() is explicit. Transactions via TxManager.

### Services

All in internal/service/, no handlers in there. Services call repos, repos call GORM.

### HTTP handlers

All in internal/handler/. Each handler:
1. Parses & validates DTO (internal/dto/)
2. Calls service
3. Returns response (pkg/response/)

Error responses: always `{"message": "..."}`, never `{"success": false}` or `{"code": 123}`. Handler calls middleware.ErrorHandler for wrapping panics.

Auth requests (login, register, both password-reset endpoints) are rate-limited to 5 per 15m. Everything else is 120 per minute.

### Responses and DTOs

**Response envelope**: Phase 1 endpoints return bare payloads (e.g., `GET /products` is a bare array, not `{"data": []}`). Error shape is strictly `{"message": "..."}`.

**DTO casing**:
- Auth bodies: camelCase (ownerName, businessName, email, password)
- Domain models (products, orders): snake_case (price_cents, tax_rate, stock_quantity)
- Money: integer cents everywhere
- Tax rates: fraction (0.08 = 8%), not cents
- Timestamps: epoch **milliseconds** (not seconds; exception: calendar dates like expiry_date are yyyy-mm-dd)

Special: dto.Cents (internal/dto/cents.go) accepts fractional JSON numbers and rounds (works around a client bug where weighted-item totals persist as floats).

### Auth

Services: AuthService, TokenService. Repos: UserRepository, RefreshTokenRepository.

JWT:
- Algorithm: HS256
- Access token: 12h TTL, stored nowhere (stateless)
- Refresh token: stored in Redis, 720h TTL, revoked on password change/reset
- Claims: `user_id`, `business_id`, `branch_id`, `roles` array, `permissions` array
- `exp` in **seconds** (RFC 7519), not milliseconds

Session revocation: immediate via Redis denylist (key: `token:revoked:{token_id}`). On logout or password change, all tokens are revoked.

Permissions: seeded as `resource.action` (e.g., `pos.sell`, `pos.discount`). Dotted, not colon-separated. Roles cache with TTL from AUTH_PERMISSION_CACHE_TTL.

### Order sync

Handler: internal/handler/order_handler.go.SyncOrders.
Service: internal/service/order_sync_service.go.

Batch size max 50. One result per submitted order, always — if results.length ≠ orders.length, the handler returns an error and the entire batch fails (client never sees a short list).

Idempotency on `client_generated_id`: enforced by a unique index. Duplicate inserts use `ON CONFLICT DO NOTHING`, so replay returns `already_synced` without deducting stock twice.

Per-order transactions: one bad order does not roll back the other 49.

Totals validation: server recomputes (`computeTotals`, mirrors cart-math.ts exactly) and flags mismatches in orders.totals_mismatch. Never rejects or corrects — a rounding disagreement would strand real revenue.

### Middleware

- auth: validates JWT, injects user context
- error_handler: catches panics, formats as `{"message": "..."}`
- CORS, rate-limit, request ID, audit logging

Audit: asynchronous via AuditWorker (buffered queue). Called from handlers but writes happen off-path.

## Code conventions

- Errors wrap with `fmt.Errorf()` and include context (e.g., "app: migrate database").
- Logging: slog calls with structured fields, no string concatenation.
- No global state except the container and logger.
- Tests use table-driven subtests. Mocked repos with uber/mock.
- Interfaces small and focused (e.g., TokenService, PermissionService).

## Linting

```bash
make lint       # golangci-lint
make fmt        # gofmt
make vet        # go vet
make tidy       # go mod tidy
```

## API contract

See docs/API_CONTRACT.md — it is the spec. Phase 1 is eleven endpoints (auth, product CRUD, order sync, profile). Phase 2 includes refunds, stock adjustments, purchasing, staff/PIN auth.

Endpoints:
- `POST /auth/register` → 201, `{token, user}`
- `POST /auth/login` → 200, `{token, user}`
- `POST /auth/password/reset-request` → 200, `{}`
- `POST /auth/password/reset` → 200, `{}`
- `POST /auth/password/change` → 200, `{}`
- `PATCH /auth/profile` → 200, `{user}`
- `GET /products` → 200, bare array
- `POST /products` → 201 (new) / 200 (already stored), the product; idempotent on the client-generated `id`
- `PUT /products/:id` → 200, the product; full replace (not a patch), `stock_quantity` and `batches` are server-owned and not writable
- `DELETE /products/:id` → 204; soft delete, frees the SKU/barcode via the partial unique indexes
- `POST /orders/sync` → 200, `{results[]}`

All except register/login require `Authorization: Bearer {token}`.

## Testing API with curl

```bash
BASE=http://localhost:8080

# Register
TOKEN=$(curl -sS -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"ownerName":"Jane","businessName":"Corner Shop","email":"jane@shop.lk","password":"correct-horse-battery","businessType":"grocery"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# List products (bare array)
curl -sS $BASE/products -H "Authorization: Bearer $TOKEN"

# Sync order
CGID=$(uuidgen)
curl -sS -X POST $BASE/orders/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"orders\":[{\"client_generated_id\":\"$CGID\",\"payment_method\":\"cash\",\"created_at\":$(date +%s000),\"total_cents\":398,\"tax_total_cents\":0,\"discount_cents\":0,\"items\":[{\"name\":\"Bananas\",\"quantity\":2,\"unit_price_cents\":199,\"tax_rate\":0}]}]}"
```

See docs/API_CONTRACT.md for the full smoke test.

## Git

Branch: dev (for PRs to main). Commits from recent history:
- ae44e6f feat: wire Fiber application and auth routes
- fe5c000 feat: complete backend pass one middleware
- ef9feba Update .gitignore
- aea906b first commit

## Docs

- docs/API_CONTRACT.md — API contract, Phase 1 vs Phase 2, response shapes, casing, limits, permissions
- README.md — project overview
- .env.example — all config vars with defaults and descriptions

## If adding an endpoint

1. Create entity (internal/entity/) if new domain model
2. Create DTO (internal/dto/) for request/response
3. Create repository (internal/repository/) if new data access needed
4. Create service (internal/service/) with business logic
5. Create handler (internal/handler/)
6. Wire in container.go (instantiate repo/service)
7. Register route in routes/*.go
8. Add test coverage (handlers and service, not repos)
9. Update docs/API_CONTRACT.md
10. Test with curl before committing

If adding a permission:
1. Add seed migration (database/migrations/0000X_*.sql) with INSERT into permissions
2. Update roles that should have it (via CROSS JOIN for owner, explicit INSERT for others)
3. Update frontend pos-frontend/src/lib/permissions.ts list
4. Endpoint gating is Phase 2 (currently only auth is checked)

## Environment checklist

Before developing:
- [ ] Go 1.25+
- [ ] Local Postgres + Redis running, reachable per `.env` (DB_HOST/PORT, REDIS_HOST/PORT)
- [ ] cp .env.example .env
- [ ] `make migrate-up` and `make seed`
- [ ] `make run` — should listen on 8080
- [ ] `make test` — should pass
