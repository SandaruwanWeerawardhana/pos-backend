-- +goose Up
CREATE TABLE products (
    id                    UUID PRIMARY KEY,
    business_id           UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    sku                   TEXT NOT NULL,
    barcode               TEXT NOT NULL,
    barcode_source        TEXT NOT NULL DEFAULT 'package'
                              CHECK (barcode_source IN ('package', 'generated')),

    price_cents           BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    cost_cents            BIGINT NULL CHECK (cost_cents IS NULL OR cost_cents >= 0),
    tax_rate              NUMERIC(6, 4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
    stock_quantity        NUMERIC(14, 3) NOT NULL DEFAULT 0,
    category              TEXT NULL,
    brand                 TEXT NULL,
    description           TEXT NULL,
    unit                  TEXT NOT NULL DEFAULT 'unit'
                              CHECK (unit IN ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box')),
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive', 'draft')),

    is_weighted           BOOLEAN NOT NULL DEFAULT false,
    reorder_level         NUMERIC(14, 3) NULL,
    min_stock_level       NUMERIC(14, 3) NULL,
    discount_percent      NUMERIC(5, 2) NOT NULL DEFAULT 0
                              CHECK (discount_percent >= 0 AND discount_percent <= 100),
    shelf_location        TEXT NULL,
    image_url             TEXT NULL,
    images                JSONB NOT NULL DEFAULT '[]',
    plugin_data           JSONB NOT NULL DEFAULT '{}',

    supplier_id           UUID NULL,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ NULL
);


CREATE UNIQUE INDEX products_business_id_sku_key
    ON products (business_id, sku) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX products_business_id_barcode_key
    ON products (business_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX products_business_id_idx ON products (business_id);
CREATE INDEX products_business_id_category_idx ON products (business_id, category);
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
