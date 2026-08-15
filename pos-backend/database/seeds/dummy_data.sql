-- Dev-only dummy catalogue and sales for the first business in the database.
--
-- Not a goose migration: it is rerunnable and never ships to production. Every
-- row carries a fixed UUID and the script deletes those UUIDs before
-- reinserting, so running it twice leaves the same state rather than doubling
-- sales or double-deducting stock.
--
-- Money is integer cents, tax_rate is a fraction (0.08 = 8%), quantities are
-- NUMERIC(14,3) so weighted lines keep their grams.
--
-- Run:
--   psql -h localhost -p 5432 -U root -d pos -f database/seeds/dummy_data.sql

BEGIN;

-- Fail loudly instead of inserting orphans if nothing has been seeded yet.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM businesses) THEN
        RAISE EXCEPTION 'no business rows: run the owner/business seed first';
    END IF;
END $$;

-- Clean previous run. order_items and order_payments cascade from orders;
-- stock_movements has no FK to orders, so it goes explicitly.
DELETE FROM stock_movements WHERE id IN (
    '55555555-5555-4555-8555-000000000001',
    '55555555-5555-4555-8555-000000000002',
    '55555555-5555-4555-8555-000000000003',
    '55555555-5555-4555-8555-000000000004'
);
DELETE FROM orders WHERE id IN (
    '22222222-2222-4222-8222-000000000001',
    '22222222-2222-4222-8222-000000000002'
);
DELETE FROM products WHERE id IN (
    '11111111-1111-4111-8111-000000000001',
    '11111111-1111-4111-8111-000000000002',
    '11111111-1111-4111-8111-000000000003'
);

-- ---------------------------------------------------------------- products

INSERT INTO products (
    id, business_id, name, sku, barcode, barcode_source,
    price_cents, cost_cents, tax_rate, stock_quantity,
    category, unit,
    is_weighted, reorder_level, min_stock_level
)
SELECT v.id, b.id, v.name, v.sku, v.barcode, v.barcode_source,
       v.price_cents, v.cost_cents, v.tax_rate, v.stock_quantity,
       v.category, v.unit,
       v.is_weighted, v.reorder_level, v.min_stock_level
FROM (SELECT id FROM businesses ORDER BY created_at LIMIT 1) b,
(VALUES
    -- Sold per kg: fractional stock, so the weighted path gets exercised.
    ('11111111-1111-4111-8111-000000000001'::uuid, 'Bananas (Ambul)', 'BAN-001', '4011200296908',
     'generated', 45000::bigint, 32000::bigint, 0::numeric, 120.500::numeric,
     'Produce', 'kg', true, 20.000::numeric, 10.000::numeric),
    -- The only taxed line, so tax_total_cents is non-zero on both orders.
    ('11111111-1111-4111-8111-000000000002'::uuid, 'Coca-Cola 330ml Can', 'COK-330', '5449000000996',
     'package', 25000::bigint, 18500::bigint, 0.0800::numeric, 240.000::numeric,
     'Beverages', 'unit', false, 48.000::numeric, 24.000::numeric),
    ('11111111-1111-4111-8111-000000000003'::uuid, 'Sunrise Bread 450g', 'BRD-450', '4791234500017',
     'package', 21000::bigint, 15000::bigint, 0::numeric, 60.000::numeric,
     'Bakery', 'unit', false, 15.000::numeric, 5.000::numeric)
) AS v(id, name, sku, barcode, barcode_source, price_cents, cost_cents, tax_rate,
       stock_quantity, category, unit, is_weighted,
       reorder_level, min_stock_level);

-- ------------------------------------------------------------------ orders

-- Order 1 — cash, one weighted line.
--   Bananas 1.250 kg @ 45000       =  56250, tax 0
--   Coca-Cola 2 @ 25000            =  50000, tax 8% = 4000
--   subtotal 106250, discount 0, tax 4000, total 110250
INSERT INTO orders (
    id, business_id, branch_id, client_generated_id, receipt_no, payment_method,
    subtotal_cents, discount_cents, tax_total_cents, total_cents,
    cashier_id, sold_at
)
SELECT '22222222-2222-4222-8222-000000000001',
       b.id,
       (SELECT id FROM branches WHERE business_id = b.id ORDER BY created_at LIMIT 1),
       'dummy-order-0001', 'R-1001', 'cash',
       106250, 0, 4000, 110250,
       (SELECT id FROM users ORDER BY created_at LIMIT 1),
       now() - interval '2 hours'
FROM (SELECT id FROM businesses ORDER BY created_at LIMIT 1) b;

