import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

function hashPw(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

export const fusingaoRouter = Router();

// ── DB Migration: add new columns to fusingao_fleets if absent ───────────────
async function ensureFusingaoFleetColumns() {
  const alterStatements = [
    sql`ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 15`,
    sql`ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS bank_name TEXT`,
    sql`ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS bank_account TEXT`,
  ];
  for (const stmt of alterStatements) {
    try { await db.execute(stmt); } catch { /* ignore */ }
  }
  // Route prefix rates table (route → rate per trip)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS route_prefix_rates (
      id          SERIAL PRIMARY KEY,
      prefix      TEXT NOT NULL UNIQUE,
      rate_per_trip NUMERIC(10,2) NOT NULL DEFAULT 0,
      note        TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Ensure fusingao fleet columns on orders (fleet grab/complete tracking)
  const fleetOrderCols = [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fusingao_fleet_id INTEGER`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_grabbed_at TIMESTAMPTZ`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_completed_at TIMESTAMPTZ`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_driver_id INTEGER`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_driver_name TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_vehicle_plate TEXT`,
  ];
  // Add extra columns to fleet_drivers if not exists
  try {
    await db.execute(sql.raw(`ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS atoms_account TEXT`));
    await db.execute(sql.raw(`ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS atoms_password TEXT`));
    await db.execute(sql.raw(`ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS employee_id TEXT`));
  } catch { /* already exists */ }
  for (const s of fleetOrderCols) {
    try { await db.execute(sql.raw(s)); } catch { /* already exists */ }
  }
  // Fleet settlement adjustments table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_fleet_adjustments (
      id            SERIAL PRIMARY KEY,
      fleet_id      INTEGER NOT NULL,
      month         VARCHAR(7) NOT NULL,
      extra_deduct_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
      fuel_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
      other_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
      other_label        TEXT,
      note               TEXT,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(fleet_id, month)
    )
  `);
  // Fleet report tokens table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_report_tokens (
      id         SERIAL PRIMARY KEY,
      fleet_id   INTEGER NOT NULL,
      month      VARCHAR(7) NOT NULL,
      token      VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      UNIQUE(fleet_id, month)
    )
  `);
  // Order events timeline table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_order_events (
      id          SERIAL PRIMARY KEY,
      order_id    INTEGER NOT NULL,
      event_type  TEXT NOT NULL DEFAULT 'note',
      note        TEXT,
      created_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON fusingao_order_events(order_id)
  `);
  // Backfill: create 'created' event for orders that have none
  await db.execute(sql`
    INSERT INTO fusingao_order_events (order_id, event_type, note, created_by, created_at)
    SELECT o.id, 'created',
      CASE WHEN o.customer_name IS NOT NULL THEN '訂單建立：' || o.customer_name ELSE '訂單建立' END,
      COALESCE(o.operator_name, '系統'),
      COALESCE(o.created_at, NOW())
    FROM orders o
    WHERE NOT EXISTS (
      SELECT 1 FROM fusingao_order_events e WHERE e.order_id = o.id
    )
  `);
  // Manual orders: extra columns for TMS-style management
  const orderExtraCols = [
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_contact_name  TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_contact_phone TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_contact_name  TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_contact_phone TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_name   TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_qty    INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_weight NUMERIC(10,2)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_volume NUMERIC(10,3)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_date DATE",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS operator_name TEXT",
  ];
  for (const s of orderExtraCols) {
    try { await db.execute(sql.raw(s)); } catch { /* already exists */ }
  }
}
ensureFusingaoFleetColumns().catch(console.error);

// ── helper: parse a Shopee route note (LEGACY FALLBACK — only for old rows
//    that predate the proper column migration; new rows set columns directly) ─
function parseNote(notes: string | null | undefined) {
  if (!notes) return { routeId: null, dock: null, driverId: null, stations: 0, prefix: null, stopList: [] };
  const routeId  = (notes.match(/路線：([^｜\s]+)/))?.[1] ?? null;
  const dock     = (notes.match(/碼頭：([^｜\s]+)/))?.[1] ?? null;
  const driverId = (notes.match(/司機ID：([0-9]+|—)/))?.[1] ?? null;
  const stations = (notes.match(/共 ([0-9]+) 站/))?.[1] ?? null;
  const prefix   = routeId ? (routeId.match(/^([A-Z0-9]+)-/))?.[1] ?? null : null;
  const stopList = (notes.match(/（(.+)）/s))?.[1]
    ?.split("→").map(s => s.trim()) ?? [];
  return { routeId, dock, driverId, stations: stations ? Number(stations) : stopList.length, prefix, stopList };
}

// ── helper: map DB columns to the same shape parseNote returns ────────────
function fromColumns(r: {
  route_id?: string | null;
  route_prefix?: string | null;
  station_count?: number | null;
  dispatch_dock?: string | null;
  shopee_driver_id?: string | null;
  notes?: string | null;
}) {
  // If proper columns are present, use them directly; otherwise fall back to notes parsing
  if (r.route_id != null) {
    return {
      routeId:  r.route_id,
      prefix:   r.route_prefix ?? null,
      stations: r.station_count ?? 0,
      dock:     r.dispatch_dock ?? null,
      driverId: r.shopee_driver_id ?? null,
      stopList: [],   // stop list only lives in notes (legacy display); not needed for billing/reports
    };
  }
  return parseNote(r.notes);
}

// GET /fusingao/summary
fusingaoRouter.get("/summary", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)                                                      AS total_routes,
        COUNT(CASE WHEN status='completed' OR completed_at IS NOT NULL THEN 1 END) AS completed,
        COUNT(CASE WHEN (status='pending' OR status='dispatched') AND completed_at IS NULL THEN 1 END) AS in_progress,
        COUNT(CASE WHEN driver_payment_status='paid' THEN 1 END)       AS billed,
        COUNT(CASE WHEN driver_payment_status<>'paid' OR driver_payment_status IS NULL THEN 1 END) AS unbilled,
        -- this month
        COUNT(CASE WHEN date_trunc('month', created_at)=date_trunc('month', NOW()) THEN 1 END) AS this_month_routes,
        -- last month
        COUNT(CASE WHEN date_trunc('month', created_at)=date_trunc('month', NOW()-interval '1 month') THEN 1 END) AS last_month_routes,
        -- total Shopee income (all time) — from billing_trips if available, fallback to prefix_rates
        COALESCE((
          SELECT COALESCE(
            NULLIF((SELECT SUM(amount::numeric) FROM fusingao_billing_trips WHERE billing_month ~ '^\d{4}-(0[1-9]|1[0-2])$'), 0),
            (SELECT SUM(pr.rate_per_trip) FROM orders o2 JOIN route_prefix_rates pr ON pr.prefix=o2.route_prefix WHERE o2.route_id IS NOT NULL)
          )
        ),0) AS total_shopee_income,
        -- this month income — from billing_trips if available, fallback to prefix_rates
        COALESCE((
          SELECT COALESCE(
            NULLIF((
              SELECT SUM(amount::numeric) FROM fusingao_billing_trips
              WHERE billing_month = to_char(NOW(),'YYYY-MM')
            ), 0),
            (SELECT SUM(pr.rate_per_trip) FROM orders o2
             JOIN route_prefix_rates pr ON pr.prefix=o2.route_prefix
             WHERE o2.route_id IS NOT NULL AND date_trunc('month',o2.created_at)=date_trunc('month',NOW()))
          )
        ),0) AS this_month_income
      FROM orders
      WHERE route_id IS NOT NULL
    `);
    res.json({ ok: true, summary: rows.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/routes?month=2026-04&status=all
fusingaoRouter.get("/routes", async (req, res) => {
  try {
    const { month, status } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    if (status === "completed")   extra += ` AND (o.status='completed' OR o.completed_at IS NOT NULL)`;
    if (status === "in_progress") extra += ` AND o.status NOT IN ('completed') AND o.completed_at IS NULL`;
    if (status === "unbilled")    extra += ` AND (o.driver_payment_status<>'paid' OR o.driver_payment_status IS NULL)`;

    const rows = await db.execute(sql`
      SELECT
        o.id,
        o.status,
        o.notes,
        o.completed_at,
        o.required_vehicle_type,
        o.vehicle_type,
        o.driver_payment_status,
        o.created_at,
        o.arrival_notified_at,
        o.route_id,
        o.route_prefix,
        o.station_count,
        o.dispatch_dock,
        o.shopee_driver_id,
        sd.name     AS driver_name,
        sd.vehicle_plate,
        pr.rate_per_trip  AS shopee_rate,
        pr.service_type,
        pr.route_od
      FROM orders o
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = o.shopee_driver_id
      WHERE o.route_id IS NOT NULL
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);

    const routes = (rows.rows as any[]).map(r => ({
      ...r,
      ...fromColumns(r),
    }));
    res.json({ ok: true, routes });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/monthly  — monthly reconciliation
