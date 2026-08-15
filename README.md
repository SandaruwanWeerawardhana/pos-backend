# POS — Offline-First Point of Sale System

A monorepo point-of-sale platform for small retail businesses (grocery, bookshop-style stores), built as two independently deployable apps: a Go REST API (`pos-backend`) and an offline-first Next.js PWA (`pos-frontend`) that keeps selling even when the internet drops.

> This root README covers the project as a whole. Each app also has its own, more detailed README: [`pos-backend/README.md`](./pos-backend/README.md) and [`pos-frontend/README.md`](./pos-frontend/README.md).

---

## Overview

**What it does.** POS gives a small retail business a terminal application for ringing up sales, managing product catalogues (with batch/expiry tracking), tracking stock, and administering staff, roles, and permissions — backed by a multi-tenant Go API.

**The problem it solves.** Retail counters can't stop selling because Wi-Fi hiccups. The frontend is local-first: every read and write hits an in-browser IndexedDB database first, and a background sync manager reconciles with the server opportunistically. The backend is designed around idempotent sync (client-generated IDs, `ON CONFLICT DO NOTHING`) so a terminal that comes back online after an outage can safely replay what it queued.

**Who it's for.** Small business owners and staff (cashiers, managers, warehouse staff) who need a checkout terminal plus a back-office for products, users, and roles, without depending on a constant connection.

