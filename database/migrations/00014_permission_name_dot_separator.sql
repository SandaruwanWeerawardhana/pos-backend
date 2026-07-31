-- Aligns the generated permission name with the format the frontend already
-- uses: its PERMISSIONS list and hasPermission() spell them "pos.sell", not
-- "pos:sell" (pos-frontend/src/lib/types/index.ts). Changing the separator
-- here rather than in the frontend keeps every UI call site untouched, and
-- there is no production permission data to migrate.
--
-- A generated column's expression cannot be altered in place, so the column
-- is dropped and re-added; permissions rows are seeded data, so nothing a
-- user typed is at risk.

-- +goose Up
DROP INDEX IF EXISTS permissions_resource_action_key;
ALTER TABLE permissions DROP COLUMN IF EXISTS name;
ALTER TABLE permissions
    ADD COLUMN name TEXT GENERATED ALWAYS AS (resource || '.' || action) STORED;
CREATE UNIQUE INDEX permissions_resource_action_key ON permissions (resource, action);
CREATE UNIQUE INDEX permissions_name_key ON permissions (name);

-- +goose Down
DROP INDEX IF EXISTS permissions_name_key;
DROP INDEX IF EXISTS permissions_resource_action_key;
ALTER TABLE permissions DROP COLUMN IF EXISTS name;
ALTER TABLE permissions
    ADD COLUMN name TEXT GENERATED ALWAYS AS (resource || ':' || action) STORED;
CREATE UNIQUE INDEX permissions_resource_action_key ON permissions (resource, action);