fusingaoRouter.get("/monthly", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      WITH route_months AS (
        SELECT
          to_char(o.created_at,'YYYY-MM')               AS month,
          to_char(o.created_at,'YYYY年MM月')             AS month_label,
          COUNT(*)                                       AS route_count,
          COUNT(CASE WHEN o.status='completed' OR o.completed_at IS NOT NULL THEN 1 END) AS completed_count,
          COUNT(CASE WHEN o.driver_payment_status='paid' THEN 1 END) AS billed_count,
          COALESCE(SUM(pr.rate_per_trip),0)              AS shopee_income,
          COALESCE(SUM(CASE WHEN o.driver_payment_status='paid' THEN pr.rate_per_trip ELSE 0 END),0) AS billed_amount,
          COALESCE(SUM(CASE WHEN o.driver_payment_status<>'paid' OR o.driver_payment_status IS NULL THEN pr.rate_per_trip ELSE 0 END),0) AS unbilled_amount
        FROM orders o
        LEFT JOIN route_prefix_rates pr
          ON pr.prefix = o.route_prefix
        WHERE o.route_id IS NOT NULL
        GROUP BY to_char(o.created_at,'YYYY-MM'), to_char(o.created_at,'YYYY年MM月')
      ),
      penalty_months AS (
        SELECT
          LEFT(incident_date, 7)       AS month,
          COALESCE(SUM(fine_amount),0) AS penalty_deduction
        FROM shopee_penalties
        WHERE source = 'NDD過刷異常' AND fine_amount > 0
        GROUP BY LEFT(incident_date, 7)
      )
      SELECT
        rm.*,
        COALESCE(pm.penalty_deduction, 0) AS penalty_deduction
      FROM route_months rm
      LEFT JOIN penalty_months pm ON pm.month = rm.month
      ORDER BY rm.month DESC
    `);

    // For each month, also fetch route list
    const months = rows.rows as any[];
    const enriched = await Promise.all(months.map(async m => {
      const detail = await db.execute(sql`
        SELECT
          o.id, o.status, o.notes, o.completed_at, o.driver_payment_status,
          o.created_at, o.required_vehicle_type, o.vehicle_type,
          o.route_id, o.route_prefix, o.station_count, o.dispatch_dock, o.shopee_driver_id,
          sd.name AS driver_name, sd.vehicle_plate,
          pr.rate_per_trip AS shopee_rate,
          pr.service_type
        FROM orders o
        LEFT JOIN route_prefix_rates pr
          ON pr.prefix = o.route_prefix
        LEFT JOIN shopee_drivers sd
          ON sd.shopee_id = o.shopee_driver_id
        WHERE o.route_id IS NOT NULL
          AND to_char(o.created_at,'YYYY-MM') = ${m.month}
        ORDER BY o.created_at ASC
      `);
      return {
        ...m,
        net_amount: Number(m.shopee_income) - Number(m.penalty_deduction),
        routes: (detail.rows as any[]).map(r => ({ ...r, ...fromColumns(r) })),
      };
    }));

    res.json({ ok: true, months: enriched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/complete — mark a route as completed
fusingaoRouter.put("/routes/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body as { completed: boolean };
    if (completed) {
      await db.execute(sql`
        UPDATE orders SET status='completed', completed_at=NOW(), updated_at=NOW()
        WHERE id=${Number(id)} AND route_id IS NOT NULL
      `);
    } else {
      await db.execute(sql`
        UPDATE orders SET status='pending', completed_at=NULL, updated_at=NOW()
        WHERE id=${Number(id)} AND route_id IS NOT NULL
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/billing — mark billing status
fusingaoRouter.put("/routes/:id/billing", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    await db.execute(sql`
      UPDATE orders SET driver_payment_status=${status}, updated_at=NOW()
      WHERE id=${Number(id)} AND route_id IS NOT NULL
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/monthly/:month/bill-all — mark all in a month as billed
fusingaoRouter.put("/monthly/:month/bill-all", async (req, res) => {
  try {
    const { month } = req.params;
    await db.execute(sql`
      UPDATE orders SET driver_payment_status='paid', updated_at=NOW()
      WHERE route_id IS NOT NULL
        AND to_char(created_at,'YYYY-MM') = ${month}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  FLEET MANAGEMENT (admin creates / manages sub-contractor fleet accounts)
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/fleets
fusingaoRouter.get("/fleets", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        f.id, f.fleet_name, f.contact_name, f.contact_phone, f.username,
        f.vehicle_types, f.notes, f.is_active, f.created_at,
        f.commission_rate, f.bank_name, f.bank_account, f.rate_override,
        COUNT(o.id)                                               AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL) AS completed_routes,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status = 'paid')  AS billed_routes,
        COALESCE(SUM(pr.rate_per_trip),0)                            AS total_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip)),0) AS fleet_payout
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.route_id IS NOT NULL
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      GROUP BY f.id
      ORDER BY f.fleet_name
    `);
    res.json({ ok: true, fleets: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets — create fleet account
fusingaoRouter.post("/fleets", async (req, res) => {
  try {
    const { fleet_name, contact_name, contact_phone, username, password, vehicle_types, notes, rate_override, commission_rate, bank_name, bank_account } = req.body;
    if (!fleet_name || !username || !password)
      return res.status(400).json({ ok: false, error: "車隊名稱、帳號、密碼為必填" });
    const hashed = hashPw(password);
    const [result] = await db.execute(sql`
      INSERT INTO fusingao_fleets (fleet_name, contact_name, contact_phone, username, password, vehicle_types, notes, rate_override, commission_rate, bank_name, bank_account)
      VALUES (${fleet_name}, ${contact_name ?? null}, ${contact_phone ?? null}, ${username}, ${hashed}, ${vehicle_types ?? null}, ${notes ?? null}, ${rate_override ?? null}, ${commission_rate ?? 15}, ${bank_name ?? null}, ${bank_account ?? null})
      RETURNING id, fleet_name, username, contact_name, contact_phone
    `).then(r => r.rows as any[]);
    res.json({ ok: true, fleet: result });
  } catch (err: any) {
    if (err.message?.includes("unique")) return res.status(409).json({ ok: false, error: "帳號已存在" });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id — update fleet
fusingaoRouter.put("/fleets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleet_name, contact_name, contact_phone, vehicle_types, notes, is_active, rate_override, password, commission_rate, bank_name, bank_account } = req.body;
    const pwUpdate = password ? sql`, password=${hashPw(password)}` : sql``;
    await db.execute(sql`
      UPDATE fusingao_fleets SET
        fleet_name      = ${fleet_name},
        contact_name    = ${contact_name ?? null},
        contact_phone   = ${contact_phone ?? null},
        vehicle_types   = ${vehicle_types ?? null},
        notes           = ${notes ?? null},
        is_active       = ${is_active ?? true},
        rate_override   = ${rate_override ?? null},
        commission_rate = ${commission_rate ?? 15},
        bank_name       = ${bank_name ?? null},
        bank_account    = ${bank_account ?? null},
        updated_at      = NOW()
        ${pwUpdate}
      WHERE id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/routes — routes grabbed by this fleet
