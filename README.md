# POS Backend

A multi-tenant, role-based Point of Sale backend built with Go, Fiber, PostgreSQL, and Redis. Designed for offline-first retail POS terminals that sync orders and products to a centralized server.

## Overview

The POS Backend provides a RESTful API for retail point-of-sale operations. It supports:
- **Multi-tenancy**: Isolated data per business with branch-level organization
- **Offline-first sync**: POS terminals operate independently and batch-sync orders/products when online
- **JWT authentication**: 12-hour access tokens optimized for long cashier shifts
- **Role-based access control**: Fine-grained permissions for user management
- **Real-time product sync**: Create, update, and delete products with stock tracking
- **Order processing**: Batch order synchronization with idempotent replay protection

The frontend (`pos-frontend/`) is a React/TypeScript offline-first POS application that caches products in IndexedDB and uses this API as its sync endpoint.

## Features

### Authentication & Authorization
- User registration and login with email/password
- JWT-based authentication (HS256, 12-hour TTL for cashier shifts)
- Refresh token management with Redis-backed denylist
- Password reset (email-verified)
- Password change (authenticated)
- Session-based logout and logout-all (revoke all tokens)
- Role-based permissions (owner, manager, cashier, etc.)
- Account lockout after failed login attempts (15-minute lockout)

### User Management
- User registration and profile management
- User status tracking (active, suspended, invited)
- Two-factor authentication columns (reserved for Phase 2)
- Phone/email verification columns (reserved for Phase 2)
- Login history tracking

### Product Management
- Full CRUD operations on product catalogue
- SKU and barcode management (unique per business)
- Stock quantity tracking with weighted units (kg, g, l, ml, pack, box)
- Batch/expiry tracking for perishables
- Product variants (category, brand, description, shelf location)
- Discount and pricing management
- Status management (active, inactive, draft)
- Idempotent product creation (client-generated UUIDs)

