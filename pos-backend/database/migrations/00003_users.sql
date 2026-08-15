-- +goose Up
CREATE TABLE users (
    id                     UUID PRIMARY KEY,
    business_id            UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    email                  CITEXT NOT NULL,
    password_hash          TEXT NOT NULL,
    full_name              TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
    failed_login_attempts  INT NOT NULL DEFAULT 0,
    locked_until           TIMESTAMPTZ NULL,
    -- Columns exist now with no endpoints behind them yet (deferred: 2FA,
    -- email/phone verification), so wiring those features later is an
    -- additive migration instead of another schema change.
    two_factor_enabled     BOOLEAN NOT NULL DEFAULT false,
    two_factor_secret      TEXT NULL,
    email_verified_at      TIMESTAMPTZ NULL,
    phone                  TEXT NULL,
    phone_verified_at      TIMESTAMPTZ NULL,
    last_login_at          TIMESTAMPTZ NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX users_business_id_email_key ON users (business_id, email) WHERE deleted_at IS NULL;
CREATE INDEX users_business_id_idx ON users (business_id);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE businesses
    ADD CONSTRAINT businesses_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_owner_user_id_fkey;
DROP TABLE IF EXISTS users;
