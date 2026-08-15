-- +goose Up
CREATE TABLE user_roles (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    branch_id  UUID NULL REFERENCES branches (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_roles_user_role_branch_key
    ON user_roles (user_id, role_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX user_roles_user_id_idx ON user_roles (user_id);
CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);

-- +goose Down
DROP TABLE IF EXISTS user_roles;
