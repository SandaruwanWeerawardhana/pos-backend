-- +goose Up
CREATE TABLE businesses (
    id                UUID PRIMARY KEY,
    slug              TEXT NOT NULL,
    name              TEXT NOT NULL,
    business_type     TEXT NOT NULL CHECK (business_type IN ('grocery', 'bookshop')),
    currency_code     TEXT NOT NULL DEFAULT 'LKR',
    default_tax_rate  NUMERIC(5, 2) NOT NULL DEFAULT 0,
    owner_user_id     UUID NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX businesses_slug_key ON businesses (slug) WHERE deleted_at IS NULL;

CREATE TRIGGER businesses_set_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branches (
    id          UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX branches_business_id_code_key ON branches (business_id, code) WHERE deleted_at IS NULL;
CREATE INDEX branches_business_id_idx ON branches (business_id);

CREATE TRIGGER branches_set_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS businesses;
