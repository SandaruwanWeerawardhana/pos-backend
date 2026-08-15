-- +goose Up
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY,
    business_id   UUID NULL REFERENCES businesses (id) ON DELETE SET NULL,
    user_id       UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    status        TEXT NOT NULL,
    resource_type TEXT NULL,
    resource_id   UUID NULL,
    old_values    JSONB NULL,
    new_values    JSONB NULL,
    ip_address    INET NULL,
    user_agent    TEXT NULL,
    request_id    TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_business_id_idx ON audit_logs (business_id);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_old_values_gin_idx ON audit_logs USING GIN (old_values);
CREATE INDEX audit_logs_new_values_gin_idx ON audit_logs USING GIN (new_values);

-- +goose Down
DROP TABLE IF EXISTS audit_logs;