fusingaoRouter.get("/fleets/:id/routes", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    const rows = await db.execute(sql`
      SELECT
        o.id, o.status, o.notes, o.completed_at, o.driver_payment_status,
        o.created_at, o.fleet_grabbed_at, o.fleet_completed_at,
        o.route_id, o.route_prefix, o.station_count, o.dispatch_dock, o.shopee_driver_id,
        o.fleet_driver_id, o.fleet_driver_name, o.fleet_vehicle_plate,
        sd.name AS driver_name,
        COALESCE(o.fleet_vehicle_plate, sd.vehicle_plate) AS vehicle_plate,
        pr.rate_per_trip AS shopee_rate,
        COALESCE(f.rate_override, pr.rate_per_trip) AS fleet_rate,
        pr.service_type
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = o.shopee_driver_id
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${Number(id)}
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);
    res.json({ ok: true, routes: (rows.rows as any[]).map(r => ({ ...r, ...fromColumns(r) })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/monthly — per-fleet monthly billing
fusingaoRouter.get("/fleets/:id/monthly", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.execute(sql`
      SELECT
        to_char(o.created_at,'YYYY-MM')    AS month,
        to_char(o.created_at,'YYYY年MM月') AS month_label,
        COUNT(*)                           AS route_count,
        COUNT(o.fleet_completed_at)        AS completed_count,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status='paid') AS billed_count,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip)), 0) AS fleet_payout,
        COALESCE(SUM(CASE WHEN o.driver_payment_status='paid' THEN COALESCE(f.rate_override, pr.rate_per_trip) ELSE 0 END), 0) AS billed_amount
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${Number(id)}
      GROUP BY 1, 2 ORDER BY 1 DESC
    `);
    res.json({ ok: true, months: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  FLEET GRAB SYSTEM
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/available — ungrabbed routes visible to all fleets
fusingaoRouter.get("/available", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    const rows = await db.execute(sql`
      SELECT
        o.id, o.status, o.notes, o.created_at,
        o.route_id, o.route_prefix, o.station_count, o.dispatch_dock, o.shopee_driver_id,
        pr.rate_per_trip AS shopee_rate, pr.service_type, pr.route_od,
        sd.name AS driver_name, sd.vehicle_plate
      FROM orders o
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = o.shopee_driver_id
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id IS NULL
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);
    res.json({ ok: true, routes: (rows.rows as any[]).map(r => ({ ...r, ...fromColumns(r) })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/routes/:id/grab — fleet grabs a route (with optional driver assignment)
fusingaoRouter.post("/routes/:id/grab", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId, driverId, driverName, vehiclePlate } = req.body as {
      fleetId: number;
      driverId?: number | null;
      driverName?: string | null;
      vehiclePlate?: string | null;
    };
    if (!fleetId) return res.status(400).json({ ok: false, error: "缺少 fleetId" });

    // Look up driver's atoms_account and phone if driverId provided
    let resolvedName = driverName ?? null;
    let resolvedPhone: string | null = null;
    let atomsAccount: string | null = null;
    if (driverId) {
      const dRow = await db.execute(sql`
        SELECT name, phone, atoms_account FROM fleet_drivers WHERE id = ${driverId}
      `).then(r => (r.rows as any[])[0]);
      if (dRow) {
        resolvedName  = resolvedName  ?? dRow.name;
        resolvedPhone = dRow.phone ?? null;
        atomsAccount  = dRow.atoms_account ?? null;
      }
    }

    // Atomic grab: only succeed if not already grabbed
    const result = await db.execute(sql`
      UPDATE orders SET
        fusingao_fleet_id   = ${fleetId},
        fleet_grabbed_at    = NOW(),
        fleet_driver_id     = ${driverId ?? null},
        fleet_driver_name   = ${resolvedName ?? null},
        fleet_vehicle_plate = ${vehiclePlate ?? null},
        updated_at          = NOW()
      WHERE id = ${Number(id)}
        AND route_id IS NOT NULL
        AND fusingao_fleet_id IS NULL
      RETURNING id
    `);
    if ((result.rows as any[]).length === 0)
      return res.status(409).json({ ok: false, error: "路線已被搶走，請選擇其他路線" });

    // Auto-push to ATOMS when driver is assigned
    let atomsResult: any = { skipped: true };
    if (driverId && (atomsAccount || resolvedName)) {
      atomsResult = await pushFleetRouteToAtoms(Number(id), resolvedName, resolvedPhone, atomsAccount);
    }
    res.json({ ok: true, atoms: atomsResult });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /fusingao/routes/:id/grab — release a grabbed route
fusingaoRouter.delete("/routes/:id/grab", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId } = req.body as { fleetId: number };
    await db.execute(sql`
      UPDATE orders SET
        fusingao_fleet_id = NULL,
        fleet_grabbed_at  = NULL,
        updated_at        = NOW()
      WHERE id = ${Number(id)} AND fusingao_fleet_id = ${fleetId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/fleet-complete — fleet marks route as completed
fusingaoRouter.put("/routes/:id/fleet-complete", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId, completed } = req.body as { fleetId: number; completed: boolean };
    if (completed) {
      await db.execute(sql`
        UPDATE orders SET fleet_completed_at=NOW(), status='completed', completed_at=NOW(), updated_at=NOW()
        WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
      `);
    } else {
      await db.execute(sql`
        UPDATE orders SET fleet_completed_at=NULL, status='pending', completed_at=NULL, updated_at=NOW()
        WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id/monthly/:month/bill-all
fusingaoRouter.put("/fleets/:id/monthly/:month/bill-all", async (req, res) => {
  try {
    const { id, month } = req.params;
    await db.execute(sql`
      UPDATE orders SET driver_payment_status='paid', updated_at=NOW()
      WHERE route_id IS NOT NULL
        AND fusingao_fleet_id = ${Number(id)}
        AND to_char(created_at,'YYYY-MM') = ${month}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  FLEET DRIVER MANAGEMENT (Layer 3 → Layer 4: fleet manages its own drivers)
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/fleets/:id/drivers
fusingaoRouter.get("/fleets/:id/drivers", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.execute(sql`
      SELECT
        fd.id, fd.fleet_id, fd.name, fd.phone, fd.id_number, fd.vehicle_plate,
        fd.vehicle_type, fd.line_id, fd.notes, fd.is_active, fd.created_at, fd.updated_at,
        fd.atoms_account, fd.employee_id,
        COUNT(o.id)                                                  AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL)  AS completed_routes,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip) * (1 - COALESCE(f.commission_rate,15)/100.0)), 0) AS total_earnings
      FROM fleet_drivers fd
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN orders o ON o.fleet_driver_id = fd.id
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      WHERE fd.fleet_id = ${Number(id)}
      GROUP BY fd.id, fd.fleet_id, fd.name, fd.phone, fd.id_number, fd.vehicle_plate,
               fd.vehicle_type, fd.line_id, fd.notes, fd.is_active, fd.created_at, fd.updated_at,
               fd.atoms_account, fd.employee_id
      ORDER BY fd.is_active DESC, fd.employee_id NULLS LAST, fd.name
    `);
    res.json({ ok: true, drivers: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Helper: push a single route to ATOMS after fleet assigns a driver ──────
async function pushFleetRouteToAtoms(orderId: number, driverName: string | null, driverPhone: string | null, atomsAccount: string | null) {
  const atomsUrl = process.env.ATOMS_WEBHOOK_URL;
  if (!atomsUrl) return { ok: false, skipped: true, reason: "ATOMS_WEBHOOK_URL 未設定" };
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.order_no, o.route_id, o.station_count, o.dispatch_dock,
             o.notes, o.created_at, pr.service_type
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.id = ${orderId}
    `);
    const o = (rows.rows as any[])[0];
    if (!o) return { ok: false, reason: "訂單不存在" };
    const callbackBase = process.env.ATOMS_CALLBACK_BASE_URL || process.env.APP_BASE_URL || "";
    const callbackUrl  = `${callbackBase}/api/v1/webhook/atoms-accept`;
    const now = new Date().toISOString();
    const payload = {
      event:        "order.assigned",
      timestamp:    now,
      callback_url: callbackUrl,
      data: {
        order_id:      o.id,
        order_no:      o.order_no,
        route_id:      o.route_id,
        station_count: o.station_count,
        dock:          o.dispatch_dock,
        notes:         o.notes,
        service_type:  o.service_type,
        driver_name:   driverName,
        driver_phone:  driverPhone,
        atoms_account: atomsAccount,
        broadcast_at:  now,
        callback_url:  callbackUrl,
      },
    };
    const r = await fetch(atomsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      await db.execute(sql`
        UPDATE orders SET atoms_synced_at = NOW(), updated_at = NOW()
        WHERE id = ${orderId} AND atoms_synced_at IS NULL
      `);
    }
    return { ok: r.ok, statusCode: r.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// POST /fusingao/fleets/:id/drivers
fusingaoRouter.post("/fleets/:id/drivers", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes, atoms_account, atoms_password, employee_id } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "司機姓名為必填" });
    const [row] = await db.execute(sql`
      INSERT INTO fleet_drivers (fleet_id, name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes, atoms_account, atoms_password, employee_id)
      VALUES (${Number(id)}, ${name}, ${phone??null}, ${id_number??null}, ${vehicle_plate??null}, ${vehicle_type??"一般"}, ${line_id??null}, ${notes??null}, ${atoms_account??null}, ${atoms_password??null}, ${employee_id??null})
      RETURNING *
    `).then(r => r.rows as any[]);
    res.json({ ok: true, driver: row });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/schedule-driver-suggestions
// 從班表取得未匯入的蝦皮司機工號清單
fusingaoRouter.get("/fleets/:id/schedule-driver-suggestions", async (req, res) => {
  try {
    const { id } = req.params;
    // Get all existing employee_ids for this fleet
    const existing = await pool.query(
      `SELECT COALESCE(employee_id, '') AS eid FROM fleet_drivers WHERE fleet_id = $1 AND employee_id IS NOT NULL AND employee_id <> ''`,
      [Number(id)]
    );
    const existingIds = new Set(existing.rows.map((r: any) => r.eid));

    // Get distinct shopee_driver_id from schedule, with most common vehicle_type
    const result = await pool.query(`
      SELECT
        shopee_driver_id,
        MODE() WITHIN GROUP (ORDER BY vehicle_type) AS vehicle_type,
        COUNT(*) AS route_count
      FROM shopee_week_routes
      WHERE shopee_driver_id IS NOT NULL AND shopee_driver_id <> ''
      GROUP BY shopee_driver_id
      ORDER BY shopee_driver_id
    `);

    const suggestions = result.rows.filter((r: any) => !existingIds.has(r.shopee_driver_id));
    res.json({ ok: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets/:id/import-schedule-drivers
// 批量從班表匯入司機（以蝦皮工號為 employee_id）
fusingaoRouter.post("/fleets/:id/import-schedule-drivers", async (req, res) => {
  try {
    const { id } = req.params;
    const { drivers } = req.body as { drivers: { shopee_driver_id: string; name: string; vehicle_type: string }[] };
    if (!Array.isArray(drivers) || drivers.length === 0) {
      return res.status(400).json({ ok: false, error: "未提供司機資料" });
    }
    const inserted: any[] = [];
    for (const d of drivers) {
      // Skip if already exists
      const dup = await pool.query(
        `SELECT id FROM fleet_drivers WHERE fleet_id=$1 AND employee_id=$2 LIMIT 1`,
        [Number(id), d.shopee_driver_id]
      );
      if (dup.rows.length > 0) continue;
      const r = await pool.query(
        `INSERT INTO fleet_drivers (fleet_id, name, vehicle_type, employee_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [Number(id), d.name || d.shopee_driver_id, d.vehicle_type || "一般", d.shopee_driver_id]
      );
      inserted.push(r.rows[0]);
    }
    res.json({ ok: true, inserted: inserted.length, drivers: inserted });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id/drivers/:driverId
fusingaoRouter.put("/fleets/:id/drivers/:driverId", async (req, res) => {
  try {
    const { id, driverId } = req.params;
    const { name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes, is_active, atoms_account, atoms_password, employee_id } = req.body;
    await db.execute(sql`
      UPDATE fleet_drivers SET
        name           = ${name},
        phone          = ${phone??null},
        id_number      = ${id_number??null},
        vehicle_plate  = ${vehicle_plate??null},
        vehicle_type   = ${vehicle_type??"一般"},
        line_id        = ${line_id??null},
        notes          = ${notes??null},
        is_active      = ${is_active??true},
        atoms_account  = ${atoms_account??null},
        atoms_password = ${atoms_password??null},
        employee_id    = ${employee_id??null},
        updated_at     = NOW()
      WHERE id = ${Number(driverId)} AND fleet_id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/assign-driver — fleet assigns route to one of its drivers
fusingaoRouter.put("/routes/:id/assign-driver", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId, driverId } = req.body as { fleetId: number; driverId: number | null };
    await db.execute(sql`
      UPDATE orders SET fleet_driver_id=${driverId??null}, updated_at=NOW()
      WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
    `);
    // Auto-push to ATOMS when driver is assigned
    let atomsResult: any = { skipped: true };
    if (driverId) {
      const dRow = await db.execute(sql`
        SELECT name, phone, atoms_account FROM fleet_drivers WHERE id = ${driverId}
      `).then(r => (r.rows as any[])[0]);
      if (dRow && (dRow.atoms_account || dRow.name)) {
        atomsResult = await pushFleetRouteToAtoms(Number(id), dRow.name, dRow.phone ?? null, dRow.atoms_account ?? null);
      }
    }
    res.json({ ok: true, atoms: atomsResult });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  DISPATCH MANAGEMENT  — weekly route × driver grid
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/dispatch?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
fusingaoRouter.get("/dispatch", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;
    // Default: current week Mon–Sun in Taiwan time (UTC+8)
    const nowTW = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const dowTW = nowTW.getUTCDay() === 0 ? 6 : nowTW.getUTCDay() - 1; // Mon=0
    const monTW = new Date(nowTW); monTW.setUTCDate(nowTW.getUTCDate() - dowTW);
    const sunTW = new Date(monTW); sunTW.setUTCDate(monTW.getUTCDate() + 6);
    const start = startDate ?? monTW.toISOString().slice(0, 10);
    const end   = endDate   ?? sunTW.toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      SELECT
        o.id,
        o.route_id  AS route_id,
        o.route_prefix        AS prefix,
        o.station_count      AS stations,
        o.dispatch_driver_code,
        o.fusingao_fleet_id,
        f.fleet_name,
        o.fleet_completed_at,
        o.completed_at,
        (o.created_at AT TIME ZONE 'Asia/Taipei')::date        AS dispatch_date
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      WHERE o.route_id IS NOT NULL
        AND (o.created_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN ${start}::date AND ${end}::date
      ORDER BY (o.created_at AT TIME ZONE 'Asia/Taipei')::date, route_id
    `).then(r => r.rows as any[]);

    // Build grid: route_id → date → entry
    const routeMap = new Map<string, any>();
    for (const r of rows) {
      if (!r.route_id) continue;
      if (!routeMap.has(r.route_id)) {
        routeMap.set(r.route_id, { route_id: r.route_id, prefix: r.prefix, stations: r.stations, dates: {} });
      }
      routeMap.get(r.route_id).dates[r.dispatch_date] = {
        order_id: r.id,
        dispatch_driver_code: r.dispatch_driver_code,
        fleet_name: r.fleet_name,
        done: !!(r.fleet_completed_at || r.completed_at),
      };
    }

    // Build date range array
    const dates: string[] = [];
    const cur = new Date(start);
    const endD = new Date(end);
    while (cur <= endD) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

    res.json({ ok: true, dates, routes: Array.from(routeMap.values()), range: { start, end } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/dispatch-code
fusingaoRouter.put("/routes/:id/dispatch-code", async (req, res) => {
  try {
    const { id } = req.params;
    const { dispatch_driver_code } = req.body as { dispatch_driver_code: string };
    await db.execute(sql`
      UPDATE orders SET dispatch_driver_code = ${dispatch_driver_code ?? null}
      WHERE id = ${Number(id)} AND route_id IS NOT NULL
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/assign-fleet  — admin assigns fleet to a route order
fusingaoRouter.put("/routes/:id/assign-fleet", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleet_id } = req.body as { fleet_id: number | null };
    await db.execute(sql`
      UPDATE orders SET fusingao_fleet_id = ${fleet_id ?? null}
      WHERE id = ${Number(id)} AND route_id IS NOT NULL
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/batch-assign — assign multiple routes to a fleet at once
fusingaoRouter.put("/routes/batch-assign", async (req, res) => {
  try {
    const { order_ids, fleet_id } = req.body as { order_ids: number[]; fleet_id: number | null };
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ ok: false, error: "order_ids 必須為非空陣列" });
    }
    const ids = order_ids.map(Number).filter(n => !isNaN(n));
    const fleetVal = fleet_id != null ? String(Number(fleet_id)) : "NULL";
    const idList = ids.join(",");
    await db.execute(sql.raw(`
      UPDATE orders
      SET fusingao_fleet_id = ${fleetVal}
      WHERE id IN (${idList}) AND route_id IS NOT NULL
    `));
    res.json({ ok: true, updated: ids.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/accounting-package?month=YYYY-MM — all-in-one accounting export data
// Returns: routes, billing trips, fleet payouts, tax data for the month
fusingaoRouter.get("/accounting-package", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    if (!month) return res.status(400).json({ ok: false, error: "month 必填" });

    // 1. Route-level data from orders
    const routeRows = await db.execute(sql`
      SELECT
        o.id, o.route_id, o.route_prefix,
        o.station_count, o.status, o.completed_at, o.fleet_completed_at,
        o.driver_payment_status, o.created_at,
        pr.rate_per_trip AS shopee_rate, pr.service_type,
        f.fleet_name, f.commission_rate,
        COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0)) AS fleet_payout,
        sd.name AS driver_name, sd.vehicle_plate
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      LEFT JOIN shopee_drivers sd ON sd.shopee_id = o.shopee_driver_id
      WHERE o.route_id IS NOT NULL
        AND to_char(o.created_at, 'YYYY-MM') = ${month}
      ORDER BY o.created_at ASC
    `);

    // 2. Billing trips for the month (actual billed data from Shopee sheets)
    const billingRows = await db.execute(sql`
      SELECT
        billing_month, billing_type, route_no, vehicle_size,
        driver_id, trip_date, amount
      FROM fusingao_billing_trips
      WHERE billing_month = ${month}
      ORDER BY trip_date ASC, billing_type ASC
    `);

    // 3. Fleet settlement summary
    const fleetSummary = await db.execute(sql`
      WITH billing AS (
        SELECT route_no, COALESCE(SUM(amount::numeric), 0) AS income
        FROM fusingao_billing_trips
        WHERE billing_month = ${month}
        GROUP BY route_no
      ),
      route_fleet AS (
        SELECT DISTINCT ON (route_id) route_id, fusingao_fleet_id
        FROM orders WHERE route_id IS NOT NULL
        ORDER BY route_id, created_at DESC
      )
      SELECT
        f.id AS fleet_id, f.fleet_name, f.commission_rate,
        f.bank_name, f.bank_account, f.contact_name, f.contact_phone,
        COALESCE(SUM(b.income), 0)                                                           AS shopee_income,
        COALESCE(SUM(b.income * (1 - COALESCE(f.commission_rate,15)::numeric / 100.0)), 0)  AS fleet_payout,
        COALESCE(SUM(b.income * COALESCE(f.commission_rate,15)::numeric / 100.0), 0)        AS commission,
        COUNT(DISTINCT b.route_no)                                                           AS route_count
      FROM billing b
      LEFT JOIN route_fleet rf ON rf.route_id = b.route_no
      LEFT JOIN fusingao_fleets f ON f.id = rf.fusingao_fleet_id
      WHERE f.id IS NOT NULL
      GROUP BY f.id, f.fleet_name, f.commission_rate, f.bank_name, f.bank_account, f.contact_name, f.contact_phone
      ORDER BY fleet_payout DESC
    `);

    // 4. Shopee penalties for this month
    const penalties = await db.execute(sql`
      SELECT incident_date, store_name, violation_type, fine_amount
      FROM shopee_penalties
      WHERE LEFT(incident_date, 7) = ${month} AND fine_amount > 0
      ORDER BY incident_date ASC
    `);

    // 5. Tax computation (Taiwan 5% business tax)
    const totalBilling = (billingRows.rows as any[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalPrefixRate = (routeRows.rows as any[]).reduce((s, r) => s + Number(r.shopee_rate ?? 0), 0);
    const totalIncome = totalBilling > 0 ? totalBilling : totalPrefixRate;
    const totalPenalty = (penalties.rows as any[]).reduce((s, r) => s + Number(r.fine_amount ?? 0), 0);
    const netIncome = totalIncome - totalPenalty;
    const taxBase = netIncome;        // 含稅銷售額
    const salesTax = Math.round(taxBase * 5 / 105);    // 內含 5% 營業稅
    const netBeforeTax = taxBase - salesTax;            // 未稅收入

    // Taiwan bi-monthly filing: odd months = report period (1,3,5,7,9,11)
    const [yr, mo] = month.split("-").map(Number);
    const filingMo = mo % 2 === 0 ? mo - 1 : mo;
    const filingPeriod = `${yr}年${filingMo}-${filingMo + 1}月`;

    res.json({
      ok: true,
      month,
      income_source: totalBilling > 0 ? "billing_trips" : "prefix_rates",
      routes: routeRows.rows,
      billing_trips: billingRows.rows,
      fleet_summary: fleetSummary.rows,
      penalties: penalties.rows,
      tax_info: {
        total_with_tax: totalIncome,
        penalty_deduction: totalPenalty,
        net_income: netIncome,
        sales_tax: salesTax,
        net_before_tax: netBeforeTax,
        filing_period: filingPeriod,
        note: "台灣營業稅 5%（內含），每兩個月（單月）申報一次",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/control-tower  — real-time dispatch control dashboard
fusingaoRouter.get("/control-tower", async (req, res) => {
  try {
    // ── Today's KPIs ─────────────────────────────────────────────────────────
    const kpi = await db.execute(sql`
      SELECT
        COUNT(*)                                                                       AS total,
        COUNT(*) FILTER (WHERE fleet_completed_at IS NOT NULL OR completed_at IS NOT NULL) AS completed,
        COUNT(*) FILTER (WHERE fleet_completed_at IS NULL AND completed_at IS NULL AND fusingao_fleet_id IS NOT NULL) AS in_progress,
        COUNT(*) FILTER (WHERE fusingao_fleet_id IS NULL)                              AS unassigned,
        COUNT(*) FILTER (WHERE
          fleet_completed_at IS NULL AND completed_at IS NULL
          AND created_at < NOW() - INTERVAL '36 hours'
        )                                                                              AS overdue
      FROM orders
      WHERE route_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '30 days'
    `).then(r => r.rows[0] as any);

    // ── Exception routes: overdue + unassigned (30-day window to match KPI) ────
    const exceptions = await db.execute(sql`
      SELECT
        o.id,
        o.route_id              AS route_id,
        o.station_count         AS stations,
        o.route_prefix          AS prefix,
        o.fusingao_fleet_id,
        f.fleet_name,
        o.created_at,
        o.fleet_completed_at,
        o.completed_at,
        CASE
          WHEN o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL THEN 'done'
          WHEN o.fusingao_fleet_id IS NULL THEN 'unassigned'
          WHEN o.created_at < NOW() - INTERVAL '36 hours' THEN 'overdue'
          WHEN o.created_at < NOW() - INTERVAL '20 hours' THEN 'warning'
          ELSE 'normal'
        END AS status
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      WHERE o.route_id IS NOT NULL
        AND o.created_at >= NOW() - INTERVAL '30 days'
        AND (
          o.fusingao_fleet_id IS NULL
          OR (o.fleet_completed_at IS NULL AND o.completed_at IS NULL AND o.created_at < NOW() - INTERVAL '20 hours')
        )
      ORDER BY
        CASE
          WHEN o.fusingao_fleet_id IS NULL THEN 1
          WHEN o.created_at < NOW() - INTERVAL '36 hours' THEN 2
          ELSE 3
        END,
        o.created_at ASC
      LIMIT 100
    `).then(r => r.rows as any[]);

    // ── Fleet performance ranking ─────────────────────────────────────────────
    const fleetPerf = await db.execute(sql`
      SELECT
        f.id,
        f.fleet_name,
        f.commission_rate,
        f.is_active,
        COUNT(o.id)                                                                    AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fusingao_fleet_id IS NOT NULL)                    AS grabbed,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL) AS completed,
        COUNT(o.id) FILTER (WHERE
          o.fleet_completed_at IS NULL AND o.completed_at IS NULL AND o.created_at < NOW() - INTERVAL '36 hours'
        )                                                                              AS overdue_count,
        ROUND(
          100.0 * COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL)
          / NULLIF(COUNT(o.id), 0), 1
        )                                                                              AS completion_rate,
        MAX(o.fleet_completed_at)                                                      AS last_activity
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.route_id IS NOT NULL
        AND o.created_at >= NOW() - INTERVAL '30 days'
      WHERE f.is_active = true
      GROUP BY f.id, f.fleet_name, f.commission_rate, f.is_active
      ORDER BY completion_rate DESC NULLS LAST, total_routes DESC
    `).then(r => r.rows as any[]);

    // ── Available routes for grab (unassigned, 30-day window to match KPI) ─────
    const unassigned = await db.execute(sql`
      SELECT
        o.id,
        o.route_id        AS route_id,
        o.station_count   AS stations,
        o.route_prefix    AS prefix,
        o.service_type,
        o.created_at,
        pr.rate_per_trip  AS shopee_rate
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL
        AND o.fusingao_fleet_id IS NULL
        AND o.fleet_completed_at IS NULL
        AND o.completed_at IS NULL
        AND o.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY o.created_at ASC
      LIMIT 50
    `).then(r => r.rows as any[]);

    res.json({
      ok: true,
      kpi,
      exceptions,
      fleet_performance: fleetPerf,
      unassigned_routes: unassigned,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  SETTLEMENT CHAIN: 福興高 → Platform (抽成) → Fleet → Fleet Driver
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/billing-months — months available in fusingao_billing_trips
fusingaoRouter.get("/billing-months", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        billing_month                          AS month,
        billing_month                          AS month_label,
        COUNT(DISTINCT route_no)               AS route_count,
        COALESCE(SUM(amount::numeric), 0)      AS total_income
      FROM fusingao_billing_trips
      WHERE billing_month ~ '^\d{4}-\d{2}$'
      GROUP BY billing_month
      ORDER BY billing_month DESC
    `);
    res.json({ ok: true, months: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/settlement?month=YYYY-MM  — admin view of full settlement chain
// Income source: fusingao_billing_trips (actual billed amounts from Google Sheets)
fusingaoRouter.get("/settlement", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;

    // Check if billing data exists for this month
    const [billingCheck] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM fusingao_billing_trips
      WHERE billing_month = ${month ?? ""}
    `).then(r => r.rows as any[]);
    const hasBillingData = Number(billingCheck?.cnt ?? 0) > 0;

    if (hasBillingData && month) {
      // ── Billing-trips-based calculation ──────────────────────────────────
      // Top-level summary
      const [summary] = await db.execute(sql`
        WITH billing AS (
          SELECT route_no, COALESCE(SUM(amount::numeric), 0) AS income
          FROM fusingao_billing_trips
          WHERE billing_month = ${month}
          GROUP BY route_no
        ),
        route_fleet AS (
          SELECT DISTINCT ON (route_id) route_id, fusingao_fleet_id
          FROM orders WHERE route_id IS NOT NULL
          ORDER BY route_id, created_at DESC
        )
        SELECT
          COUNT(DISTINCT b.route_no)                                                              AS total_routes,
          COALESCE(SUM(b.income), 0)                                                             AS platform_income,
          COALESCE(SUM(b.income * (1 - COALESCE(f.commission_rate, 15)::numeric / 100.0)), 0)   AS fleet_payout,
          COALESCE(SUM(b.income * COALESCE(f.commission_rate, 15)::numeric / 100.0), 0)         AS platform_commission
        FROM billing b
        LEFT JOIN route_fleet rf ON rf.route_id = b.route_no
        LEFT JOIN fusingao_fleets f ON f.id = rf.fusingao_fleet_id
      `).then(r => r.rows as any[]);

      // Per-fleet breakdown
      const fleetsRows = await db.execute(sql`
        WITH billing AS (
          SELECT route_no, COALESCE(SUM(amount::numeric), 0) AS income
          FROM fusingao_billing_trips
          WHERE billing_month = ${month}
          GROUP BY route_no
        ),
        route_fleet AS (
          SELECT DISTINCT ON (route_id) route_id, fusingao_fleet_id
          FROM orders WHERE route_id IS NOT NULL
          ORDER BY route_id, created_at DESC
        ),
        fleet_billing AS (
          SELECT rf.fusingao_fleet_id AS fleet_id, b.route_no, b.income
          FROM billing b
          LEFT JOIN route_fleet rf ON rf.route_id = b.route_no
        )
        SELECT
          f.id, f.fleet_name, f.commission_rate,
          COUNT(DISTINCT fb.route_no)                                                              AS route_count,
          COALESCE(SUM(fb.income), 0)                                                            AS shopee_income,
          COALESCE(SUM(fb.income * (1 - COALESCE(f.commission_rate, 15)::numeric / 100.0)), 0)  AS fleet_payout,
          COALESCE(SUM(fb.income * COALESCE(f.commission_rate, 15)::numeric / 100.0), 0)        AS commission_earned,
          0 AS billed_count,
          0 AS completed_count
        FROM fusingao_fleets f
        LEFT JOIN fleet_billing fb ON fb.fleet_id = f.id
        GROUP BY f.id, f.fleet_name, f.commission_rate
        ORDER BY shopee_income DESC
      `);

      // Unassigned routes (billing trips with no fleet assignment in orders)
      const [unassigned] = await db.execute(sql`
        WITH billing AS (
          SELECT route_no, COALESCE(SUM(amount::numeric), 0) AS income
          FROM fusingao_billing_trips
          WHERE billing_month = ${month}
          GROUP BY route_no
        ),
        route_fleet AS (
          SELECT DISTINCT ON (route_id) route_id, fusingao_fleet_id
          FROM orders WHERE route_id IS NOT NULL
          ORDER BY route_id, created_at DESC
        )
        SELECT
          COUNT(DISTINCT b.route_no)  AS route_count,
          COALESCE(SUM(b.income), 0)  AS shopee_income,
          COALESCE(SUM(b.income), 0)  AS fleet_payout,
          0                           AS commission_earned,
          0 AS billed_count, 0 AS completed_count
        FROM billing b
        LEFT JOIN route_fleet rf ON rf.route_id = b.route_no
        WHERE rf.fusingao_fleet_id IS NULL
      `).then(r => r.rows as any[]);

      const fleets = [...fleetsRows.rows] as any[];
      if (Number(unassigned?.route_count ?? 0) > 0) {
        fleets.push({ id: -1, fleet_name: "（未指派車隊）", commission_rate: "0", ...unassigned });
      }
      return res.json({ ok: true, summary: summary ?? {}, fleets, source: "billing_trips" });
    }

    // ── Fallback: route_prefix_rates based (for months with no billing data) ──
    const monthFilter   = month ? sql`AND to_char(o.created_at,'YYYY-MM') = ${month}` : sql``;
    const monthFilterWh = month ? sql`AND to_char(o.created_at,'YYYY-MM') = ${month}` : sql``;

    const [summary] = await db.execute(sql`
      SELECT
        COUNT(o.id)                              AS total_routes,
        COALESCE(SUM(pr.rate_per_trip),0)        AS platform_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS fleet_payout,
        COALESCE(SUM(pr.rate_per_trip) - SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS platform_commission
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL ${monthFilterWh}
    `).then(r => r.rows as any[]);

    const fleetsRows = await db.execute(sql`
      SELECT
        f.id, f.fleet_name, f.commission_rate,
        COUNT(o.id)                              AS route_count,
        COALESCE(SUM(pr.rate_per_trip),0)        AS shopee_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS fleet_payout,
        COALESCE(SUM(pr.rate_per_trip) - SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS commission_earned,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status='paid') AS billed_count,
        COUNT(o.fleet_completed_at)              AS completed_count
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.route_id IS NOT NULL ${monthFilter}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      GROUP BY f.id, f.fleet_name, f.commission_rate
      ORDER BY shopee_income DESC
    `);

    const [unassigned] = await db.execute(sql`
      SELECT
        COUNT(o.id)                       AS route_count,
        COALESCE(SUM(pr.rate_per_trip),0) AS shopee_income,
        COALESCE(SUM(pr.rate_per_trip),0) AS fleet_payout,
        0                                 AS commission_earned,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status='paid') AS billed_count,
        COUNT(o.fleet_completed_at)       AS completed_count
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id IS NULL ${monthFilterWh}
    `).then(r => r.rows as any[]);

    const fleets = [...fleetsRows.rows] as any[];
    if (Number(unassigned?.route_count ?? 0) > 0) {
      fleets.push({ id: -1, fleet_name: "（未指派車隊）", commission_rate: "0", ...unassigned });
    }
    res.json({ ok: true, summary: summary ?? {}, fleets, source: "prefix_rates" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/settlement?month=YYYY-MM — fleet-level settlement (for fleet portal)
// Income source: fusingao_billing_trips when available, fallback to route_prefix_rates
fusingaoRouter.get("/fleets/:id/settlement", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query as Record<string, string>;

    // Check if billing data exists for this fleet+month
    const [billingCheck] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM fusingao_billing_trips bt
      JOIN (
        SELECT DISTINCT ON (route_id) route_id
        FROM orders WHERE route_id IS NOT NULL AND fusingao_fleet_id = ${Number(id)}
        ORDER BY route_id, created_at DESC
      ) o ON o.route_id = bt.route_no
      WHERE bt.billing_month = ${month ?? ""}
    `).then(r => r.rows as any[]);
    const hasBillingData = Number(billingCheck?.cnt ?? 0) > 0;

    if (hasBillingData && month) {
      // ── Billing-trips-based ───────────────────────────────────────────────
      const [fleetInfo] = await db.execute(sql`SELECT commission_rate FROM fusingao_fleets WHERE id = ${Number(id)}`).then(r => r.rows as any[]);
      const commRate = Number(fleetInfo?.commission_rate ?? 15);

      const [summary] = await db.execute(sql`
        WITH billing AS (
          SELECT bt.route_no, COALESCE(SUM(bt.amount::numeric), 0) AS income
          FROM fusingao_billing_trips bt
          JOIN (
            SELECT DISTINCT ON (route_id) route_id
            FROM orders WHERE route_id IS NOT NULL AND fusingao_fleet_id = ${Number(id)}
            ORDER BY route_id, created_at DESC
          ) o ON o.route_id = bt.route_no
          WHERE bt.billing_month = ${month}
          GROUP BY bt.route_no
        )
        SELECT
          COALESCE(SUM(income), 0)                               AS shopee_income,
          COALESCE(SUM(income * (1 - ${commRate}::numeric / 100.0)), 0) AS fleet_receive,
          ${commRate}                                            AS commission_rate
        FROM billing
      `).then(r => r.rows as any[]);

      // Per-driver breakdown via orders (for driver assignment) joined with billing
      const drivers = await db.execute(sql`
        WITH route_drivers AS (
          SELECT DISTINCT ON (route_id) route_id, fleet_driver_id
          FROM orders
          WHERE route_id IS NOT NULL AND fusingao_fleet_id = ${Number(id)}
          ORDER BY route_id, created_at DESC
        ),
        billing AS (
          SELECT bt.route_no, COALESCE(SUM(bt.amount::numeric), 0) AS income
          FROM fusingao_billing_trips bt
          JOIN route_drivers rd ON rd.route_id = bt.route_no
          WHERE bt.billing_month = ${month}
          GROUP BY bt.route_no, rd.fleet_driver_id
        ),
        driver_billing AS (
          SELECT rd.fleet_driver_id, SUM(b.income) AS total_income, COUNT(DISTINCT rd.route_id) AS route_count
          FROM route_drivers rd
          LEFT JOIN billing b ON b.route_no = rd.route_id
          GROUP BY rd.fleet_driver_id
        )
        SELECT
          COALESCE(fd.name, '未指派') AS driver_name,
          fd.vehicle_plate,
          COALESCE(db2.route_count, 0)                                              AS route_count,
          0                                                                          AS completed_count,
          COALESCE(db2.total_income * (1 - ${commRate}::numeric / 100.0), 0)       AS earnings
        FROM driver_billing db2
        LEFT JOIN fleet_drivers fd ON fd.id = db2.fleet_driver_id
        ORDER BY earnings DESC
      `);

      const m = month ?? "";
      const [adj] = m
        ? await db.execute(sql`SELECT * FROM fusingao_fleet_adjustments WHERE fleet_id=${Number(id)} AND month=${m}`).then(r => r.rows as any[])
        : [null];

      return res.json({ ok: true, summary: summary ?? {}, drivers: drivers.rows, adjustment: adj ?? null, source: "billing_trips" });
    }

    // ── Fallback: route_prefix_rates ─────────────────────────────────────────
    const monthFilter = month ? sql`AND to_char(o.created_at,'YYYY-MM') = ${month}` : sql``;

    const [summary] = await db.execute(sql`
      SELECT
        COALESCE(SUM(pr.rate_per_trip),0)  AS shopee_income,
        COALESCE(SUM(COALESCE(fl.rate_override, pr.rate_per_trip * (1 - COALESCE(fl.commission_rate,15)/100.0))),0) AS fleet_receive,
        COALESCE(MAX(fl.commission_rate), 15) AS commission_rate
      FROM orders o
      LEFT JOIN fusingao_fleets fl ON fl.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${Number(id)} ${monthFilter}
    `).then(r => r.rows as any[]);

    const drivers = await db.execute(sql`
      SELECT
        COALESCE(fd.name,'未指派') AS driver_name,
        fd.vehicle_plate,
        COUNT(o.id)               AS route_count,
        COUNT(o.fleet_completed_at) AS completed_count,
        COALESCE(SUM(COALESCE(fl2.rate_override, pr.rate_per_trip * (1 - COALESCE(fl2.commission_rate,15)/100.0))),0) AS earnings
      FROM orders o
      LEFT JOIN fusingao_fleets fl2 ON fl2.id = ${Number(id)}
      LEFT JOIN fleet_drivers fd ON fd.id = o.fleet_driver_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${Number(id)} ${monthFilter}
      GROUP BY fd.name, fd.vehicle_plate
      ORDER BY earnings DESC
    `);

    const m = month ?? "";
    const [adj] = m
      ? await db.execute(sql`SELECT * FROM fusingao_fleet_adjustments WHERE fleet_id=${Number(id)} AND month=${m}`).then(r => r.rows as any[])
      : [null];

    res.json({ ok: true, summary: summary ?? {}, drivers: drivers.rows, adjustment: adj ?? null, source: "prefix_rates" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET/POST /fusingao/fleets/:id/adjustments?month=YYYY-MM — save fuel/deduction adjustments
fusingaoRouter.get("/fleets/:id/adjustments", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query as Record<string, string>;
    if (!month) return res.status(400).json({ ok: false, error: "month required" });
    const [row] = (await db.execute(sql`
      SELECT * FROM fusingao_fleet_adjustments WHERE fleet_id=${Number(id)} AND month=${month}
    `)).rows as any[];
    res.json({ ok: true, adjustment: row ?? null });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

fusingaoRouter.post("/fleets/:id/adjustments", async (req, res) => {
  try {
    const { id } = req.params;
    const { month, extra_deduct_rate = 0, fuel_amount = 0, other_amount = 0, other_label = "", note = "" } = req.body;
    if (!month) return res.status(400).json({ ok: false, error: "month required" });
    await db.execute(sql`
      INSERT INTO fusingao_fleet_adjustments
        (fleet_id, month, extra_deduct_rate, fuel_amount, other_amount, other_label, note, updated_at)
      VALUES
        (${Number(id)}, ${month}, ${Number(extra_deduct_rate)}, ${Number(fuel_amount)}, ${Number(other_amount)}, ${other_label}, ${note}, NOW())
      ON CONFLICT (fleet_id, month) DO UPDATE SET
        extra_deduct_rate = EXCLUDED.extra_deduct_rate,
        fuel_amount       = EXCLUDED.fuel_amount,
        other_amount      = EXCLUDED.other_amount,
        other_label       = EXCLUDED.other_label,
        note              = EXCLUDED.note,
        updated_at        = NOW()
    `);
    const [row] = (await db.execute(sql`SELECT * FROM fusingao_fleet_adjustments WHERE fleet_id=${Number(id)} AND month=${month}`)).rows as any[];
    res.json({ ok: true, adjustment: row });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets/:id/report-token?month=YYYY-MM — generate/get shareable report link
fusingaoRouter.post("/fleets/:id/report-token", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.body as { month: string };
    if (!month) return res.status(400).json({ ok: false, error: "month required" });
    // Upsert token
    const token = randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
    await db.execute(sql`
      INSERT INTO fusingao_report_tokens (fleet_id, month, token, expires_at)
      VALUES (${Number(id)}, ${month}, ${token}, ${expires.toISOString()})
      ON CONFLICT (fleet_id, month) DO UPDATE SET
        token      = EXCLUDED.token,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `);
    res.json({ ok: true, token, month });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/public-report/:token — public, no-auth settlement report
fusingaoRouter.get("/public-report/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [row] = (await db.execute(sql`
      SELECT rt.fleet_id, rt.month, rt.expires_at, f.fleet_name, f.commission_rate
      FROM fusingao_report_tokens rt
      JOIN fusingao_fleets f ON f.id = rt.fleet_id
      WHERE rt.token = ${token}
    `)).rows as any[];
    if (!row) return res.status(404).json({ ok: false, error: "無效或已過期的連結" });
    if (row.expires_at && new Date(row.expires_at) < new Date()) return res.status(410).json({ ok: false, error: "此連結已過期" });

    const { fleet_id, month } = row;
    const monthFilter = sql`AND to_char(o.created_at,'YYYY-MM') = ${month}`;

    const [summary] = (await db.execute(sql`
      SELECT
        COALESCE(SUM(pr.rate_per_trip),0) AS shopee_income,
        COALESCE(SUM(COALESCE(fl.rate_override, pr.rate_per_trip * (1 - COALESCE(fl.commission_rate,15)/100.0))),0) AS fleet_receive,
        COALESCE(MAX(fl.commission_rate), 15) AS commission_rate
      FROM orders o
      LEFT JOIN fusingao_fleets fl ON fl.id = ${fleet_id}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${fleet_id} ${monthFilter}
    `)).rows as any[];

    const drivers = (await db.execute(sql`
      SELECT
        COALESCE(fd.name,'未指派') AS driver_name, fd.vehicle_plate,
        COUNT(o.id) AS route_count, COUNT(o.fleet_completed_at) AS completed_count,
        COALESCE(SUM(COALESCE(fl2.rate_override, pr.rate_per_trip * (1 - COALESCE(fl2.commission_rate,15)/100.0))),0) AS earnings
      FROM orders o
      LEFT JOIN fusingao_fleets fl2 ON fl2.id = ${fleet_id}
      LEFT JOIN fleet_drivers fd ON fd.id = o.fleet_driver_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${fleet_id} ${monthFilter}
      GROUP BY fd.name, fd.vehicle_plate ORDER BY earnings DESC
    `)).rows as any[];

    const [adj] = (await db.execute(sql`
      SELECT * FROM fusingao_fleet_adjustments WHERE fleet_id=${fleet_id} AND month=${month}
    `)).rows as any[];

    // Route list
    const routes = (await db.execute(sql`
      SELECT o.route_id, o.route_prefix, o.station_count, o.fleet_completed_at,
             pr.rate_per_trip AS shopee_rate, pr.service_type,
             COALESCE(fl.rate_override, pr.rate_per_trip * (1 - COALESCE(fl.commission_rate,15)/100.0)) AS fleet_rate
      FROM orders o
      LEFT JOIN fusingao_fleets fl ON fl.id = ${fleet_id}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE o.route_id IS NOT NULL AND o.fusingao_fleet_id = ${fleet_id} ${monthFilter}
      ORDER BY o.created_at ASC
    `)).rows as any[];

    res.json({
      ok: true,
      fleet_name: row.fleet_name,
      month,
      summary: summary ?? {},
      drivers,
      adjustment: adj ?? null,
      routes,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /fusingao/invoice?month=YYYY-MM
// 自動計算每月請款單（依路線前綴分組）
// ════════════════════════════════════════════════════════════════════════════
fusingaoRouter.get("/invoice", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    const m = month ?? new Date().toISOString().slice(0, 7);

    // 依前綴分組統計趟次 + 金額
    const rows = await db.execute(sql`
      WITH base AS (
        SELECT
          o.route_prefix AS prefix
        FROM orders o
        WHERE o.route_id IS NOT NULL
          AND TO_CHAR(o.created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM') = ${m}
      )
      SELECT
        b.prefix,
        pr.service_type,
        pr.rate_per_trip,
        COUNT(*)                         AS trip_count,
        COUNT(*) * pr.rate_per_trip      AS gross_amount
      FROM base b
      JOIN route_prefix_rates pr ON pr.prefix = b.prefix
      WHERE b.prefix IS NOT NULL
      GROUP BY b.prefix, pr.service_type, pr.rate_per_trip
      ORDER BY b.prefix
    `).then(r => r.rows as any[]);

    // 前綴 → 請款單分類對應
    const CATEGORY_MAP: Record<string, string> = {
      FM: "店配車", WB: "店配車", WD: "店配車",
      FN: "NDD",   A3: "NDD",
      NB: "WHNDD",
    };

    // 合併到分類
    const catMap: Record<string, { trips: number; gross: number; rate: number }> = {};
    for (const r of rows) {
      const cat = CATEGORY_MAP[r.prefix] ?? r.prefix ?? "其他";
      if (!catMap[cat]) catMap[cat] = { trips: 0, gross: 0, rate: Number(r.rate_per_trip) };
      catMap[cat].trips += Number(r.trip_count);
      catMap[cat].gross += Number(r.gross_amount);
    }

    const categories = Object.entries(catMap).map(([name, v]) => ({
      name, trips: v.trips, gross: v.gross, rate: v.rate,
    }));

    // 自動趟次合計（未含手動項目）
    const autoGross = categories.reduce((s, c) => s + c.gross, 0);

    res.json({ ok: true, month: m, categories, autoGross });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /fusingao/invoice-sheet-import?sheetUrl=...&gid=...
//   解析 Google Sheet 請款單（GID=0），回傳結構化資料供前端填入
// ─────────────────────────────────────────────────────────────────────────────

// 預設 Shopee 福星高請款試算表
const DEFAULT_INVOICE_SHEET_ID = "1Z65luSGOGNYpFPyL1apLR8kxOvYV-U2VvPcVrmC5TzI";
const DEFAULT_INVOICE_GID = "0";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function normAmt(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").replace(/[（(）)]/g, "-").trim());
  return isNaN(n) ? 0 : n;
}

// Items that should come from route orders (auto-calculated in the system)
const AUTO_TYPES = new Set(["店配車", "NDD", "WHNDD"]);
// Items that are manually entered (will be auto-filled from sheet)
const MANUAL_TYPES = new Set(["上收", "招募獎金", "交通罰單補助"]);

fusingaoRouter.get("/invoice-sheet-import", async (req, res) => {
  try {
    const sheetId = (req.query.sheetId as string) ?? DEFAULT_INVOICE_SHEET_ID;
    const gid     = (req.query.gid as string) ?? DEFAULT_INVOICE_GID;
    const csvUrl  = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const r = await fetch(csvUrl);
    if (!r.ok) throw new Error(`無法取得試算表（HTTP ${r.status}）`);

    const text = await r.text();
    // Split carefully – some cells have multi-line content inside quotes
    // Strategy: split by \n but only outside quotes
    const lines: string[] = [];
    let cur = ""; let inQ = false;
    for (const ch of text + "\n") {
      if (ch === '"') { inQ = !inQ; cur += ch; }
      else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (cur || lines.length > 0) lines.push(cur);
        cur = "";
      } else { cur += ch; }
    }

    const parsed = lines.map(l => parseCsvLine(l));

    // ── Determine which side has actual data (V1 vs V2) ───────────────────
    // The sheet has two versions side by side separated by a blank column.
    // V2 is on the left (cols 0-3), V1 is on the right (cols 5-8).
    // We pick the side where 請款金額 > 0.

    // Find 請款金額 rows for each side
    let leftAmt = 0; let rightAmt = 0;
    let month = "";
    const summary: { netAmount: number; tax: number; invoiceAmount: number } = { netAmount: 0, tax: 0, invoiceAmount: 0 };
    const items: { name: string; total: number; fusingao: number; net: number; type: string }[] = [];
    let billPeriod = "";

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      // Month label  e.g. "2026年01月份"
      if (!month && row[0]?.match(/^\d{4}年\d{1,2}月份/)) {
        month = row[0];
      }
      // Bill period e.g. "請款區間"
      if (row[0] === "請款區間" && row[1]) {
        billPeriod = `${row[1]} ~ ${row[3] ?? ""}`.trim();
      }
      // 請款金額 amounts on each side
      if (row[0] === "請款金額") leftAmt = normAmt(row[1] ?? "0");
      if (row[5] === "請款金額") rightAmt = normAmt(row[6] ?? "0");
    }

    // Pick the side with data; prefer right (V1)
    const useRight = rightAmt > 0 || leftAmt === 0;
    const colOffset = useRight ? 5 : 0; // start column for the active side

    // ── Second pass: extract items and summary ─────────────────────────────
    let inItemSection = false;
    for (const row of parsed) {
      // Month (col offset)
      if (!month && row[colOffset]?.match(/^\d{4}年\d{1,2}月份/)) {
        month = row[colOffset];
      }
      // Bill period
      if (row[colOffset] === "請款區間" && row[colOffset + 1]) {
        billPeriod = `${row[colOffset + 1]} ~ ${row[colOffset + 3] ?? ""}`.trim();
      }
      // Summary rows
      if (row[colOffset] === "未稅金額") summary.netAmount = normAmt(row[colOffset + 1] ?? "0");
      if (row[colOffset] === "營業稅金") summary.tax = normAmt(row[colOffset + 1] ?? "0");
      if (row[colOffset] === "請款金額") summary.invoiceAmount = normAmt(row[colOffset + 1] ?? "0");
      // Header marker
      if (row[colOffset] === "項目" && row[colOffset + 1] === "趟次總金額") {
        inItemSection = true; continue;
      }
      // Item rows
      if (inItemSection && row[colOffset]) {
        const name = row[colOffset];
        if (!name || name.startsWith("合計") || name.startsWith("扣") || name.startsWith("※")) {
          inItemSection = false; continue;
        }
        const total    = normAmt(row[colOffset + 1] ?? "0");
        const fusingao = normAmt(row[colOffset + 2] ?? "0");
        const net      = normAmt(row[colOffset + 3] ?? "0");
        const type = AUTO_TYPES.has(name) ? "auto" : MANUAL_TYPES.has(name) ? "manual" : "other";
        items.push({ name, total, fusingao, net, type });
      }
    }

    // Convert month label "2026年01月份" → "2026-01"
    const monthKey = month
      ? (() => {
          const m2 = month.match(/(\d{4})年(\d{1,2})月/);
          return m2 ? `${m2[1]}-${m2[2].padStart(2, "0")}` : "";
        })()
      : "";

    res.json({
      ok: true,
      month: monthKey,
      monthLabel: month,
      billPeriod,
      version: useRight ? "V1" : "V2",
      summary,
      items,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  FLEET SUB-ACCOUNTS (fleet creates driver sub-accounts with login)
// ════════════════════════════════════════════════════════════════════════════

export async function ensureFleetSubAccountsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_sub_accounts (
      id               SERIAL PRIMARY KEY,
      fleet_id         INTEGER NOT NULL,
      fleet_driver_id  INTEGER,
      username         TEXT NOT NULL,
      password_hash    TEXT NOT NULL,
      display_name     TEXT NOT NULL,
      shopee_driver_id TEXT,
      role             TEXT NOT NULL DEFAULT 'driver',
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW(),
      UNIQUE(fleet_id, username)
    )
  `);
}

// GET /fusingao/fleets/:id/sub-accounts
fusingaoRouter.get("/fleets/:id/sub-accounts", async (req, res) => {
  try {
    const fleetId = Number(req.params.id);
    const rows = await db.execute(sql`
      SELECT sa.id, sa.fleet_id, sa.fleet_driver_id, sa.username, sa.display_name,
             sa.shopee_driver_id, sa.role, sa.is_active, sa.created_at,
             fd.name AS driver_name, fd.vehicle_plate, fd.vehicle_type
      FROM fleet_sub_accounts sa
      LEFT JOIN fleet_drivers fd ON fd.id = sa.fleet_driver_id
      WHERE sa.fleet_id = ${fleetId}
      ORDER BY sa.created_at DESC
    `);
    res.json({ ok: true, subAccounts: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets/:id/sub-accounts
fusingaoRouter.post("/fleets/:id/sub-accounts", async (req, res) => {
  try {
    const fleetId = Number(req.params.id);
    const { username, password, display_name, shopee_driver_id, role, fleet_driver_id } = req.body;
    if (!username || !password || !display_name) {
      return res.status(400).json({ ok: false, error: "帳號、密碼、顯示名稱為必填" });
    }
    const pwhash = hashPw(password);
    const [row] = await db.execute(sql`
      INSERT INTO fleet_sub_accounts
        (fleet_id, fleet_driver_id, username, password_hash, display_name, shopee_driver_id, role)
      VALUES (
        ${fleetId},
        ${fleet_driver_id ?? null},
        ${username.trim()},
        ${pwhash},
        ${display_name.trim()},
        ${shopee_driver_id?.trim() ?? null},
        ${role ?? "driver"}
      )
      RETURNING id, username, display_name, shopee_driver_id, role, is_active, created_at
    `).then(r => r.rows as any[]);
    res.json({ ok: true, subAccount: row });
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      return res.status(409).json({ ok: false, error: "此帳號名稱已存在" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id/sub-accounts/:subId
fusingaoRouter.put("/fleets/:id/sub-accounts/:subId", async (req, res) => {
  try {
    const { id, subId } = req.params;
    const { display_name, shopee_driver_id, role, is_active, fleet_driver_id } = req.body;
    await db.execute(sql`
      UPDATE fleet_sub_accounts SET
        display_name     = COALESCE(${display_name ?? null}, display_name),
        shopee_driver_id = ${shopee_driver_id ?? null},
        role             = COALESCE(${role ?? null}, role),
        is_active        = COALESCE(${is_active ?? null}, is_active),
        fleet_driver_id  = ${fleet_driver_id ?? null},
        updated_at       = NOW()
      WHERE id = ${Number(subId)} AND fleet_id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets/:id/sub-accounts/:subId/reset-password
fusingaoRouter.post("/fleets/:id/sub-accounts/:subId/reset-password", async (req, res) => {
  try {
    const { id, subId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ ok: false, error: "密碼至少 4 個字元" });
    }
    const pwhash = hashPw(newPassword);
    await db.execute(sql`
      UPDATE fleet_sub_accounts
      SET password_hash = ${pwhash}, updated_at = NOW()
      WHERE id = ${Number(subId)} AND fleet_id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /fusingao/fleets/:id/sub-accounts/:subId
fusingaoRouter.delete("/fleets/:id/sub-accounts/:subId", async (req, res) => {
  try {
    const { id, subId } = req.params;
    await db.execute(sql`
      DELETE FROM fleet_sub_accounts WHERE id = ${Number(subId)} AND fleet_id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/sub-account-routes — for sub-account logged-in view (filtered by shopee_driver_id)
fusingaoRouter.get("/sub-account-routes", async (req, res) => {
  try {
    const { fleetId, shopeeDriverId, month } = req.query as Record<string, string>;

    const conditions = [
      sql`o.fusingao_fleet_id = ${Number(fleetId)}`,
      sql`o.route_id IS NOT NULL`,
    ];
    if (month) conditions.push(sql`to_char(o.created_at,'YYYY-MM') = ${month}`);
    if (shopeeDriverId) conditions.push(sql`o.notes ILIKE ${'%司機ID：' + shopeeDriverId + '%'}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await db.execute(sql`
      SELECT
        o.id, o.status, o.notes, o.completed_at, o.fleet_completed_at,
        o.driver_payment_status, o.created_at,
        COALESCE(f.rate_override, pr.rate_per_trip, 0) AS shopee_rate,
        COALESCE(f.rate_override, pr.rate_per_trip, 0)
          * (1 - COALESCE(f.commission_rate,15)/100.0) AS fleet_rate,
        o.required_vehicle_type AS service_type,
        fd.name AS driver_name,
        fd.vehicle_plate
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      LEFT JOIN fleet_drivers fd ON fd.id = o.fleet_driver_id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT 200
    `);
    res.json({ ok: true, routes: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ORDER MANAGE — 訂單維護查詢（Glory Platform style TMS）
// ══════════════════════════════════════════════════════════════════════════════

// Helper: generate order number like FY20260415-0001
async function genOrderNo(): Promise<string> {
  const today = new Date();
  const ymd = today.toISOString().slice(0,10).replace(/-/g,"");
  const prefix = `FY${ymd}-`;
  const res = await db.execute(sql.raw(`
    SELECT COUNT(*) AS cnt FROM orders
    WHERE order_no LIKE '${prefix}%'
  `));
  const cnt = Number((res.rows[0] as any)?.cnt ?? 0) + 1;
  return `${prefix}${String(cnt).padStart(4,"0")}`;
}

// GET /fusingao/order-manage — list orders (TMS-style)
fusingaoRouter.get("/order-manage", async (req, res) => {
  try {
    const { status, month, keyword, fleet_id, limit: lim = "100", offset: off = "0" } = req.query as Record<string, string>;
    const conds: string[] = ["o.route_id IS NULL OR o.route_id IS NOT NULL"]; // always true base
    const filterParts: string[] = [];

    if (status && status !== "all") filterParts.push(`o.status = '${status.replace(/'/g,"")}'`);
    if (month) filterParts.push(`to_char(o.created_at,'YYYY-MM') = '${month.replace(/'/g,"")}'`);
    if (fleet_id) filterParts.push(`o.fusingao_fleet_id = ${Number(fleet_id)}`);
    if (keyword) {
      const kw = keyword.replace(/'/g,"''");
      filterParts.push(`(
        o.order_no ILIKE '%${kw}%' OR
        o.customer_name ILIKE '%${kw}%' OR
        o.customer_phone ILIKE '%${kw}%' OR
        o.pickup_address ILIKE '%${kw}%' OR
        o.delivery_address ILIKE '%${kw}%' OR
        o.cargo_name ILIKE '%${kw}%' OR
        o.route_id ILIKE '%${kw}%' OR
        o.notes ILIKE '%${kw}%'
      )`);
    }

    const where = filterParts.length ? "WHERE " + filterParts.join(" AND ") : "";
    const rows = await db.execute(sql.raw(`
      SELECT
        o.id, o.order_no, o.status, o.created_at, o.scheduled_date,
        o.customer_name, o.customer_phone,
        o.pickup_address, o.pickup_contact_name, o.pickup_contact_phone,
        o.delivery_address, o.delivery_contact_name, o.delivery_contact_phone,
        o.cargo_name, o.cargo_qty, o.cargo_weight, o.cargo_volume,
        o.required_vehicle_type,
        o.route_id, o.route_prefix,
        o.base_price, o.total_fee, o.driver_payment_status,
        o.notes, o.operator_name,
        f.fleet_name,
        (SELECT COUNT(*) FROM fusingao_order_events e WHERE e.order_id = o.id) AS event_count
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ${Number(lim)} OFFSET ${Number(off)}
    `));
    const total = await db.execute(sql.raw(`
      SELECT COUNT(*) AS cnt FROM orders o ${where}
    `));
    res.json({ ok: true, orders: rows.rows, total: Number((total.rows[0] as any)?.cnt ?? 0) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/order-manage — create order manually
fusingaoRouter.post("/order-manage", async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    const orderNo = await genOrderNo();
    const q = (v: unknown) => v != null && String(v).trim() !== "" ? `'${String(v).replace(/'/g,"''")}'` : "NULL";
    const row = await db.execute(sql.raw(`
      INSERT INTO orders (
        order_no, status, customer_name, customer_phone,
        pickup_address, pickup_contact_name, pickup_contact_phone,
        delivery_address, delivery_contact_name, delivery_contact_phone,
        cargo_name, cargo_qty, cargo_weight, cargo_volume,
        required_vehicle_type, base_price, total_fee,
        scheduled_date, notes, operator_name,
        created_at, updated_at
      ) VALUES (
        '${orderNo}', '${(b.status ?? "pending").replace(/'/g,"")}',
        ${q(b.customer_name)}, ${q(b.customer_phone)},
        ${q(b.pickup_address)}, ${q(b.pickup_contact_name)}, ${q(b.pickup_contact_phone)},
        ${q(b.delivery_address)}, ${q(b.delivery_contact_name)}, ${q(b.delivery_contact_phone)},
        ${q(b.cargo_name)},
        ${b.cargo_qty != null && b.cargo_qty !== "" ? Number(b.cargo_qty) : "NULL"},
        ${b.cargo_weight != null && b.cargo_weight !== "" ? Number(b.cargo_weight) : "NULL"},
        ${b.cargo_volume != null && b.cargo_volume !== "" ? Number(b.cargo_volume) : "NULL"},
        ${q(b.required_vehicle_type)},
        ${b.base_price != null && b.base_price !== "" ? Number(b.base_price) : "NULL"},
        ${b.total_fee != null && b.total_fee !== "" ? Number(b.total_fee) : "NULL"},
        ${q(b.scheduled_date)}, ${q(b.notes)}, ${q(b.operator_name ?? "系統")},
        NOW(), NOW()
      ) RETURNING id
    `));
    const newId = (row.rows[0] as any)?.id;
    await db.execute(sql`
      INSERT INTO fusingao_order_events (order_id, event_type, note, created_by)
      VALUES (${newId}, 'created', ${`訂單建立：${b.customer_name ?? ""} → ${b.delivery_address ?? ""}`}, ${b.operator_name ?? "系統"})
    `);
    res.json({ ok: true, id: newId, order_no: orderNo });
  } catch (err: any) {
    const detail = err?.cause?.message ?? err?.message ?? String(err);
    res.status(500).json({ ok: false, error: detail, raw: err?.message });
  }
});

// GET /fusingao/order-manage/:id — single order detail
fusingaoRouter.get("/order-manage/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await db.execute(sql`
      SELECT o.*,
        f.fleet_name,
        (SELECT json_agg(e ORDER BY e.created_at ASC)
          FROM fusingao_order_events e WHERE e.order_id = o.id) AS events
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      WHERE o.id = ${id}
    `);
    if (!row.rows.length) return res.status(404).json({ ok: false, error: "訂單不存在" });
    res.json({ ok: true, order: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/order-manage/:id — update order
fusingaoRouter.put("/order-manage/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body as Record<string, any>;
    await db.execute(sql.raw(`
      UPDATE orders SET
        status               = COALESCE('${(b.status ?? "").replace(/'/g,"''")}', status),
        customer_name        = ${b.customer_name != null ? `'${String(b.customer_name).replace(/'/g,"''")}'` : "customer_name"},
        customer_phone       = ${b.customer_phone != null ? `'${String(b.customer_phone).replace(/'/g,"''")}'` : "customer_phone"},
        pickup_address       = ${b.pickup_address != null ? `'${String(b.pickup_address).replace(/'/g,"''")}'` : "pickup_address"},
        pickup_contact_name  = ${b.pickup_contact_name != null ? `'${String(b.pickup_contact_name).replace(/'/g,"''")}'` : "pickup_contact_name"},
        pickup_contact_phone = ${b.pickup_contact_phone != null ? `'${String(b.pickup_contact_phone).replace(/'/g,"''")}'` : "pickup_contact_phone"},
        delivery_address     = ${b.delivery_address != null ? `'${String(b.delivery_address).replace(/'/g,"''")}'` : "delivery_address"},
        delivery_contact_name  = ${b.delivery_contact_name != null ? `'${String(b.delivery_contact_name).replace(/'/g,"''")}'` : "delivery_contact_name"},
        delivery_contact_phone = ${b.delivery_contact_phone != null ? `'${String(b.delivery_contact_phone).replace(/'/g,"''")}'` : "delivery_contact_phone"},
        cargo_name           = ${b.cargo_name != null ? `'${String(b.cargo_name).replace(/'/g,"''")}'` : "cargo_name"},
        cargo_qty            = ${b.cargo_qty != null ? Number(b.cargo_qty) : "cargo_qty"},
        cargo_weight         = ${b.cargo_weight != null ? Number(b.cargo_weight) : "cargo_weight"},
        cargo_volume         = ${b.cargo_volume != null ? Number(b.cargo_volume) : "cargo_volume"},
        required_vehicle_type= ${b.required_vehicle_type != null ? `'${String(b.required_vehicle_type).replace(/'/g,"''")}'` : "required_vehicle_type"},
        base_price           = ${b.base_price != null ? Number(b.base_price) : "base_price"},
        total_fee            = ${b.total_fee != null ? Number(b.total_fee) : "total_fee"},
        scheduled_date       = ${b.scheduled_date != null ? `'${String(b.scheduled_date).replace(/'/g,"''")}'` : "scheduled_date"},
        notes                = ${b.notes != null ? `'${String(b.notes).replace(/'/g,"''")}'` : "notes"},
        operator_name        = ${b.operator_name != null ? `'${String(b.operator_name).replace(/'/g,"''")}'` : "operator_name"},
        updated_at           = NOW()
      WHERE id = ${id}
    `));
    // Log status change event if status changed
    if (b.status && b._prev_status && b.status !== b._prev_status) {
      const statusLabel: Record<string, string> = {
        pending:"待出發", assigned:"已派車", in_transit:"運送中", delivered:"已送達", cancelled:"已取消"
      };
      await db.execute(sql`
        INSERT INTO fusingao_order_events (order_id, event_type, note, created_by)
        VALUES (${id}, 'status_change',
          ${`狀態變更：${statusLabel[b._prev_status] ?? b._prev_status} → ${statusLabel[b.status] ?? b.status}`},
          ${b.operator_name ?? "系統"})
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/order-manage/:id/timeline — order events
fusingaoRouter.get("/order-manage/:id/timeline", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.execute(sql`
      SELECT id, event_type, note, created_by, created_at
      FROM fusingao_order_events
      WHERE order_id = ${id}
      ORDER BY created_at ASC
    `);
    res.json({ ok: true, events: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/order-manage/:id/events — add event to timeline
fusingaoRouter.post("/order-manage/:id/events", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { event_type = "note", note, created_by = "系統" } = req.body as Record<string, string>;
    if (!note?.trim()) return res.status(400).json({ ok: false, error: "note 必填" });
    const evRow = await db.execute(sql`
      INSERT INTO fusingao_order_events (order_id, event_type, note, created_by)
      VALUES (${id}, ${event_type}, ${note.trim()}, ${created_by})
      RETURNING id
    `);
    const evId = (evRow.rows[0] as any)?.id;
    res.json({ ok: true, id: evId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
