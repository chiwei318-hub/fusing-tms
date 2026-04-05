-- Production migration: add structured route columns to orders table
-- Run once on production database after deploying the new code

-- 1. Add new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_city text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_district text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_district text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gross_weight real;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qty integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_prefix text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS station_count integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopee_driver_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatch_dock text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_id integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_amount real;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_amount real;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_amount real;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT 'none';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_channel text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quick_order_token_key text;

-- 2. Backfill from notes field
UPDATE orders
SET
  route_id         = COALESCE(route_id,       (regexp_match(notes, '路線：([^｜\s]+)'))[1]),
  route_prefix     = COALESCE(route_prefix,   (regexp_match(notes, '路線：([A-Z0-9]+)-'))[1]),
  station_count    = COALESCE(station_count,
                      CASE WHEN (regexp_match(notes, '共 ([0-9]+) 站'))[1] IS NOT NULL
                           THEN ((regexp_match(notes, '共 ([0-9]+) 站'))[1])::integer
                           ELSE NULL END),
  shopee_driver_id = COALESCE(shopee_driver_id, (regexp_match(notes, '司機ID：([0-9]+)'))[1]),
  dispatch_dock    = COALESCE(dispatch_dock,   (regexp_match(notes, '碼頭：([^｜\s]+)'))[1])
WHERE notes LIKE '路線：%'
  AND (route_id IS NULL OR route_prefix IS NULL OR shopee_driver_id IS NULL);

-- 3. Add indexes
CREATE INDEX IF NOT EXISTS idx_orders_route_id       ON orders(route_id);
CREATE INDEX IF NOT EXISTS idx_orders_route_prefix   ON orders(route_prefix);
CREATE INDEX IF NOT EXISTS idx_orders_shopee_driver  ON orders(shopee_driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id      ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_fleet_id       ON orders(fleet_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token_key ON orders(quick_order_token_key) WHERE quick_order_token_key IS NOT NULL;

-- Done.
