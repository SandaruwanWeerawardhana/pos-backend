-- +goose Up
CREATE TABLE refresh_tokens (
    id             UUID PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Only the SHA-256 of the opaque token is ever stored.
    token_hash     TEXT NOT NULL,
    -- Rotation: every /refresh issues a successor in the same family_id.
    -- Presenting an already-revoked token revokes the whole family.
    family_id      UUID NOT NULL,
    parent_id      UUID NULL REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    revoked_at     TIMESTAMPTZ NULL,
    revoked_reason TEXT NULL,
    user_agent     TEXT NULL,
    ip_address     INET NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);

-- +goose Down
DROP TABLE IF EXISTS refresh_tokens;
