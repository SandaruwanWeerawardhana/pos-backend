-- +goose Up
-- Column shape matches casbin/gorm-adapter's CasbinRule struct exactly
-- (ptype, v0..v5) so the adapter is pointed at this table via
-- NewAdapterByDBWithCustomTable in commit 10 and never runs its own DDL —
-- relational role/permission tables stay the sole source of truth, and this
-- table is only ever written by rbac_service.SyncPolicies.
CREATE TABLE casbin_rule (
    id    BIGSERIAL PRIMARY KEY,
    ptype VARCHAR(100) NOT NULL DEFAULT '',
    v0    VARCHAR(100) NOT NULL DEFAULT '',
    v1    VARCHAR(100) NOT NULL DEFAULT '',
    v2    VARCHAR(100) NOT NULL DEFAULT '',
    v3    VARCHAR(100) NOT NULL DEFAULT '',
    v4    VARCHAR(100) NOT NULL DEFAULT '',
    v5    VARCHAR(100) NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX casbin_rule_unique_key ON casbin_rule (ptype, v0, v1, v2, v3, v4, v5);

-- +goose Down
DROP TABLE IF EXISTS casbin_rule;
