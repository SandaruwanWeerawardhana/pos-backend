-- Seeds the permission catalogue and the four global system roles.
--
-- The (resource, action) pairs generate exactly the permission names in the
-- frontend's PERMISSIONS list (pos-frontend/src/lib/types/index.ts): pos.sell,
-- pos.refund, pos.discount, products.view, products.manage, inventory.view,
-- inventory.adjust, purchases.view, purchases.manage, reports.view,
-- settings.manage, users.manage. That list is the contract — adding a
-- permission here without adding it there leaves it unreachable in the UI, and
-- vice versa.
--
-- Idempotent so a restored dump followed by a fresh migrate cannot
-- double-insert. Ids come from gen_random_uuid() rather than the UUIDv7 the
-- entities mint, because no Go code is in this path; seed-row ordering carries
-- no meaning, which is the only property v7 would buy.

-- +goose Up
-- pgcrypto for gen_random_uuid() on Postgres < 13, where it is not built in.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO permissions (id, resource, action, description)
VALUES
    (gen_random_uuid(), 'pos',       'sell',     'Ring up sales at the till'),
    (gen_random_uuid(), 'pos',       'refund',   'Refund a completed sale'),
    (gen_random_uuid(), 'pos',       'discount', 'Apply a discount to a sale'),
    (gen_random_uuid(), 'products',  'view',     'View the product catalogue'),
    (gen_random_uuid(), 'products',  'manage',   'Create, edit, and delete products'),
    (gen_random_uuid(), 'inventory', 'view',     'View stock levels and movement history'),
    (gen_random_uuid(), 'inventory', 'adjust',   'Adjust stock and transfer between locations'),
    (gen_random_uuid(), 'purchases', 'view',     'View purchase orders and returns'),
    (gen_random_uuid(), 'purchases', 'manage',   'Raise purchase orders and book in goods'),
    (gen_random_uuid(), 'reports',   'view',     'View sales and inventory reports'),
    (gen_random_uuid(), 'settings',  'manage',   'Change store settings'),
    (gen_random_uuid(), 'users',     'manage',   'Manage staff accounts and roles')
ON CONFLICT (resource, action) DO NOTHING;

-- Global system roles: business_id NULL, is_system true. Levels match the
-- entity.RoleLevel* constants — a role may only assign a role at or below its
-- own level.
--
-- roles' uniqueness lives on an expression index over
-- COALESCE(business_id, '000...0'), so the conflict target must be spelled as
-- that same expression; naming the bare columns would not match the index.
INSERT INTO roles (id, business_id, name, description, level, is_system)
VALUES
    (gen_random_uuid(), NULL, 'owner',           'Full access to everything', 100, true),
    (gen_random_uuid(), NULL, 'manager',         'Runs the store day to day',  80, true),
    (gen_random_uuid(), NULL, 'cashier',         'Works the till',             40, true),
    (gen_random_uuid(), NULL, 'warehouse_staff', 'Handles stock and goods in', 40, true)
ON CONFLICT (COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
    WHERE deleted_at IS NULL
    DO NOTHING;

-- Role grants as (role name, permission name) pairs resolved by join against
-- the rows above, rather than hardcoded UUIDs that could drift out of sync.
-- +goose StatementBegin
WITH grants (role_name, permission_name) AS (
    VALUES
        -- Owner is granted every permission by the CROSS JOIN below, so it is
        -- deliberately absent here.
        ('manager', 'pos.sell'),
        ('manager', 'pos.refund'),
        ('manager', 'pos.discount'),
        ('manager', 'products.view'),
        ('manager', 'products.manage'),
        ('manager', 'inventory.view'),
        ('manager', 'inventory.adjust'),
        ('manager', 'purchases.view'),
        ('manager', 'purchases.manage'),
        ('manager', 'reports.view'),
        ('manager', 'settings.manage'),
        ('manager', 'users.manage'),

        -- Cashier: sell and discount, plus the catalogue read the till needs.
        -- No refund by design — reversing a sale is a supervisor action.
        ('cashier', 'pos.sell'),
        ('cashier', 'pos.discount'),
        ('cashier', 'products.view'),

        -- Warehouse staff: stock and goods-in only, nothing at the till.
        ('warehouse_staff', 'products.view'),
        ('warehouse_staff', 'inventory.view'),
        ('warehouse_staff', 'inventory.adjust'),
        ('warehouse_staff', 'purchases.view'),
        ('warehouse_staff', 'purchases.manage')
)
INSERT INTO role_permissions (id, role_id, permission_id, effect)
SELECT gen_random_uuid(), r.id, p.id, 'allow'
FROM grants g
JOIN roles r ON r.name = g.role_name AND r.business_id IS NULL AND r.is_system
JOIN permissions p ON p.name = g.permission_name
ON CONFLICT (role_id, permission_id) DO NOTHING;
-- +goose StatementEnd

-- Owner gets every permission that exists right now. A permission added by a
-- later migration must be granted to owner there too — this covers only the
-- rows present when it runs.
-- +goose StatementBegin
INSERT INTO role_permissions (id, role_id, permission_id, effect)
SELECT gen_random_uuid(), r.id, p.id, 'allow'
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'owner' AND r.business_id IS NULL AND r.is_system
ON CONFLICT (role_id, permission_id) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
DELETE FROM role_permissions
WHERE role_id IN (
    SELECT id FROM roles
    WHERE business_id IS NULL
      AND is_system
      AND name IN ('owner', 'manager', 'cashier', 'warehouse_staff')
);

DELETE FROM roles
WHERE business_id IS NULL
  AND is_system
  AND name IN ('owner', 'manager', 'cashier', 'warehouse_staff');

DELETE FROM permissions
WHERE (resource, action) IN (
    ('pos', 'sell'), ('pos', 'refund'), ('pos', 'discount'),
    ('products', 'view'), ('products', 'manage'),
    ('inventory', 'view'), ('inventory', 'adjust'),
    ('purchases', 'view'), ('purchases', 'manage'),
    ('reports', 'view'), ('settings', 'manage'), ('users', 'manage')
);
