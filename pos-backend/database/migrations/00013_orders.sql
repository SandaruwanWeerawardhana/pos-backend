-- Sales pushed up by POST /orders/sync.
--
-- Built around idempotent replay, not a single authoritative insert. The till
-- is offline-first: it may resend a batch it already sent (reload mid-push,
-- lost response, retry after backoff). client_generated_id is the till's UUID
-- for the sale and is UNIQUE per business, so a replay collides on insert and
-- resolves to "already_synced" instead of duplicating revenue and deducting
-- stock twice. That constraint is the mechanism — the sync service inserts
-- and handles the conflict, never read-then-write, which would race between
-- two concurrent pushes of the same order.
--
-- Order-totals trust policy: the till's figures are stored verbatim, because
-- the customer is holding a receipt showing them. The server recomputes
-- independently and records disagreement in totals_mismatch rather than
-- rejecting: the client never retries a "conflict", so failing an order over
-- a rounding difference would strand a real sale. server_* are NULL when they
-- agree, so a row carrying values is by itself the review queue.

-- +goose Up
CREATE TABLE orders (
    id                      UUID PRIMARY KEY,
    business_id             UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    branch_id               UUID NULL REFERENCES branches (id) ON DELETE SET NULL,
    client_generated_id     TEXT NOT NULL,
    receipt_no              TEXT NULL,
    payment_method          TEXT NOT NULL
                                CHECK (payment_method IN ('cash', 'card', 'qr', 'other')),

    subtotal_cents          BIGINT NOT NULL DEFAULT 0,
    discount_cents          BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    tax_total_cents         BIGINT NOT NULL DEFAULT 0,
    total_cents             BIGINT NOT NULL DEFAULT 0,
    refunded                BOOLEAN NOT NULL DEFAULT false,

    totals_mismatch         BOOLEAN NOT NULL DEFAULT false,
    server_total_cents      BIGINT NULL,
    server_tax_total_cents  BIGINT NULL,
    cashier_id              UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    sold_at                 TIMESTAMPTZ NOT NULL,
    synced_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ NULL
);

-- The idempotency key for order sync. Deliberately not partial on deleted_at:
-- a soft-deleted order must still block a replay of the same client id.
CREATE UNIQUE INDEX orders_business_id_client_generated_id_key
    ON orders (business_id, client_generated_id);
CREATE INDEX orders_business_id_sold_at_idx ON orders (business_id, sold_at DESC);
CREATE INDEX orders_cashier_id_idx ON orders (cashier_id);
CREATE INDEX orders_business_id_totals_mismatch_idx
    ON orders (business_id) WHERE totals_mismatch;

CREATE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Line items. name, unit_price_cents, and tax_rate are copies captured at
-- sale time, not joins to products: a receipt must reprint exactly as it was
-- rung up even after the catalogue price changes or the product is deleted,
-- which is why product_id is nullable and ON DELETE SET NULL.
CREATE TABLE order_items (
    id                   UUID PRIMARY KEY,
    order_id             UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id           UUID NULL REFERENCES products (id) ON DELETE SET NULL,
    name                 TEXT NOT NULL,
    quantity             NUMERIC(14, 3) NOT NULL,
    unit_price_cents     BIGINT NOT NULL,
    tax_rate             NUMERIC(6, 4) NOT NULL DEFAULT 0,
    unit                 TEXT NULL,
    is_weighted          BOOLEAN NOT NULL DEFAULT false,
    line_discount_cents  BIGINT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);


CREATE TABLE order_payments (
    id              UUID PRIMARY KEY,
    order_id        UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    method          TEXT NOT NULL CHECK (method IN ('cash', 'card', 'qr', 'other')),
    amount_cents    BIGINT NOT NULL,
    -- Cash only: what the customer handed over and what came back.
    tendered_cents  BIGINT NULL,
    change_cents    BIGINT NULL,
    -- Card auth code / QR transaction id.
    reference       TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_payments_order_id_idx ON order_payments (order_id);

-- Stock ledger. Phase 1 writes one 'sale' row per sold line so the deduction
-- performed at sync time is explainable and auditable; the adjustment,
-- transfer, and waste paths that also write here arrive in Phase 2.
--
-- product_name and balance_after are denormalised: history must stay readable
-- after a product is renamed or deleted, and recomputing a running balance by
-- summing deltas gets slower with every sale. reference_id has no foreign key
-- because it points at whichever aggregate caused the movement (an order now,
-- a purchase order or return later), so no single FK fits.
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY,
    business_id     UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    product_id      UUID NULL REFERENCES products (id) ON DELETE SET NULL,
    product_name    TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment',
                                                  'transfer_in', 'transfer_out',
                                                  'waste', 'damage', 'return')),
    -- Signed: negative removes stock. balance_after is the product's total
    -- immediately after this movement was applied.
    quantity_delta  NUMERIC(14, 3) NOT NULL,
    balance_after   NUMERIC(14, 3) NOT NULL,
    reason          TEXT NULL,
    batch_no        TEXT NULL,
    reference_id    UUID NULL,
    created_by      UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_business_id_created_at_idx
    ON stock_movements (business_id, created_at DESC);
CREATE INDEX stock_movements_product_id_created_at_idx
    ON stock_movements (product_id, created_at DESC);
CREATE INDEX stock_movements_reference_id_idx ON stock_movements (reference_id)
    WHERE reference_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS order_payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
