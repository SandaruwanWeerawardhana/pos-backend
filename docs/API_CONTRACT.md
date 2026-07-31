# API contract — Phase 1

The eight endpoints the frontend already calls. The client is written and
committed (`pos-frontend/src/lib/services/`), so **the client is the
specification** — the shapes below are what it sends and reads, not proposals.

Flip `NEXT_PUBLIC_USE_MOCK_API=false` and the app runs against this API.

## Conventions

| Rule | Detail |
|---|---|
| Success bodies | **No envelope.** The handler's payload is the whole body — `GET /products` is a bare array. `httpClient` hands the parsed body to its caller untouched. |
| Error bodies | `{"message": "..."}` and nothing else. The client reads only `message` and renders it **raw to a cashier**, so it must be human-readable and leak nothing. |
| Casing | `/auth/*` bodies are **camelCase**. Domain models (products, orders) are **snake_case**. Deliberate, matching the client. |
| Money | Integer cents, everywhere. |
| Rates | `tax_rate` is a fraction (`0.08` = 8%). `discount_percent` is `0`–`100`. Neither is cents. |
| Timestamps | Epoch **milliseconds** as numbers — not RFC3339. Exception: `expiry_date`/`manufactured_date` are `yyyy-mm-dd` calendar days. |
| Auth | `Authorization: Bearer <token>` on everything except register/login/password-reset. |
| Request id | Returned in the `X-Request-ID` response header (not in the body). |

## Auth

Access token TTL is **12h** (`JWT_ACCESS_TTL`), not the usual 15m: the client
has no refresh flow — it decodes the token's `exp` and ends the session locally
— so a short TTL would log a cashier out mid-shift. `exp` is in **seconds**
(RFC 7519), which is what `readTokenExpiry` expects. Logout revocation is still
immediate via the Redis denylist.

`POST /auth/refresh` exists and is fully implemented but **no client calls it**.
Reserved for Phase 2.

### `POST /auth/register` → 201

```jsonc
// request
{ "ownerName": "Jane", "businessName": "Corner Shop",
  "email": "jane@shop.lk", "password": "correct-horse", "businessType": "grocery" }
// response
{ "token": "<jwt>", "user": { "id": "…", "email": "…", "name": "…",
  "businessId": "…", "businessName": "…", "businessType": "grocery",
  "branchId": "…", "roles": ["owner"], "permissions": ["pos.sell", …] } }
```

`businessType` must be `grocery` or `bookshop`. Registration provisions
business + default branch + owner user + owner role atomically.

### `POST /auth/login` → 200

`{ "email", "password" }` → same `{token, user}` body as register.

### `POST /auth/password/reset-request` → 200

`{ "email" }` → `{}`, or `{"devToken": "…"}` **in a local environment only**
(`APP_ENV=local`), since there is no mail server there.

Resolves identically for unknown addresses — differing responses would make this
an account-enumeration oracle. Token is 256 bits, stored only as a SHA-256
hash, single-use, 30-minute expiry; issuing a new one invalidates the previous.

### `POST /auth/password/reset` → 200

`{ "token", "newPassword" }` → `{}`. Clears any failed-login lockout and
revokes every existing session.

### `POST /auth/password/change` → 200 *(auth)*

`{ "currentPassword", "newPassword" }` → `{}`. The current session stays valid.

### `PATCH /auth/profile` → 200 *(auth)*

`{ "name"?, "email"?, "businessName"? }` → the `user` object.

⚠️ **`email` is accepted and ignored.** Repointing a sign-in address needs an
ownership-verification round-trip that does not exist yet; ignoring it beats
silently rewriting a login credential. `businessName` renames the business (the
slug is deliberately left alone).

## `GET /products` → 200 *(auth)*

A **bare array** of the whole catalogue, unpaginated: the till caches it in
IndexedDB and sells offline from that copy, so a truncated response would leave
it unable to ring up whatever was cut off.

Required on every row: `id`, `name`, `sku`, `barcode`, `price_cents`,
`tax_rate`, `stock_quantity`, `created_at`, `updated_at`. Everything else is
omitted when unset — the client treats a missing catalogue field as "use the
default", which a zero value would defeat.

`sku` and `barcode` are unique **per business**, not globally: two tenants may
stock the same GTIN.

## `POST /orders/sync` → 200 *(auth)*

