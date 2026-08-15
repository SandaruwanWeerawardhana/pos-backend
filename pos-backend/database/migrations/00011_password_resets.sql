-- Password reset tokens.
--
-- Only a SHA-256 hash of the token is stored, never the token itself: a
-- database read (backup, log, SQL injection) must not yield working reset
-- links. The plaintext exists solely in the email sent to the user.
--
-- consumed_at rather than a DELETE on use, so a replayed link is
-- distinguishable from an expired one in logs, and single-use is enforced by
-- a column check instead of row absence.

-- +goose Up
CREATE TABLE password_resets (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup is by hash: the reset endpoint hashes the presented token and finds
-- the row, so this index carries the whole read path.
CREATE UNIQUE INDEX password_resets_token_hash_key ON password_resets (token_hash);
CREATE INDEX password_resets_user_id_idx ON password_resets (user_id);
CREATE INDEX password_resets_expires_at_idx ON password_resets (expires_at);

-- +goose Down
DROP TABLE IF EXISTS password_resets;
