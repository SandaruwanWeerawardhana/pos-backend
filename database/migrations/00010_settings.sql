-- +goose Up
CREATE TABLE settings (
    id          UUID PRIMARY KEY,
    business_id UUID NULL REFERENCES businesses (id) ON DELETE CASCADE,
    branch_id   UUID NULL REFERENCES branches (id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX settings_scope_key_key ON settings (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
);

CREATE TRIGGER settings_set_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS settings;