```jsonc
// request — batch of at most 50
{ "orders": [ { "client_generated_id": "uuid",   // idempotency key, required
                "receipt_no": "R20260730-0001",
                "payment_method": "cash",
                "created_at": 1750000000000,       // till's clock, epoch ms
                "total_cents": 1250, "tax_total_cents": 100, "discount_cents": 0,
                "items": [ { "product_id": "uuid?", "name": "Bananas",
                             "quantity": 1.2, "unit_price_cents": 199,
                             "tax_rate": 0, "is_weighted": true,
                             "line_discount_cents": 0 } ],
                "payments": [ { "method": "cash", "amount_cents": 1250,
                                "tendered_cents": 2000, "change_cents": 750 } ] } ] }
// response — one result per submitted order, always
{ "results": [ { "client_generated_id": "uuid", "result": "synced", "server_id": "uuid" } ] }
```

`result` is one of `synced`, `already_synced`, `conflict`, `error`.

### Guarantees

**One result per submitted order, without exception.** An order the client sent
but cannot find in `results` stays `syncing` in its local database forever —
nothing re-queues it, and only a page reload recovers it
(`releaseOrphanedClaims`). That is a real data-loss path, so the handler fails
the whole request rather than returning a short list.

**Idempotent on `client_generated_id`,** enforced by a unique index and an
`ON CONFLICT DO NOTHING` insert — never a read-then-write, which two concurrent
pushes of the same order would both pass. A replay returns `already_synced` and
deducts **no** stock a second time: the insert runs before any stock movement in
the same transaction, so a duplicate unwinds before touching inventory.

**Per-order transactions.** One bad order must not roll back the other 49 — the
client would mark them all failed and resend everything.

**`conflict` is never retried by the client,** so it strands a real sale
permanently. Reserved for a payload that can never succeed however often it is
resent; anything possibly transient is `error`.

**200 even when individual orders fail.** A non-2xx makes the client treat the
whole batch as a transport failure and resend orders it has already been told
about.

### Order totals: accept and flag

The till's figures are stored **verbatim** — the customer is holding a receipt
showing them. The server recomputes independently
(`computeTotals`, mirroring `cart-math.ts` step for step) and on disagreement
sets `orders.totals_mismatch` with `server_total_cents` /
`server_tax_total_cents`. It never corrects the stored figures and never
rejects: failing a sale over a rounding difference would strand real revenue.

Rows carrying `server_*` values are the review queue:

```sql
SELECT client_generated_id, total_cents, server_total_cents
FROM orders WHERE business_id = $1 AND totals_mismatch;
```

### ⚠️ Client bug this works around

`computeCartTotal` multiplies `unit_price_cents` by a fractional quantity for
weighted items and does **not** round, so a 0.457 kg sale at 899 c/kg persists
and transmits `total_cents: 410.843`. `encoding/json` refuses to decode that
into an `int64` — and refuses even `410.0` — which would have failed the entire
batch.

`dto.Cents` therefore accepts a fractional amount and rounds it. **The client
should be fixed to round before persisting**; until then this keeps weighted-item
sales syncable. `computeTotals` rounds the same way so those sales are not all
flagged as mismatched.

## Limits

| Setting | Value | Why |
|---|---|---|
| `HTTP_BODY_LIMIT` | 2 MiB | Largest legitimate request is a 50-order batch. |
| Batch size | ≤ 50 | Matches `SYNC_CONFIG.maxBatchSize`; larger means a misbehaving caller. |
| `AUTH_RATE_LIMIT_MAX` | 5 / 15 min | Register, login, refresh, both password-reset endpoints. |
| `RATE_LIMIT_MAX` | 120 / min | Everything else. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Must list the frontend origin or the browser blocks every request. |

Client poll cadence is 30s, backing off to 5 min on failure.

## Smoke test

