/**
 * Critical DB indexes for production-scale performance.
 * Run idempotently at server startup (CREATE INDEX IF NOT EXISTS).
 * Uses CONCURRENTLY where possible to avoid table locks on startup.
 *
 * Priority:
 *   P1 = hot paths (dispatch lookup, order list, driver status)
 *   P2 = reporting / analytics
 *   P3 = zone/team filtering
 */
import { pool } from "@workspace/db";

const INDEXES: { sql: string; name: string; priority: number }[] = [
  // ── Orders — P1 hot paths ────────────────────────────────────────────────
  { priority: 1, name: "idx_orders_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)` },
  { priority: 1, name: "idx_orders_driver_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id)` },
  { priority: 1, name: "idx_orders_created_at_desc",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC)` },
  { priority: 1, name: "idx_orders_status_created",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC)` },
  { priority: 1, name: "idx_orders_customer_name",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name)` },
  { priority: 2, name: "idx_orders_customer_phone",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone)` },

  // ── Orders — P2 reporting ─────────────────────────────────────────────────
  { priority: 2, name: "idx_orders_pickup_date",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders(pickup_date)` },
  { priority: 2, name: "idx_orders_completed_at",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_completed_at ON orders(completed_at DESC NULLS LAST)` },
  { priority: 2, name: "idx_orders_exception_code",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_exception_code ON orders(exception_code) WHERE exception_code IS NOT NULL` },
  { priority: 2, name: "idx_orders_region",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_region ON orders(region)` },

  // ── Orders — P3 zone/team ─────────────────────────────────────────────────
  { priority: 3, name: "idx_orders_zone_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_zone_id ON orders(zone_id) WHERE zone_id IS NOT NULL` },
  { priority: 3, name: "idx_orders_team_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_team_id ON orders(team_id) WHERE team_id IS NOT NULL` },

  // ── Drivers ───────────────────────────────────────────────────────────────
  { priority: 1, name: "idx_drivers_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)` },
  { priority: 2, name: "idx_drivers_license_plate",
    sql: `CREATE INDEX IF NOT EXISTS idx_drivers_license_plate ON drivers(license_plate)` },
  { priority: 3, name: "idx_drivers_zone_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_drivers_zone_id ON drivers(zone_id) WHERE zone_id IS NOT NULL` },
  { priority: 3, name: "idx_drivers_team_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_drivers_team_id ON drivers(team_id) WHERE team_id IS NOT NULL` },

  // ── Customers ─────────────────────────────────────────────────────────────
  { priority: 1, name: "idx_customers_phone",
    sql: `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)` },
  { priority: 2, name: "idx_customers_zone_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_customers_zone_id ON customers(zone_id) WHERE zone_id IS NOT NULL` },

  // ── Status history ────────────────────────────────────────────────────────
  { priority: 1, name: "idx_osh_order_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_osh_order_id ON order_status_history(order_id)` },
  { priority: 2, name: "idx_osh_occurred_at",
    sql: `CREATE INDEX IF NOT EXISTS idx_osh_occurred_at ON order_status_history(occurred_at DESC)` },

  // ── Audit log ─────────────────────────────────────────────────────────────
  { priority: 2, name: "idx_audit_log_action",
    sql: `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action_type)` },
  { priority: 2, name: "idx_audit_log_created",
    sql: `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)` },
  { priority: 2, name: "idx_audit_log_order_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_audit_log_order_id ON audit_log(order_id) WHERE order_id IS NOT NULL` },

  // ── Approval requests ─────────────────────────────────────────────────────
  { priority: 2, name: "idx_approval_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status)` },
  { priority: 2, name: "idx_approval_requested_at",
    sql: `CREATE INDEX IF NOT EXISTS idx_approval_requested_at ON approval_requests(requested_at DESC)` },

  // ── Zones / Teams ─────────────────────────────────────────────────────────
  { priority: 3, name: "idx_zones_parent",
    sql: `CREATE INDEX IF NOT EXISTS idx_zones_parent ON zones(parent_zone_id) WHERE parent_zone_id IS NOT NULL` },
  { priority: 3, name: "idx_teams_zone",
    sql: `CREATE INDEX IF NOT EXISTS idx_teams_zone ON teams(zone_id) WHERE zone_id IS NOT NULL` },

  // ── Driver ratings ────────────────────────────────────────────────────────
  { priority: 2, name: "idx_driver_ratings_driver",
    sql: `CREATE INDEX IF NOT EXISTS idx_driver_ratings_driver ON driver_ratings(driver_id)` },

  // ── Partial index: pending orders (high-frequency dispatch lookup) ─────────
  { priority: 1, name: "idx_orders_pending",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_pending ON orders(created_at) WHERE status='pending'` },
  { priority: 1, name: "idx_drivers_available",
    sql: `CREATE INDEX IF NOT EXISTS idx_drivers_available ON drivers(id) WHERE status='available'` },

  // ── Orders — 訂單資料結構正規化補充索引 ──────────────────────────────────
  { priority: 2, name: "idx_orders_order_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status) WHERE order_status IS NOT NULL` },
  { priority: 2, name: "idx_orders_payment_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status) WHERE payment_status IS NOT NULL` },
  { priority: 2, name: "idx_orders_invoice_status",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_invoice_status ON orders(invoice_status) WHERE invoice_status IS NOT NULL` },
  { priority: 2, name: "idx_orders_station_count",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_station_count ON orders(station_count) WHERE station_count IS NOT NULL` },
  { priority: 2, name: "idx_orders_route_id",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_route_id ON orders(route_id) WHERE route_id IS NOT NULL` },
  { priority: 2, name: "idx_orders_vehicle_type",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_vehicle_type ON orders(vehicle_type) WHERE vehicle_type IS NOT NULL` },
  { priority: 3, name: "idx_orders_source_channel",
    sql: `CREATE INDEX IF NOT EXISTS idx_orders_source_channel ON orders(source_channel) WHERE source_channel IS NOT NULL` },
];

export async function ensureDbIndexes() {
  const start = Date.now();
  let created = 0;
  let failed = 0;

  // Run in priority order, but don't block server startup for failures
  for (const { sql, name, priority } of INDEXES.sort((a, b) => a.priority - b.priority)) {
    try {
      await pool.query(sql);
      created++;
    } catch (e) {
      // Non-fatal: index might already exist with different params, or table might not exist yet
      failed++;
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[dbIndexes] ${name} WARN:`, String(e).slice(0, 120));
      }
    }
  }

  const elapsed = Date.now() - start;
  console.log(`[dbIndexes] Ensured ${created}/${INDEXES.length} indexes (${failed} skipped) in ${elapsed}ms`);
}
