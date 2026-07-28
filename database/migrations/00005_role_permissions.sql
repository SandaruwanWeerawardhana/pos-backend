-- +goose Up
CREATE TABLE role_permissions (
    id            UUID PRIMARY KEY,
    role_id       UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    effect        TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX role_permissions_role_id_permission_id_key ON role_permissions (role_id, permission_id);
CREATE INDEX role_permissions_role_id_idx ON role_permissions (role_id);
CREATE INDEX role_permissions_permission_id_idx ON role_permissions (permission_id);

-- +goose Down
DROP TABLE IF EXISTS role_permissions;