```bash
BASE=http://localhost:8080

# 1. register (or login) and keep the token
TOKEN=$(curl -sS -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"ownerName":"Jane","businessName":"Corner Shop","email":"jane@shop.lk","password":"correct-horse-battery","businessType":"grocery"}' \
  | tee /dev/stderr | python -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# 2. catalogue — expect a bare [] on a fresh tenant, NOT {"data":[]}
curl -sS $BASE/products -H "Authorization: Bearer $TOKEN"

# 3. sync an order
CGID=$(uuidgen)
curl -sS -X POST $BASE/orders/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"orders\":[{\"client_generated_id\":\"$CGID\",\"payment_method\":\"cash\",
       \"created_at\":$(date +%s000),\"total_cents\":398,\"tax_total_cents\":0,
       \"discount_cents\":0,\"items\":[{\"name\":\"Bananas\",\"quantity\":2,
       \"unit_price_cents\":199,\"tax_rate\":0}]}]}"
# -> {"results":[{"client_generated_id":"…","result":"synced","server_id":"…"}]}

# 4. replay the SAME id — must be already_synced, and must not deduct stock twice
curl -sS -X POST $BASE/orders/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"orders\":[{\"client_generated_id\":\"$CGID\",\"payment_method\":\"cash\",
       \"created_at\":$(date +%s000),\"total_cents\":398,\"tax_total_cents\":0,
       \"discount_cents\":0,\"items\":[{\"name\":\"Bananas\",\"quantity\":2,
       \"unit_price_cents\":199,\"tax_rate\":0}]}]}"
# -> {"results":[{"client_generated_id":"…","result":"already_synced"}]}

# 5. fractional weighted total must be ACCEPTED, not 400
curl -sS -X POST $BASE/orders/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"orders\":[{\"client_generated_id\":\"$(uuidgen)\",\"payment_method\":\"cash\",
       \"created_at\":$(date +%s000),\"total_cents\":410.843,\"tax_total_cents\":0,
       \"discount_cents\":0,\"items\":[{\"name\":\"Chicken\",\"quantity\":0.457,
       \"unit_price_cents\":899,\"tax_rate\":0,\"is_weighted\":true}]}]}"

# 6. error shape — expect {"message":"…"} with no `code` or `errors`
curl -sS -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"nobody@shop.lk","password":"wrong-password-here"}'
```

### Acceptance checklist

- [ ] `GET /products` is a bare array
- [ ] Errors are `{"message": …}` — no `success`, `code`, or `errors[]`
- [ ] `login` returns `token` (not `access_token`) and a camelCase `user`
- [ ] JWT `exp` is in seconds and ~12h out
- [ ] Order replay → `already_synced`, stock deducted once
- [ ] `results.length` always equals `orders.length`
- [ ] Fractional `total_cents` accepted, not rejected
- [ ] Frontend works end to end with `NEXT_PUBLIC_USE_MOCK_API=false`

## Permissions

Seeded as `resource.action` with a **dot** (`pos.sell`), matching the frontend's
`PERMISSIONS` list exactly — migration `00014` changed the generated column from
`:` to `.` so no UI call site had to move. That list is the contract: adding a
permission on one side only leaves it unreachable.

Roles: `owner` (every permission, granted by a `CROSS JOIN` so it stays complete
as permissions are added), `manager` (all 12 explicitly — currently identical to
owner in practice, differing only by `level`, which governs which roles it may
assign), `cashier` (`pos.sell`, `pos.discount`, `products.view` — deliberately
**no** refund, since reversing a sale is a supervisor action),
`warehouse_staff` (stock and goods-in, nothing at the till).

⚠️ Endpoints are currently gated on **authentication only**, not on these
permissions. Per-route enforcement is Phase 2.

## Phase 2

Everything below is browser-only today and has no server counterpart. Local
writes stay on the device.

| Area | Gap |
|---|---|
| Product writes | Locally-created products (`_local_only`) **never leave the device**. Highest-value gap. |
| Catalogue delta | A full catalogue pull every 30s does not scale. `products_business_id_updated_at_idx` is already in place for `GET /products?since=<epoch_ms>`. |
| Refunds | `PendingOrder.refunded` is a local annotation; `refunded` is accepted and ignored on sync. |
| Sales history | No read endpoint; the till only ever pushes. |
| Inventory | `stock_movements` is written by order sync only. Adjustments, transfers, waste, alerts are local. |
| Purchasing | POs, goods-in, returns — no tables yet. |
| Suppliers / warehouses | `products.supplier_id` / `warehouse_id` are unconstrained UUIDs; FKs go on when the tables land. |
| Staff + PIN auth | `staffUsers` and PIN login are local-only; the till session authorises nothing server-side. |
| Settings, discounts, reports | Entirely local. |
| Permission enforcement | Per-route checks (see above). |
| Receipt numbers | Per-terminal, so two terminals collide. Not unique in the schema. Needs a server-assigned number or a device prefix. |