**Main objectives.**
- Never block a sale on network availability.
- Keep money arithmetic exact (integer cents everywhere, no floats for currency).
- Multi-tenant from day one (every row is scoped to a `business_id`).
- Ship a real RBAC data model (roles, permissions, per-business role assignment) even though per-route permission *enforcement* is still in progress (see [Future Improvements](#future-improvements)).

---

## Features

### Authentication
- Register / login with email + password (bcrypt, cost 12)
- Stateless JWT access tokens (HS256, 12h TTL)
- Opaque, hashed, rotating refresh tokens (30-day TTL, `/auth/refresh` endpoint implemented; not yet called by the frontend)
- Logout (single session) and logout-all (all sessions) via a token denylist (Redis, with in-memory fallback when Redis is disabled)
- Failed-login lockout (configurable max attempts + lockout duration)
- Password reset via single-use, hashed, expiring tokens

### User & Access Management
- User CRUD, scoped to a business
- Role CRUD, with 4 seeded system roles: `owner`, `manager`, `cashier`, `warehouse_staff`
- Dotted-name permissions (e.g. `pos.sell`, `products.manage`, `inventory.adjust`) seeded and assignable to roles
- Profile update, password change

### Product Management
- Product CRUD scoped per business, with SKU/barcode uniqueness
- Product batch tracking (batch numbers, expiry dates)
- Money stored as integer cents; tax and discount rates stored as fractions
- Barcode generation/encoding and printable label support (frontend)

### Sales / Point of Sale
- Cart and checkout terminal UI with barcode scanning
- Idempotent order sync (`client_generated_id` uniqueness) so retried/offline submissions never double-post
- Multi-tender payments (`order_payments` supports more than one payment method per order)
- Held/parked carts, discounts

### Inventory
- Stock ledger (`stock_movements`) with a typed movement enum (`sale`, `purchase`, `adjustment`, `transfer_in`, `transfer_out`, `waste`, `damage`, `return`) — only `sale` is currently written by application code
- Low-stock alerts, stock movement views (frontend)

### Offline & Sync
- Local IndexedDB (Dexie) as the frontend's source of truth
- Background `SyncManager` polling every 15s: pushes pending orders → pushes product changes → pulls fresh product cache
- PWA service worker caching static assets (JS/CSS/fonts/icons) for offline app-shell loading
- Installable PWA (manifest, icons)

### Reporting
- Dashboard, sales/payment reports, 3D report visualizations (frontend, reads local IndexedDB data)

### Extensibility
- Frontend plugin system (`src/plugins`) with a registry and slot components (cart row, dashboard widget, inventory panel, product form, receipt extras) — ships one example plugin (`weighted-item`)

### Cross-Cutting
- Structured audit logging (async, non-blocking) of business-relevant actions
- Request ID propagation and structured request logging
- Global and auth-specific rate limiting
- Multi-tenant data isolation via `business_id` on every table

---

## Tech Stack

| Category | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Backend | Go 1.25, Fiber v2 (HTTP framework) |
| Database | PostgreSQL, GORM (ORM), Goose (migrations) |
| Local/Offline Storage | Dexie (IndexedDB wrapper) |
| Authentication | JWT (`golang-jwt/jwt/v5`, HS256) + bcrypt (`golang.org/x/crypto`) |
| State Management | Zustand, TanStack Query (frontend) |
| Forms & Validation | react-hook-form + Zod (frontend); `go-playground/validator` (backend) |
| Styling | Tailwind CSS 4 |
| Caching / Rate Limiting | Redis (`go-redis/v9`), in-memory fallback when disabled |
| Build Tools | Next.js compiler (React Compiler enabled), Go toolchain, Make |
| Testing | Vitest + Testing Library (frontend); Go `testing` + `go.uber.org/mock` (backend) |
| Others | `caarlos0/env` (env parsing), `google/uuid`, `@zxing` (barcode scanning), Recharts (charts) |

---

## Architecture

### Backend — layered architecture
`pos-backend` follows a strict layered design, enforced at lint time (`depguard` rules in `.golangci.yml`):

```
Handler  →  Service  →  Repository  →  Entity (GORM model)
  ↑             ↑              ↑
 DTOs      business logic    SQL/GORM only
```

- **Handlers** parse/validate HTTP input and shape responses. They cannot import GORM or repositories directly.
- **Services** hold business rules (auth, RBAC lookups, order idempotency, audit dispatch). They cannot import Fiber.
- **Repositories** are the only layer allowed to speak GORM/SQL. They cannot import DTOs or Fiber.
- Dependency wiring for all of the above happens in one place: `internal/app/container.go`.
- Errors flow through a single `apperror.AppError` type with a stable code, HTTP status, and safe user-facing message; the wire layer only ever understands that type.

### Frontend — local-first architecture
`pos-frontend` treats the browser's IndexedDB (via Dexie) as the source of truth for UI reads/writes, not the network:

```
UI Components  →  Zustand / TanStack Query  →  Dexie (IndexedDB)
                                                     ↕
                                          SyncManager (background, 15s poll)
                                                     ↕
                                        apiClient  →  pos-backend REST API
```

- `apiClient` (`src/lib/api`) switches between an in-memory **mock** implementation and a **real** implementation (`src/lib/services/*`) based on `NEXT_PUBLIC_USE_MOCK_API`.
- The `SyncManager` (`src/lib/sync`) reconciles local and remote state without blocking the UI thread or user interactions.
- A service worker caches the static app shell so the terminal can load with no connection at all; live data offline is served from IndexedDB.

### Multi-tenancy & data flow
Every domain table carries a `business_id`. A JWT access token embeds the authenticated user's ID, business ID, branch ID, and roles; the auth middleware injects these into the request context so every service call is naturally scoped.

---

## Folder Structure

```
pos/
├── pos-backend/                 # Go REST API
│   ├── cmd/
│   │   ├── api/                 # HTTP server entrypoint
│   │   └── migrate/             # Goose migration CLI entrypoint
│   ├── config/                  # Env-driven config structs (App, HTTP, DB, Redis, JWT, ...)
│   ├── database/
│   │   ├── migrations/          # Goose SQL migrations (numbered)
│   │   └── seeds/                # Dummy seed data (SQL)
│   ├── internal/
│   │   ├── app/                  # DI container, Fiber app assembly
│   │   ├── dto/                  # Request/response shapes
│   │   ├── entity/                # GORM models
│   │   ├── handler/               # HTTP handlers
│   │   ├── mapper/                # Entity <-> DTO mapping
│   │   ├── middleware/            # Auth, CORS, rate limit, audit, recovery, etc.
│   │   ├── repository/            # GORM queries (+ mocks for tests)
│   │   ├── routes/                # Route registration per resource
│   │   ├── service/                # Business logic
│   │   └── validator/              # Custom validation rules
│   ├── pkg/                      # Reusable packages: apperror, jwt, hash, pagination, response, ...
│   ├── test/service/              # Service-layer unit tests
│   └── docs/API_CONTRACT.md       # Authoritative API contract (source of truth for endpoint behavior)
│
├── pos-frontend/                 # Next.js PWA
│   ├── src/
│   │   ├── app/                   # App Router routes (see route tree below)
│   │   ├── components/            # UI, POS, hardware, product-form, plugin-slot components
│   │   ├── lib/
│   │   │   ├── api/                # mock/real API client switch
│   │   │   ├── db/                 # Dexie (IndexedDB) collections
│   │   │   ├── sync/                # Background sync manager
│   │   │   ├── services/            # HTTP calls to pos-backend
│   │   │   ├── store/                # Zustand stores
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   └── hardware/             # Barcode scanner / scale integration
│   │   └── plugins/                 # Plugin registry + example plugin
│   ├── public/                    # PWA manifest source assets, service worker, icons
│   └── tests/                     # Vitest test suite
│
└── README.md                      # This file
```

### Frontend route tree (App Router)

```
src/app/
├── page.tsx                       # Landing page
├── (app)/
│   ├── auth/                      # login, register, forgot/reset password
│   ├── pos/                       # checkout terminal, hold, close-till
│   └── (office)/                  # back-office, behind auth
│       ├── dashboard/
│       ├── products/              # list, new, edit, batches, brands, categories, print-labels, units
│       ├── purchases/             # list, new, detail, returns
│       ├── sales/
│       ├── store/                 # stock, alerts, movements, transfers
│       ├── people/                # customers, suppliers
│       ├── reports/                # payment reports, 3D report
│       ├── users/                  # list, new, detail, permissions
│       ├── discounts/
│       ├── settings/                # incl. hardware setup
│       └── profile/
```

---

## Database

- **Engine:** PostgreSQL
- **ORM:** GORM
- **Migrations:** Goose (`database/migrations/*.sql`, sequential, forward/backward)
- **Multi-tenancy:** almost every table carries `business_id`

### Main tables

| Table | Purpose | Key relationships |
|---|---|---|
| `businesses` | Tenant root | `owner_user_id → users.id` |
| `branches` | Physical locations per business | `business_id → businesses.id` |
| `users` | Staff/owners, citext email, lockout fields | `business_id → businesses.id` |
| `roles` | Named roles; `business_id` nullable = global system role | `business_id → businesses.id` (nullable) |
| `permissions` | Dotted `resource.action` names (DB-generated column) | — |
| `role_permissions` | Join table | `role_id`, `permission_id` |
| `user_roles` | Join table, optional branch scoping | `user_id`, `role_id`, `branch_id` |
| `refresh_tokens` | SHA-256-hashed tokens, rotation via `family_id`/`parent_id` | `user_id → users.id` |
| `password_resets` | Single-use, hashed, expiring | `user_id → users.id` |
| `audit_logs` | JSONB before/after values, GIN-indexed | `business_id`, `user_id` (nullable) |
| `settings` | Key/value JSONB, scoped by business + branch | `business_id`, `branch_id` |
| `products` | SKU/barcode unique per business, price/cost in cents | `business_id → businesses.id` |
| `product_batches` | Batch + expiry tracking | `product_id → products.id` |
| `orders` | Idempotent via unique `(business_id, client_generated_id)` | `business_id → businesses.id` |
| `order_items` | Line items, price/name captured at sale time | `order_id → orders.id` |
| `order_payments` | Multi-tender payments | `order_id → orders.id` |
| `stock_movements` | Signed stock ledger, typed movement enum | `product_id → products.id` |
| `casbin_rule` | Schema present for a Casbin policy adapter | *Not currently wired to any code — schema only* |

### Relationships (summary)

```
businesses 1─* branches
businesses 1─* users
businesses 1─* roles (or roles.business_id IS NULL = global)
roles      *─* permissions   (via role_permissions)
users      *─* roles         (via user_roles, optionally scoped to a branch)
users      1─* refresh_tokens
businesses 1─* products 1─* product_batches
businesses 1─* orders 1─* order_items
orders     1─* order_payments
products   1─* stock_movements
```

---

## API Documentation

Base path: none (routes are mounted at root). Full request/response examples live in [`pos-backend/docs/API_CONTRACT.md`](./pos-backend/docs/API_CONTRACT.md), which is the authoritative spec. Success responses have **no envelope**; errors return `{"message": "..."}`.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/health` | Liveness probe | No |
| GET | `/health/ready` | Readiness probe | No |
| POST | `/auth/register` | Register a new account | No |
| POST | `/auth/login` | Log in, receive access + refresh tokens | No |
| POST | `/auth/refresh` | Exchange refresh token for new access token | No |
| POST | `/auth/password/reset-request` | Request a password reset token | No |
| POST | `/auth/password/reset` | Consume reset token, set new password | No |
| POST | `/auth/logout` | Revoke current session | Yes |
| POST | `/auth/logout-all` | Revoke all sessions for the user | Yes |
| GET | `/auth/me` | Get current user profile | Yes |
| PATCH | `/auth/profile` | Update current user profile | Yes |
| POST | `/auth/password/change` | Change password (authenticated) | Yes |
| GET | `/products/` | List products (paginated) | Yes |
| POST | `/products/` | Create product | Yes |
| PUT | `/products/:id` | Update product | Yes |
| DELETE | `/products/:id` | Delete product | Yes |
| POST | `/orders/sync` | Idempotently sync one or more orders | Yes |
| GET | `/orders/` | List orders (paginated, filterable) | Yes |
| GET | `/orders/:clientGeneratedID` | Get a single order | Yes |
| GET | `/users/` | List users | Yes |
| POST | `/users/` | Create user | Yes |
| GET | `/users/:id` | Get user | Yes |
| PATCH | `/users/:id` | Update user | Yes |
| DELETE | `/users/:id` | Delete user | Yes |
| GET | `/roles/` | List roles | Yes |
| POST | `/roles/` | Create role | Yes |
| GET | `/roles/:id` | Get role | Yes |
| PATCH | `/roles/:id` | Update role | Yes |
| DELETE | `/roles/:id` | Delete role | Yes |

> **Note:** "Yes" currently means *authenticated* only. Per-route permission enforcement (checking the user's specific RBAC permissions, not just that they're logged in) is not yet implemented — see [Future Improvements](#future-improvements).

---

## Installation

### Prerequisites
- Go 1.25+
- Node.js 20+ and npm
- PostgreSQL
- Redis (optional — both apps degrade gracefully without it, using in-memory fallbacks)

### 1. Clone the repository

```bash
git clone <repository-url>
cd pos
```

### 2. Backend setup

```bash
cd pos-backend
cp .env.example .env
# edit .env — set DB_*, and generate real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
go mod download
make migrate-up
make run
```

Backend listens on the port configured by `APP_PORT` (see `.env.example`).

### 3. Frontend setup

```bash
cd pos-frontend
cp .env.example .env.local   # if not present, create it with the two vars below
npm install
npm run dev
```

Frontend listens on `http://localhost:3000` by default (Next.js default).

### Seeding
`pos-backend` ships `SEED_*` config variables (owner email/name/password, business name/type) but **no working seed command exists yet** (`cmd/seed` referenced by the Makefile is not implemented). Not implemented — create your first user via `POST /auth/register` instead.

---

## Environment Variables

### `pos-backend/.env`

| Variable | Description | Required |
|---|---|---|
| `APP_ENV` | `local` / `test` / `dev` / `staging` / `prod` | Yes |
| `APP_NAME`, `APP_URL` | App metadata | No |
| `LOG_LEVEL`, `LOG_FORMAT` | Logging config | No |
| `APP_PORT` | HTTP listen port | Yes |
| `HTTP_READ_TIMEOUT` / `WRITE_TIMEOUT` / `IDLE_TIMEOUT` / `SHUTDOWN_TIMEOUT` | Server timeouts | No |
| `HTTP_BODY_LIMIT` | Max request body size | No |
| `HTTP_TRUSTED_PROXIES` | Trusted proxy list | No |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`, `DB_TIMEZONE` | PostgreSQL connection | Yes |
| `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, `DB_CONN_MAX_LIFETIME`, `DB_CONN_MAX_IDLE_TIME` | Connection pool tuning | No |
| `DB_LOG_LEVEL` | GORM log verbosity | No |
| `DB_AUTO_MIGRATE` | Auto-run migrations on boot (must be `false` in prod) | No |
| `REDIS_ENABLED` | Toggle Redis (falls back to in-memory, single-process only) | No |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Redis connection | If enabled |
| `JWT_ALGORITHM` | Must be `HS256` | Yes |
| `JWT_ACCESS_SECRET` | Access token signing secret, ≥32 chars, must differ from refresh secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token signing secret, ≥32 chars | Yes |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Token lifetimes | No |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Token claims | No |
| `BCRYPT_COST` | Password hashing cost factor | No |
| `AUTH_REGISTRATION_ENABLED` | Allow public registration (must be `false` in prod) | No |
| `AUTH_REFRESH_COOKIE` | Refresh token cookie name | No |
| `AUTH_MAX_FAILED_LOGINS`, `AUTH_LOCKOUT_DURATION` | Login lockout policy | No |
| `AUTH_PERMISSION_CACHE_TTL` | RBAC cache TTL | No |
| `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_METHODS`, `CORS_ALLOWED_HEADERS`, `CORS_EXPOSED_HEADERS`, `CORS_ALLOW_CREDENTIALS`, `CORS_MAX_AGE` | CORS policy (origins can't be `*` in prod) | Yes |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | Global rate limit | No |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW` | Stricter limit on auth endpoints | No |
| `SWAGGER_ENABLED`, `SWAGGER_ROUTE` | Reserved; not currently mounted in the app | No |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD`, `SEED_BUSINESS_NAME`, `SEED_BUSINESS_TYPE`, `SEED_DEMO` | Reserved for a seed script that isn't implemented yet | No |

> `pos-backend/.env.example` ships real-format placeholder JWT secrets for local dev convenience — **regenerate both before any real deployment.**

### `pos-frontend/.env.local`

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK_API` | Set to `false` to talk to the real backend; unset/anything else uses the in-browser mock API | No |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of `pos-backend` (default `http://localhost:8080`); must be included in the backend's `CORS_ALLOWED_ORIGINS` | No |

---

## Running the Project

### Backend (`pos-backend/`)

| Task | Command |
|---|---|
| Run dev server | `make run` |
| Build binaries | `make build` |
| Run migrations | `make migrate-up` / `make migrate-down` / `make migrate-status` |
| Unit tests | `make test` (`go test -short -race ./...`) |
| Coverage | `make cover` |
| Lint | `make lint` |
| Format | `make fmt` |
| Vet | `make vet` |

### Frontend (`pos-frontend/`)

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Start (production build) | `npm run start` |
| Test | `npm run test` (Vitest) |
| Test (watch) | `npm run test:watch` |
| Lint | `npm run lint` |

---

## Screenshots

_Not included in this repository yet._

<!-- Once available, add screenshots like:
![Dashboard](./docs/screenshots/dashboard.png)
![POS Terminal](./docs/screenshots/pos-terminal.png)
-->

---

## Authentication Flow

1. **Register** (`POST /auth/register`, if `AUTH_REGISTRATION_ENABLED`) or an admin creates a user via `POST /users/`.
2. **Login** (`POST /auth/login`) — validates credentials (constant-time comparison, bcrypt), enforces lockout after repeated failures, returns a short-lived **access token** (JWT, HS256, 12h) and an opaque, hashed **refresh token** (30 days).
3. **Authenticated requests** send `Authorization: Bearer <access_token>`. Middleware verifies the signature, checks the token against a Redis (or in-memory) **denylist**, and injects user ID, business ID, branch ID, and roles into the request context.
4. **Refresh** (`POST /auth/refresh`) exchanges a valid refresh token for a new access token, rotating the refresh token (tracked via `family_id`/`parent_id` for reuse detection). Implemented server-side; not yet called by the frontend client.
5. **Logout** (`POST /auth/logout`) revokes the current session; **logout-all** (`POST /auth/logout-all`) revokes every session for the user.
6. **Roles & permissions**: users are assigned roles (optionally per-branch) via `user_roles`; roles carry permissions via `role_permissions`. The schema fully supports fine-grained RBAC, but route handlers currently check *authentication* only — not yet the specific permission required for an action (see [Future Improvements](#future-improvements)).

---

## Error Handling

- **Backend:** every error passes through a single `apperror.AppError` type carrying a stable error code, an HTTP status, and a safe user-facing message; internal details are logged server-side only, never leaked to the client. All error responses share the shape `{"message": "..."}`.
- **Validation:** request DTOs are validated with `go-playground/validator`; invalid input returns `400` with a descriptive message.
- **HTTP status codes:** standard usage — `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict (e.g. duplicate email/SKU), `429` rate-limited, `500` unexpected server error.
- **Frontend:** dedicated `error.tsx` and `global-error.tsx` boundaries at the App Router level catch render-time failures; offline/sync failures surface via an `OfflineBanner` / sync status indicator rather than hard failures.

---

## Performance Optimizations

- **Pagination:** page/per-page parameters are clamped, and `sort` fields are validated against a per-endpoint whitelist (also a SQL-injection guard — see Security).
- **Rate limiting:** global limiter (120 req/min default) plus a stricter limiter on auth endpoints (5 req/15min default), Redis-backed with in-memory fallback.
- **Compression:** gzip/brotli response compression at best-speed level.
- **Connection pooling:** configurable GORM/PostgreSQL pool (`DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, lifetimes).
- **Async audit logging:** audit events are queued (buffered channel, size 1024) and drained by a background worker so they never add latency to the request path (and are dropped rather than blocking if the queue is full).
- **Offline-first caching (frontend):** IndexedDB as the primary data source removes network round-trips from the hot path entirely; a service worker caches the static app shell for instant, connection-independent loads.
- **Indexing:** partial unique indexes on `products` (SKU/barcode, `WHERE deleted_at IS NULL`), unique idempotency index on `orders (business_id, client_generated_id)`, GIN indexes on `audit_logs` JSONB columns.

---

## Security

- **Authentication:** stateless JWT (HS256) access tokens; opaque, SHA-256-hashed, rotating refresh tokens (raw tokens are never stored).
- **Authorization:** RBAC data model (roles, permissions, per-business/branch role assignment); currently enforced at the *authentication* level, with per-route permission checks planned (Phase 2).
- **Password hashing:** bcrypt, configurable cost factor (default 12), 72-byte input cap enforced, constant-time dummy-hash comparison on login to avoid user-enumeration via timing.
- **Input validation:** `go-playground/validator` on all DTOs; custom rules in `internal/validator`.
- **CORS:** explicit allow-list of origins/methods/headers via config; wildcard origins are rejected outright in production.
- **Rate limiting:** global and auth-specific limiters (IP + email keyed on auth routes) to blunt brute-force and abuse.
- **SQL injection prevention:** GORM parameterized queries throughout; `sort` parameters are validated against an explicit whitelist rather than interpolated.
- **XSS protection:** React's default output escaping on the frontend; `helmet`-based security headers on the backend.
- **Secrets:** JWT secrets must be ≥32 characters and distinct for access/refresh; production config validation refuses to boot with a wildcard CORS origin, `DB_SSLMODE=disable`, `DB_AUTO_MIGRATE=true`, or `AUTH_REGISTRATION_ENABLED=true`.
- **Audit trail:** structured audit logs capture before/after values (JSONB) for sensitive actions.
- **CSRF:** Not implemented — the API is bearer-token authenticated (no cookie-based session), which is the standard mitigation for CSRF in token-based APIs, but no explicit CSRF middleware exists.

---

## Deployment

**Not implemented.** Neither `pos-backend` nor `pos-frontend` currently ships a `Dockerfile`, `docker-compose.yml`, or GitHub Actions workflow. `pos-frontend/.github/` contains only editor instructions (`copilot-instructions.md`), no CI pipeline.

Suggested targets, to be set up:
- **Backend:** any container platform / VPS capable of running a Go binary behind a reverse proxy (Nginx) with a managed PostgreSQL and Redis instance.
- **Frontend:** Vercel (first-party Next.js support) or any Node-capable host/CDN; the PWA service worker makes static-asset delivery from a CDN a natural fit.

---

## Future Improvements

Grounded in the backend's own `docs/API_CONTRACT.md` Phase 2 gap list and `AGENTS.md` notes, not speculation:

- Enforce RBAC **per-route permissions**, not just authentication
- Stock adjustments beyond `sale` movements (purchase, transfer, waste, damage, return flows)
- Catalogue delta sync (incremental, not full re-pull)
- Refunds
- Sales-history read beyond the current page
- Purchasing and supplier management endpoints
- Staff PIN-based auth for fast terminal switching
- Settings, discounts, and reports endpoints on the backend (frontend currently reads these from local IndexedDB only)
- Receipt-number collision handling across multiple terminals
- A working seed script (`cmd/seed` is referenced but not implemented)
- Dockerfiles, docker-compose, and CI workflows for both apps
- Wire up or remove the unused `casbin_rule` schema and `SWAGGER_ENABLED` config
- Sync retry/backoff strategy in the frontend `SyncManager`

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the layering rules enforced by `pos-backend/.golangci.yml` (handler → service → repository) and the conventions in each app's `AGENTS.md` / `CLAUDE.md`.
3. Run the relevant test suite and linter before opening a PR:
   - Backend: `make lint && make test`
   - Frontend: `npm run lint && npm run test`
4. Keep money as integer cents, keep API changes in sync with `pos-backend/docs/API_CONTRACT.md`.
5. Open a pull request describing the change and why it's needed.

---

## License

No `LICENSE` file is currently present in this repository. **Not implemented** — add one (e.g. MIT, Apache-2.0) before treating this project as open source.

---

## Author

- **Name:** _Add your name_
- **GitHub:** [SandaruwanWeerawardhana](https://github.com/SandaruwanWeerawardhana)
- **LinkedIn:** _Add your LinkedIn_
- **Email:** _Add your contact email_