### Order Processing
- Batch order synchronization from offline POS terminals
- Per-order idempotency (prevents duplicate sales from replay)
- Automatic stock deduction with per-order transactions
- Payment method tracking (cash, card, QR, other)
- Automatic totals validation (detects but doesn't reject mismatches)
- Order reconciliation with offline-generated data

### System Features
- Multi-tenant data isolation per business
- Branch-level organization within businesses
- Audit logging of all mutations (asynchronous, non-blocking)
- Rate limiting (120/min default, 5/15min for auth endpoints)
- CORS support for frontend integration
- Request ID tracking for debugging
- Structured logging (text or JSON format)
- Graceful shutdown with timeout

## Tech Stack

| Category | Technology |
|----------|------------|
| **Language** | Go 1.25+ |
| **HTTP Framework** | Fiber v2 |
| **Database** | PostgreSQL 12+ with GORM ORM |
| **Cache/Sessions** | Redis 6+ |
| **Authentication** | JWT (HS256), bcrypt password hashing |
| **Migrations** | Goose (SQL-based) |
| **Validation** | go-playground/validator v10 |
| **UUID Generation** | google/uuid |
| **Environment Config** | caarlos0/env |
| **Testing** | Go testing + uber/mock |
| **Logging** | slog (structured logging) |

## Architecture

The application follows a layered, dependency-injection architecture:

```
┌─────────────────┐
│  HTTP Handlers  │  ← Parse DTOs, call services, return responses
├─────────────────┤
│  Services       │  ← Business logic, repo orchestration
├─────────────────┤
│  Repositories   │  ← Data access via GORM, transactions
├─────────────────┤
│  Database       │  ← PostgreSQL with migrations (goose)
└─────────────────┘

Middleware layer: Auth, rate limiting, CORS, audit, error handling, request ID
```

### Key Design Principles

- **No global state** except container and logger
- **Dependency Injection**: Container wires all dependencies at startup
- **Repository pattern**: All data access abstracted behind interfaces
- **Service layer**: Business logic separated from HTTP concerns
- **DTO pattern**: Request/response shapes separate from domain entities
- **Transaction management**: Explicit transaction boundaries via TxManager
- **Idempotency**: Client-generated IDs prevent duplicate orders/products
- **Async audit logging**: Buffered queue to avoid blocking request path

## Folder Structure

```
pos-backend/
├── cmd/
│   ├── api/                 # API server entrypoint
│   ├── migrate/             # Database migration tool
│   └── seed/                # Database seeding utility
├── database/
│   └── migrations/          # SQL migration files (00001_*.sql)
├── docs/
│   └── API_CONTRACT.md      # API specification (Phase 1 & 2)
├── internal/
│   ├── app/
│   │   ├── app.go           # Fiber app setup
│   │   ├── container.go     # Dependency injection container
│   │   └── app_test.go
│   ├── config/              # Configuration structs
│   ├── dto/                 # Request/response data structures
│   ├── entity/              # Domain entities (User, Product, Order, etc.)
│   ├── handler/             # HTTP request handlers
│   ├── middleware/          # Auth, rate limit, audit, error handling
│   ├── repository/          # Data access layer (GORM)
│   ├── routes/              # Route registration
│   ├── service/             # Business logic services
│   ├── mapper/              # Entity to DTO mappers
│   └── validator/           # Request validation rules
├── pkg/
│   ├── response/            # Response envelope helpers
│   └── ...                  # Shared reusable packages
├── test/
│   └── integration/         # Integration tests
├── .env.example             # Environment variable template
├── Makefile                 # Build and development tasks
├── go.mod / go.sum          # Go dependencies
└── README.md
```

### Main Packages

| Package | Purpose |
|---------|---------|
| `internal/app` | DI container, Fiber app initialization |
| `internal/config` | Configuration loading from environment |
| `internal/entity` | Domain models (User, Product, Order, etc.) |
| `internal/dto` | Request/response structures |
| `internal/handler` | HTTP handler functions |
| `internal/repository` | Data access with GORM |
| `internal/service` | Business logic and orchestration |
| `internal/middleware` | Auth, rate limit, logging, CORS |
| `internal/routes` | HTTP route registration |
| `internal/validator` | Request validation rules |
| `internal/mapper` | Entity ↔ DTO conversion |

## Database

### Overview

PostgreSQL with GORM ORM. Migrations managed via Goose (SQL-based, version-controlled in `database/migrations/`).

### Entity Relationship Diagram (Simplified)

```
businesses (1) ──── (N) users
    │                    │
    │                    └──── (N) user_roles
    │                             │
    ├──── (N) branches            └──── (N) roles ──── (N) permissions
    │
    ├──── (N) products
    │        │
    │        └──── (N) product_batches
    │
    ├──── (N) orders
    │
    ├──── (N) refresh_tokens
    │
    ├──── (N) audit_logs
    │
    ├──── (N) password_resets
    │
    └──── (N) stock_movements (reserved for Phase 2)
```

### Core Tables

| Table | Purpose |
|-------|---------|
| `businesses` | Tenant data (grocery, bookshop, etc.) |
| `users` | User accounts with password hashes, status, 2FA columns |
| `branches` | Locations within a business |
| `products` | Product catalogue with pricing, stock, expiry tracking |
| `product_batches` | Batch/lot numbers and expiry dates for perishables |
| `orders` | Completed sales synced from POS terminals |
| `roles` | Role definitions (owner, manager, cashier, etc.) |
| `permissions` | Fine-grained permissions (pos.sell, pos.discount, etc.) |
| `user_roles` | User-to-role assignments |
| `refresh_tokens` | Long-lived tokens stored in Redis with revocation list |
| `audit_logs` | Immutable log of mutations (async) |
| `password_resets` | Single-use password reset tokens (256-bit, SHA-256 hashed) |

### Money Fields

- **Cents**: All monetary amounts stored as `BIGINT` cents (e.g., 199 cents = $1.99)
- **Tax rates**: Stored as decimal fractions (0.08 = 8%, not 800 basis points)
- **Discount percent**: 0–100 scale, not cents

### Timestamps

- **Millisecond epoch**: JSON timestamps in API responses are milliseconds (not seconds)
- **Exception**: Calendar dates (`expiry_date`, `manufactured_date`) are `yyyy-mm-dd` strings
- **Database**: Stored as `TIMESTAMPTZ` (timezone-aware)
- **JWT `exp`**: Always in seconds per RFC 7519

## API Documentation

All endpoints return `{"message": "..."}` on error (never `{"code": ...}` or `{"success": false}`). Auth endpoints (register, login, password reset) are rate-limited to 5 requests per 15 minutes. All others: 120 per minute.

### Authentication Endpoints

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| POST | `/auth/register` | Create owner account + business + branch | — | Strict (5/15m) |
| POST | `/auth/login` | Email/password login | — | Strict (5/15m) |
| POST | `/auth/refresh` | Refresh expired access token | — | Strict (5/15m) |
| POST | `/auth/password/reset-request` | Request password reset (sends email) | — | Strict (5/15m) |
| POST | `/auth/password/reset` | Reset password with token | — | Strict (5/15m) |
| POST | `/auth/logout` | Revoke current token | ✓ | Normal |
| POST | `/auth/logout-all` | Revoke all tokens for user | ✓ | Normal |
| GET | `/auth/me` | Get current user profile | ✓ | Normal |
| PATCH | `/auth/profile` | Update user name/email/business name | ✓ | Normal |
| POST | `/auth/password/change` | Change password (requires current password) | ✓ | Normal |

### Product Endpoints

| Method | Endpoint | Description | Auth | Response |
|--------|----------|-------------|------|----------|
| GET | `/products` | Bare array of all products | ✓ | `[{id, name, sku, ...}]` |
| POST | `/products` | Create product (client-generated UUID, idempotent) | ✓ | `{id, name, ...}` (201 or 200) |
| PUT | `/products/:id` | Replace product (full not patch) | ✓ | `{id, name, ...}` |
| DELETE | `/products/:id` | Soft-delete product | ✓ | 204 (no body) |

### Order Endpoints

| Method | Endpoint | Description | Auth | Response |
|--------|----------|-------------|------|----------|
| POST | `/orders/sync` | Batch sync (≤50) orders from offline terminal | ✓ | `{results: [{id, status, ...}]}` |

### Request/Response Examples

#### Register
```bash
POST /auth/register
Content-Type: application/json

{
  "ownerName": "Jane",
  "businessName": "Corner Shop",
  "email": "jane@shop.lk",
  "password": "correct-horse",
  "businessType": "grocery"
}

# Response (201)
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "jane@shop.lk",
    "name": "Jane",
    "businessId": "uuid",
    "businessName": "Corner Shop",
    "businessType": "grocery",
    "branchId": "uuid",
    "roles": ["owner"],
    "permissions": ["pos.sell", ...]
  }
}
```

#### List Products
```bash
GET /products
Authorization: Bearer <token>

# Response (200)
[
  {
    "id": "uuid",
    "name": "Bananas",
    "sku": "GRO-BANAN-4821",
    "barcode": "4006381333931",
    "price_cents": 199,
    "tax_rate": 0,
    "stock_quantity": 12.5,
    "unit": "kg",
    "is_weighted": true,
    "created_at": 1722547200000,
    "updated_at": 1722547200000
  }
]
```

#### Sync Orders
```bash
POST /orders/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "orders": [
    {
      "client_generated_id": "uuid",
      "payment_method": "cash",
      "created_at": 1722547200000,
      "total_cents": 398,
      "tax_total_cents": 0,
      "discount_cents": 0,
      "items": [
        {
          "product_id": "uuid",
          "name": "Bananas",
          "quantity": 2,
          "unit_price_cents": 199,
          "tax_rate": 0
        }
      ]
    }
  ]
}

# Response (200)
{
  "results": [
    {
      "client_generated_id": "uuid",
      "server_id": "uuid",
      "status": "synced",
      "total_cents": 398
    }
  ]
}
```

## Installation

### Prerequisites

- Go 1.25+
- PostgreSQL 12+
- Redis 6+
- GNU Make (optional, simplifies commands)

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SandaruwanWeerawardhana/pos-backend.git
   cd pos-backend
   ```

2. **Install dependencies:**
   ```bash
   go mod download
   go mod verify
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set:
   #   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
   #   REDIS_HOST, REDIS_PORT
   #   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (required, no default)
   ```

   Generate JWT secrets:
   ```bash
   openssl rand -base64 48  # for JWT_ACCESS_SECRET
   openssl rand -base64 48  # for JWT_REFRESH_SECRET
   ```

4. **Start PostgreSQL and Redis:**
   ```bash
   # macOS with Homebrew
   brew services start postgresql
   brew services start redis
   
   # Docker Compose (optional)
   docker-compose up -d  # if docker-compose.yml exists
   ```

5. **Run migrations:**
   ```bash
   make migrate-up
   # or: go run ./cmd/migrate up
   ```

6. **Seed initial data:**
   ```bash
   make seed
   # or: go run ./cmd/seed
   ```
   Creates owner user, demo business, and default branch.

7. **Start the server:**
   ```bash
   make run
   # or: go run ./cmd/api
   ```
   Server listens on `http://localhost:8080` by default.

8. **Verify installation:**
   ```bash
   # Health check (no auth required)
   curl http://localhost:8080/health
   
   # List products (requires auth token from login)
   TOKEN=$(curl -sS -X POST http://localhost:8080/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"owner@pos.local","password":"<seeded-password>"}' \
     | jq -r '.token')
   
   curl http://localhost:8080/products \
     -H "Authorization: Bearer $TOKEN"
   ```

## Environment Variables

All variables from `.env.example` are required. Sensitive keys (`JWT_*_SECRET`) have no defaults and must be set.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| **App** | | | |
| `APP_ENV` | `local` | No | Environment: `local`, `staging`, `production` |
| `APP_NAME` | `pos-backend` | No | Application name |
| `APP_URL` | `http://localhost:8080` | No | Public API URL |
| `APP_PORT` | `8080` | No | HTTP server port |
| `LOG_LEVEL` | `debug` | No | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `text` | No | Log format: `text` or `json` |
| **Database** | | | |
| `DB_HOST` | `localhost` | No | PostgreSQL host |
| `DB_PORT` | `5433` | No | PostgreSQL port |
| `DB_USER` | `root` | No | PostgreSQL user |
| `DB_PASSWORD` | `1234` | No | PostgreSQL password |
| `DB_NAME` | `pos` | No | Database name |
| `DB_SSLMODE` | `disable` | No | SSL mode: `disable`, `require`, `prefer` |
| `DB_AUTO_MIGRATE` | `true` | No | Run migrations on startup (false in production) |
| `DB_MAX_OPEN_CONNS` | `25` | No | Connection pool size |
| `DB_MAX_IDLE_CONNS` | `5` | No | Idle connections |
| **Redis** | | | |
| `REDIS_ENABLED` | `true` | No | Enable Redis (false = in-memory fallback) |
| `REDIS_HOST` | `localhost` | No | Redis host |
| `REDIS_PORT` | `6380` | No | Redis port |
| `REDIS_PASSWORD` | — | No | Redis password (empty if none) |
| `REDIS_DB` | `0` | No | Redis database number |
| **JWT** | | | |
| `JWT_ALGORITHM` | `HS256` | No | Token algorithm |
| `JWT_ACCESS_SECRET` | — | **YES** | Access token signing secret (no default) |
| `JWT_REFRESH_SECRET` | — | **YES** | Refresh token signing secret (no default) |
| `JWT_ACCESS_TTL` | `12h` | No | Access token lifetime (long for cashier shifts) |
| `JWT_REFRESH_TTL` | `720h` | No | Refresh token lifetime (30 days) |
| `JWT_ISSUER` | `pos-backend` | No | Token issuer claim |
| `JWT_AUDIENCE` | `pos-frontend` | No | Token audience claim |
| **Security** | | | |
| `BCRYPT_COST` | `12` | No | Bcrypt hashing cost |
| `AUTH_REGISTRATION_ENABLED` | `true` | No | Allow user registration |
| `AUTH_MAX_FAILED_LOGINS` | `10` | No | Failed attempts before lockout |
| `AUTH_LOCKOUT_DURATION` | `15m` | No | Lockout duration |
| `AUTH_RATE_LIMIT_MAX` | `5` | No | Auth endpoint rate limit (per window) |
| `AUTH_RATE_LIMIT_WINDOW` | `15m` | No | Auth endpoint rate limit window |
| `RATE_LIMIT_MAX` | `120` | No | General rate limit (per minute) |
| `RATE_LIMIT_WINDOW` | `1m` | No | General rate limit window |
| **CORS** | | | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | No | Allowed origins (comma-separated) |
| `CORS_ALLOW_CREDENTIALS` | `false` | No | Allow credentials in CORS |
| **Seed** | | | |
| `SEED_OWNER_EMAIL` | `owner@pos.local` | No | Initial owner email |
| `SEED_OWNER_NAME` | `System Owner` | No | Initial owner name |
| `SEED_OWNER_PASSWORD` | — | No | Initial owner password (random if empty) |
| `SEED_BUSINESS_NAME` | `Demo Grocery` | No | Seeded business name |
| `SEED_BUSINESS_TYPE` | `grocery` | No | Business type: `grocery`, `bookshop` |

## Running the Project

### Development

```bash
# Start server (auto-reloads on code changes with Air)
make run

# Run all tests
make test

# Run integration tests (requires live DB/Redis)
make test-integration

# Generate coverage report
make cover

# Lint code
make lint

# Format code
make fmt

# Database management
make migrate-up          # Apply pending migrations
make migrate-down        # Revert last batch
make migrate-status      # Show pending migrations
make seed                # Seed initial data

# Build binaries
make build               # Creates bin/api, bin/migrate, bin/seed
```

### Production Build

```bash
# Build optimized binaries
make build

# Run API server
./bin/api

# Run migrations (if needed)
./bin/migrate up

# Seed demo data (optional)
./bin/seed
```

### Docker (if available)

```bash
# Build Docker image
docker build -t pos-backend .

# Run container
docker run -p 8080:8080 \
  -e DB_HOST=db \
  -e REDIS_HOST=redis \
  -e JWT_ACCESS_SECRET=<secret> \
  -e JWT_REFRESH_SECRET=<secret> \
  pos-backend
```

## Testing

### Unit Tests

```bash
# Run all unit tests with race detection
make test

# Run specific package tests
go test ./internal/service/...

# Run with coverage
go test -cover ./...
```

### Integration Tests

Integration tests require a live PostgreSQL and Redis instance.

```bash
# Run integration tests
make test-integration

# Run with specific tags
go test -tags=integration ./test/integration/...
```

### Test Coverage

```bash
# Generate coverage report
make cover

# View HTML coverage report
go tool cover -html=coverage.out
```

### Example Test

Tests follow table-driven patterns with mocked repositories:

```go
func TestLoginService_Login(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		password string
		wantErr bool
	}{
		{name: "valid login", email: "user@test.com", password: "correct", wantErr: false},
		{name: "invalid password", email: "user@test.com", password: "wrong", wantErr: true},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test implementation
		})
	}
}
```

## Authentication Flow

### Registration

1. User submits email, password, owner name, business name, business type
2. Server validates input, hashes password with bcrypt cost 12
3. Atomically provisions: business → default branch → owner user → owner role
4. Returns JWT access token + user profile

### Login

1. User submits email and password
2. Server looks up user, verifies password hash
3. Clears failed attempts counter on success
4. Generates access token (12h TTL) and optional refresh token
5. Returns JWT + user profile

### Token Lifecycle

- **Access token**: 12-hour TTL (long, for unattended cashier shifts)
- **Refresh token**: 720 hours (30 days), stored in Redis
- **Revocation**: Immediate via Redis denylist (`token:revoked:{token_id}`)
- **Logout**: Revokes current token or all tokens for user

### Permission Model

Permissions are resource-action pairs (e.g., `pos.sell`, `pos.discount`). Assigned to roles, roles assigned to users. Cached in Redis with 5-minute TTL to reduce DB queries.

```go
// Examples
pos.sell        // Perform sales transactions
pos.discount    // Apply manual discounts
product.create  // Create new products
product.edit    // Edit product details
product.delete  // Delete products
order.view      // View historical orders
```

## Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Product updated |
| 201 | Created | Product created |
| 204 | No content | Product deleted |
| 400 | Bad request | Invalid JSON, validation error |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Token valid, permission denied |
| 404 | Not found | Product doesn't exist |
| 409 | Conflict | SKU/barcode already in use |
| 429 | Too many requests | Rate limited |
| 500 | Server error | Unhandled panic (caught by middleware) |

### Error Response Format

All errors return `Content-Type: application/json` with:

```json
{
  "message": "Human-readable error message"
}
```

Never includes `code`, `type`, or nested objects — message is rendered directly to cashiers.

### Validation Errors

```bash
# Example: Missing required field
curl -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@shop.lk"}' # password missing

# Response (400)
{
  "message": "validation error: password is required"
}
```

### Common Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Invalid password | 401 | `"invalid email or password"` |
| Email in use | 409 | `"email already exists"` |
| Product SKU exists | 409 | `"sku already in use by another product"` |
| Rate limited | 429 | `"too many requests"` |
| Malformed JWT | 401 | `"invalid token"` |
| Expired token | 401 | `"token expired"` |
| Permission denied | 403 | `"insufficient permissions"` |

## Performance Optimizations

### Caching

- **Redis denylist**: Immediate token revocation on logout
- **Permission cache**: 5-minute TTL to avoid per-request DB lookups
- **Product catalogue**: Frontend caches in IndexedDB, server provides bare array

### Database Optimizations

- **Connection pooling**: 25 open, 5 idle connections by default
- **Indexes**:
  - `(business_id, email)` on users (unique per business)
  - `(business_id, sku)` on products (unique per business)
  - `(business_id, barcode)` on products (unique per business)
  - `(business_id, category)` on products (filtering)
  - `(expiry_date)` on product_batches (expiry alerts)
  - `(created_at)` on orders (recent sales)

### Query Optimization

- **Explicit Preload**: No N+1 queries; `Preload()` used explicitly
- **Batch operations**: Order sync processes up to 50 orders per request
- **Soft deletes**: Indexing excludes deleted rows (`WHERE deleted_at IS NULL`)
- **Transaction batching**: Product/order mutations grouped where safe

### Network Optimization

- **Gzip compression**: Enabled on all responses (Brotli available)
- **Request ID**: Propagated in response headers for tracing
- **Bare JSON arrays**: Products endpoint returns minimal envelope

## Security

### Authentication & Authorization

- **JWT (HS256)**: Stateless tokens signed with a shared secret
- **Bcrypt**: Password hashing with cost 12 (adaptive, future-proof)
- **Refresh tokens**: Long-lived tokens in Redis, revoked immediately on logout
- **Account lockout**: 10 failed attempts → 15-minute lockout
- **Session revocation**: Denylist in Redis (immediate, no polling)

### Input Validation

- **DTO validation**: All request bodies validated with go-playground/validator
- **Email format**: RFC 5322 compliance
- **Password strength**: Minimum length enforced (configurable)
- **SQL injection**: GORM parameterized queries (no string concatenation)

### CORS & Headers

- **CORS**: Whitelisted origins (configurable, defaults to localhost:3000)
- **Security headers**: X-Request-ID for tracing
- **Rate limiting**: 5 requests/15m for auth, 120/min for general

### Data Protection

- **Multi-tenancy**: Enforced at repository level (all queries filtered by business_id)
- **Soft deletes**: Deleted data inaccessible unless explicitly queried
- **Audit logging**: Asynchronous, immutable mutation log
- **Password reset**: Single-use tokens (256-bit, SHA-256 hashed), 30-minute expiry
- **No plaintext secrets**: JWT secrets, DB passwords from environment only

### Data Integrity

- **Transactions**: ACID compliance for multi-step operations (registration, order sync)
- **Unique constraints**: SKU/barcode per business, email per business
- **Foreign keys**: Cascading deletes for data consistency
- **Idempotency**: Client-generated IDs prevent duplicate orders/products on retry

## Deployment

### Environment-Specific Configuration

```bash
# Local development
APP_ENV=local LOG_LEVEL=debug DB_AUTO_MIGRATE=true

# Staging
APP_ENV=staging LOG_FORMAT=json DB_AUTO_MIGRATE=false

# Production
APP_ENV=production LOG_FORMAT=json DB_AUTO_MIGRATE=false
```

### Database Migrations

Pre-production migrations must be audited:

```bash
# Run migrations manually in production
/path/to/bin/migrate up

# Or via CLI
go run ./cmd/migrate up
```

### Scaling Considerations

- **Stateless design**: Any server can handle any request (except migrations)
- **Redis for state**: Token denylist, refresh tokens, rate limiting
- **Database connection pooling**: Tuned for your workload (default 25 open)
- **Audit logging**: Asynchronous queue to avoid blocking response path
- **Load balancer**: Route all /auth/* to same server is NOT required (stateless)

### Monitoring & Observability

- **Structured logging**: Slog with contextual fields (request_id, user_id, action)
- **Log format**: JSON in production for aggregation
- **Request tracing**: X-Request-ID header propagated
- **Error recovery**: Panics caught by middleware, logged, returned as 500

### Deployment Steps (Manual)

```bash
# 1. Build binaries
make build

# 2. Copy to server
scp bin/* user@server:/app/

# 3. Set environment variables
ssh user@server
export JWT_ACCESS_SECRET=...
export JWT_REFRESH_SECRET=...
export DB_HOST=...
# etc.

# 4. Run migrations (once per deployment)
./bin/migrate up

# 5. Start server
./bin/api &

# 6. Verify health
curl http://localhost:8080/health
```

### Docker Compose (Recommended for Local Dev)

If a `docker-compose.yml` exists:

```bash
docker-compose up --build
```

## Future Improvements

Based on the codebase, these Phase 2 features are partially implemented:

### User Management
- Two-factor authentication (columns exist, awaiting endpoint)
- Email verification (columns exist)
- Phone verification (columns exist)
- Invite-only registration (status `invited` exists)

### Stock Management
- Stock movements tracking (table/entity defined)
- Reorder alerts (reorder_level column exists)
- Stock adjustments (reserved for Phase 2)
- Receiving and goods-in (batch/expiry tracked but no receiving flow yet)

### Orders & Refunds
- Refund processing (refunded column exists)
- Partial refunds
- Order history and receipts
- Return tracking

### Product Management
- Product images (images JSONB column exists)
- Supplier integration (supplier_id column exists)
- Multi-batch stock allocation
- Product variants and SKU linking

### Advanced Features
- Staff/PIN authentication (alternative to email/password)
- End-of-shift reports
- Sales analytics and dashboards
- Pricing rules and promotions
- Inventory forecasting
- Webhook notifications

### Infrastructure
- GraphQL API (alongside REST)
- gRPC backend (for high-frequency sync)
- WebSocket support (real-time updates)
- OpenAPI/Swagger documentation (partially setup)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test:
   ```bash
   make fmt
   make lint
   make test
   ```
4. Commit with conventional messages: `git commit -m 'feat: add feature'`
5. Push and open a pull request

### Code Standards

- Format code with `gofmt` (make fmt)
- Lint with `golangci-lint` (make lint)
- Run `go vet` (make vet)
- Write tests for new features
- Keep functions focused and small
- Use dependency injection for testability

## License

Proprietary. All rights reserved.

## Author

- **GitHub**: [SandaruwanWeerawardhana](https://github.com/SandaruwanWeerawardhana)
- **Email**: [info@southasianaffairs.com](mailto:info@southasianaffairs.com)

---

## Quick Reference

```bash
# Setup
cp .env.example .env
make migrate-up
make seed

# Development
make run              # Start server
make test             # Run tests
make lint             # Lint code
make cover            # Coverage report

# Database
make migrate-status   # Check pending migrations
make migrate-down     # Rollback last batch

# API Testing
curl -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@pos.local","password":"<password>"}'
```

For detailed API specifications, see [docs/API_CONTRACT.md](docs/API_CONTRACT.md).