-- Order 2 — card, order-level discount.
--   Bread 3 @ 21000                =  63000, tax 0
--   Coca-Cola 1 @ 25000            =  25000, tax 8% = 2000
--   subtotal 88000, discount 1000, tax 2000, total 89000
INSERT INTO orders (
    id, business_id, branch_id, client_generated_id, receipt_no, payment_method,
    subtotal_cents, discount_cents, tax_total_cents, total_cents,
    cashier_id, sold_at
)
SELECT '22222222-2222-4222-8222-000000000002',
       b.id,
       (SELECT id FROM branches WHERE business_id = b.id ORDER BY created_at LIMIT 1),
       'dummy-order-0002', 'R-1002', 'card',
       88000, 1000, 2000, 89000,
       (SELECT id FROM users ORDER BY created_at LIMIT 1),
       now() - interval '25 minutes'
FROM (SELECT id FROM businesses ORDER BY created_at LIMIT 1) b;

INSERT INTO order_items (
    id, order_id, product_id, name, quantity, unit_price_cents, tax_rate,
    unit, is_weighted, line_discount_cents
) VALUES
    ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001',
     '11111111-1111-4111-8111-000000000001', 'Bananas (Ambul)', 1.250, 45000, 0, 'kg', true, 0),
    ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000001',
     '11111111-1111-4111-8111-000000000002', 'Coca-Cola 330ml Can', 2.000, 25000, 0.0800, 'unit', false, 0),
    ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000002',
     '11111111-1111-4111-8111-000000000003', 'Sunrise Bread 450g', 3.000, 21000, 0, 'unit', false, 0),
    ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000002',
     '11111111-1111-4111-8111-000000000002', 'Coca-Cola 330ml Can', 1.000, 25000, 0.0800, 'unit', false, 0);

INSERT INTO order_payments (
    id, order_id, method, amount_cents, tendered_cents, change_cents, reference
) VALUES
    ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000001',
     'cash', 110250, 120000, 9750, NULL),
    ('44444444-4444-4444-8444-000000000002', '22222222-2222-4222-8222-000000000002',
     'card', 89000, NULL, NULL, 'AUTH-88213');

-- --------------------------------------------------------- stock deduction

-- The ledger rows and the products.stock_quantity below must agree: these are
-- the balances after both orders are applied.
--   Bananas  120.500 - 1.250 = 119.250
--   Coke     240.000 - 2.000 = 238.000 - 1.000 = 237.000
--   Bread     60.000 - 3.000 =  57.000
INSERT INTO stock_movements (
    id, business_id, product_id, product_name, type,
    quantity_delta, balance_after, reason, reference_id, created_by, created_at
)
SELECT v.id, b.id, v.product_id, v.product_name, 'sale',
       v.quantity_delta, v.balance_after, 'dummy seed sale', v.reference_id,
       (SELECT id FROM users ORDER BY created_at LIMIT 1), v.created_at
FROM (SELECT id FROM businesses ORDER BY created_at LIMIT 1) b,
(VALUES
    ('55555555-5555-4555-8555-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid,
     'Bananas (Ambul)', -1.250::numeric, 119.250::numeric,
     '22222222-2222-4222-8222-000000000001'::uuid, now() - interval '2 hours'),
    ('55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid,
     'Coca-Cola 330ml Can', -2.000::numeric, 238.000::numeric,
     '22222222-2222-4222-8222-000000000001'::uuid, now() - interval '2 hours'),
    ('55555555-5555-4555-8555-000000000003'::uuid, '11111111-1111-4111-8111-000000000003'::uuid,
     'Sunrise Bread 450g', -3.000::numeric, 57.000::numeric,
     '22222222-2222-4222-8222-000000000002'::uuid, now() - interval '25 minutes'),
    ('55555555-5555-4555-8555-000000000004'::uuid, '11111111-1111-4111-8111-000000000002'::uuid,
     'Coca-Cola 330ml Can', -1.000::numeric, 237.000::numeric,
     '22222222-2222-4222-8222-000000000002'::uuid, now() - interval '25 minutes')
) AS v(id, product_id, product_name, quantity_delta, balance_after, reference_id, created_at);

UPDATE products SET stock_quantity = 119.250
    WHERE id = '11111111-1111-4111-8111-000000000001';
UPDATE products SET stock_quantity = 237.000
    WHERE id = '11111111-1111-4111-8111-000000000002';
UPDATE products SET stock_quantity = 57.000
    WHERE id = '11111111-1111-4111-8111-000000000003';

COMMIT;
