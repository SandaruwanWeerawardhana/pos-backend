-- The catalogue served by GET /products.
--
-- Column set mirrors the frontend's Product type
-- (pos-frontend/src/lib/types/index.ts) field for field, so a row maps to the
-- wire shape without a translation table. Only name/sku/barcode/price_cents/
-- tax_rate/stock_quantity are required there; every catalogue extra is
-- nullable or defaulted because older cached client rows predate them.
--
-- Money is integer cents in BIGINT columns, never NUMERIC or float. tax_rate
-- is the deliberate exception: a fractional rate (0.08 = 8%), not currency.
-- discount_percent is 0-100, also a rate.
--
-- Quantities are NUMERIC(14,3), not INT: weighted products priced per kg
-- carry fractional stock, and an integer column would silently truncate.
--
-- Phase 1 is read-only over this table (the client never pushes products), so
-- supplier_id/warehouse_id are plain UUIDs with no foreign key yet — the
-- suppliers and warehouses tables arrive in Phase 2 and the constraints go on
-- then, rather than shipping empty tables now to satisfy a reference nothing
-- enforces.

-- +goose Up
CREATE TABLE products (
    id                    UUID PRIMARY KEY,
    business_id           UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    sku                   TEXT NOT NULL,
    barcode               TEXT NOT NULL,
    -- 'package' = GTIN printed by the supplier, 'generated' = in-store code.
    barcode_source        TEXT NOT NULL DEFAULT 'package'
                              CHECK (barcode_source IN ('package', 'generated')),

    price_cents           BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    cost_cents            BIGINT NULL CHECK (cost_cents IS NULL OR cost_cents >= 0),
    purchase_price_cents  BIGINT NULL CHECK (purchase_price_cents IS NULL OR purchase_price_cents >= 0),
    tax_rate              NUMERIC(6, 4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
    stock_quantity        NUMERIC(14, 3) NOT NULL DEFAULT 0,

    category              TEXT NULL,
    subcategory           TEXT NULL,
    brand                 TEXT NULL,
    description           TEXT NULL,
    unit                  TEXT NOT NULL DEFAULT 'unit'
                              CHECK (unit IN ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box')),
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive', 'draft')),
    product_type          TEXT NOT NULL DEFAULT 'regular'
                              CHECK (product_type IN ('regular', 'fresh_produce', 'frozen', 'dairy',
                                                      'bakery', 'beverage', 'meat', 'seafood',
                                                      'household', 'personal_care')),
    storage_type          TEXT NOT NULL DEFAULT 'ambient'
                              CHECK (storage_type IN ('ambient', 'chilled', 'frozen')),

    is_weighted           BOOLEAN NOT NULL DEFAULT false,
    is_variable_weight    BOOLEAN NOT NULL DEFAULT false,
    allow_discount        BOOLEAN NOT NULL DEFAULT true,
    allow_returns         BOOLEAN NOT NULL DEFAULT true,
    track_expiry          BOOLEAN NOT NULL DEFAULT false,
    track_batch           BOOLEAN NOT NULL DEFAULT false,

    -- reorder_level triggers the low-stock alert; min_stock_level is the hard
    -- floor. Distinct thresholds, deliberately separate columns.
    reorder_level         NUMERIC(14, 3) NULL,
    min_stock_level       NUMERIC(14, 3) NULL,
    discount_percent      NUMERIC(5, 2) NOT NULL DEFAULT 0
                              CHECK (discount_percent >= 0 AND discount_percent <= 100),

    product_code          TEXT NULL,
    qr_code               TEXT NULL,
    shelf_location        TEXT NULL,
    branch                TEXT NULL,
    supplier_product_code TEXT NULL,
    image_url             TEXT NULL,
    -- images is an ordered list of data URLs; plugin_data is opaque key/value
    -- owned by the active business-type plugin. Neither is ever queried by
    -- content, so no relational split earns its keep.
    images                JSONB NOT NULL DEFAULT '[]',
    plugin_data           JSONB NOT NULL DEFAULT '{}',

    supplier_id           UUID NULL,
    warehouse_id          UUID NULL,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ NULL
);

-- SKU and barcode are unique per business, not globally: two tenants may
-- legitimately stock the same GTIN.
CREATE UNIQUE INDEX products_business_id_sku_key
    ON products (business_id, sku) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX products_business_id_barcode_key
    ON products (business_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX products_business_id_idx ON products (business_id);
CREATE INDEX products_business_id_category_idx ON products (business_id, category);
-- Supports the Phase 2 catalogue delta pull (updated_at > since): a full
-- catalogue every 30 seconds does not scale, and the index it needs is free
-- to add now.
CREATE INDEX products_business_id_updated_at_idx ON products (business_id, updated_at DESC);

CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Batch/expiry tracking for perishables. Relational rather than JSONB on
-- products because the expiry-alert query filters and sorts by expiry_date
-- across the whole catalogue, which JSONB cannot index usefully.
CREATE TABLE product_batches (
    id                 UUID PRIMARY KEY,
    product_id         UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    batch_no           TEXT NOT NULL,
    -- Calendar days printed on a label: no time-of-day, no timezone.
    expiry_date        DATE NULL,
    manufactured_date  DATE NULL,
    quantity           NUMERIC(14, 3) NOT NULL DEFAULT 0,
    cost_cents         BIGINT NULL CHECK (cost_cents IS NULL OR cost_cents >= 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_batches_product_id_batch_no_key
    ON product_batches (product_id, batch_no);
CREATE INDEX product_batches_expiry_date_idx ON product_batches (expiry_date)
    WHERE expiry_date IS NOT NULL;

CREATE TRIGGER product_batches_set_updated_at
    BEFORE UPDATE ON product_batches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS product_batches;
DROP TABLE IF EXISTS products;
