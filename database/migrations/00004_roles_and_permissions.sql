-- +goose Up
CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    -- NULL business_id means a global system role (owner/manager/cashier/...).
    business_id UUID NULL REFERENCES businesses (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NULL,
    -- Blocks a role from assigning another role above its own rank.
    level       INT NOT NULL DEFAULT 0,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX roles_business_id_name_key
    ON roles (COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
    WHERE deleted_at IS NULL;
CREATE INDEX roles_business_id_idx ON roles (business_id);

CREATE TRIGGER roles_set_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
    id          UUID PRIMARY KEY,
    resource    TEXT NOT NULL,
    action      TEXT NOT NULL,
    name        TEXT GENERATED ALWAYS AS (resource || ':' || action) STORED,
    description TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX permissions_resource_action_key ON permissions (resource, action);

CREATE TRIGGER permissions_set_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
