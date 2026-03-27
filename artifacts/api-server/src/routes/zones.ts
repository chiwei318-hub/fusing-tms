/**
 * Zone / Team Architecture
 *
 * Hierarchy:  Zone (parent → child) → Team → Drivers + Orders
 *
 * Zones:  Regional divisions (e.g. 北區, 中區, 南區) or operational hubs
 * Teams:  Sub-groups within a zone (e.g. 台北A隊, 台中冷鏈隊)
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const zonesRouter = Router();

// ── Ensure tables ─────────────────────────────────────────────────────────
async function ensureTables() {
  // zones
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zones (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      code           TEXT UNIQUE,
      parent_zone_id INT  REFERENCES zones(id) ON DELETE SET NULL,
      region         TEXT,
      description    TEXT,
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_zones_parent ON zones(parent_zone_id)`);

  // teams
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      code        TEXT UNIQUE,
      zone_id     INT  REFERENCES zones(id) ON DELETE SET NULL,
      description TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_teams_zone ON teams(zone_id)`);

  // zone_id / team_id on core tables
  for (const [tbl, col, ref] of [
    ["orders",   "zone_id",  "zones(id)"],
    ["orders",   "team_id",  "teams(id)"],
    ["drivers",  "zone_id",  "zones(id)"],
    ["drivers",  "team_id",  "teams(id)"],
    ["customers","zone_id",  "zones(id)"],
  ] as [string, string, string][]) {
    await pool.query(
      `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} INT REFERENCES ${ref} ON DELETE SET NULL`
    );
  }

  // Customer master-data fields
  for (const [col, def] of [
    ["billing_cycle",    "TEXT"],            // monthly / weekly / cod
    ["credit_days",      "INT"],             // credit terms in days
    ["contract_type",    "TEXT"],            // spot / contract / key_account
    ["contract_start",   "DATE"],
    ["contract_end",     "DATE"],
    ["unit_price_fixed", "NUMERIC(10,2)"],   // fixed per-km or per-trip contract price
    ["min_monthly_spend","NUMERIC(12,2)"],   // monthly minimum commitment
  ] as [string, string][]) {
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }

  // Vehicle master-data enrichment on drivers table
  for (const [col, def] of [
    ["vehicle_volume_cbm", "NUMERIC(8,2)"],
    ["vehicle_max_ton",    "NUMERIC(8,2)"],
    ["has_cold_chain",     "BOOLEAN DEFAULT FALSE"],
    ["license_class",      "TEXT"],           // e.g. 普通小型車/大型車/聯結車
    ["license_expiry_date","DATE"],
    ["commercial_insurance_expiry","DATE"],
  ] as [string, string][]) {
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }

  console.log("[Zones] schema ensured");
}
ensureTables().catch(console.error);

// ── Helpers ───────────────────────────────────────────────────────────────
async function getZoneTree() {
  const { rows } = await pool.query(`
    SELECT z.*, COUNT(t.id)::int AS team_count,
      COUNT(DISTINCT d.id)::int  AS driver_count,
      COUNT(DISTINCT o.id)::int  AS active_order_count
    FROM zones z
    LEFT JOIN teams  t ON t.zone_id = z.id AND t.is_active
    LEFT JOIN drivers d ON d.zone_id = z.id AND d.status != 'inactive'
    LEFT JOIN orders  o ON o.zone_id = z.id AND o.status NOT IN ('delivered','cancelled')
    GROUP BY z.id
    ORDER BY z.parent_zone_id NULLS FIRST, z.name
  `);
  // Build tree
  const map = new Map(rows.map(r => [r.id, { ...r, children: [] as typeof rows }]));
  const roots: typeof rows = [];
  rows.forEach(r => {
    if (r.parent_zone_id && map.has(r.parent_zone_id)) {
      map.get(r.parent_zone_id)!.children.push(map.get(r.id)!);
    } else {
      roots.push(map.get(r.id)!);
    }
  });
  return roots;
}

// ── ZONE ROUTES ───────────────────────────────────────────────────────────

// GET /api/zones — flat list
zonesRouter.get("/zones", async (req, res) => {
  try {
    const { tree } = req.query as Record<string, string>;
    if (tree === "1") {
      return res.json(await getZoneTree());
    }
    const { rows } = await pool.query(`
      SELECT z.*, COUNT(t.id)::int AS team_count,
        COUNT(DISTINCT d.id)::int   AS driver_count
      FROM zones z
      LEFT JOIN teams   t ON t.zone_id = z.id AND t.is_active
      LEFT JOIN drivers d ON d.zone_id = z.id
      WHERE z.is_active
      GROUP BY z.id
      ORDER BY z.parent_zone_id NULLS FIRST, z.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/zones
zonesRouter.post("/zones", async (req, res) => {
  try {
    const { name, code, parent_zone_id, region, description } = req.body;
    if (!name) return res.status(400).json({ error: "name 必填" });
    const { rows } = await pool.query(
      `INSERT INTO zones (name, code, parent_zone_id, region, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, code || null, parent_zone_id || null, region || null, description || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PATCH /api/zones/:id
zonesRouter.patch("/zones/:id", async (req, res) => {
  try {
    const { name, code, parent_zone_id, region, description, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE zones SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        parent_zone_id = CASE WHEN $3::int IS NULL THEN parent_zone_id ELSE $3::int END,
        region      = COALESCE($4, region),
        description = COALESCE($5, description),
        is_active   = COALESCE($6, is_active),
        updated_at  = NOW()
       WHERE id = $7 RETURNING *`,
      [name, code, parent_zone_id ?? null, region, description, is_active ?? null, Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/zones/:id (soft delete)
zonesRouter.delete("/zones/:id", async (req, res) => {
  try {
    await pool.query(`UPDATE zones SET is_active=false WHERE id=$1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/zones/:id/stats
zonesRouter.get("/zones/:id/stats", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [orderRes, driverRes, teamRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='pending')::int  AS pending,
          COUNT(*) FILTER (WHERE status='assigned')::int AS assigned,
          COUNT(*) FILTER (WHERE status IN ('arrived','loading','in_transit'))::int AS active,
          COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status='exception')::int AS exception,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0) AS revenue_total
        FROM orders WHERE zone_id = $1
      `, [id]),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='available')::int AS available,
          COUNT(*) FILTER (WHERE status='busy')::int AS busy,
          COUNT(*) FILTER (WHERE status='offline')::int AS offline
        FROM drivers WHERE zone_id = $1
      `, [id]),
      pool.query(`SELECT * FROM teams WHERE zone_id=$1 AND is_active ORDER BY name`, [id]),
    ]);
    res.json({
      zoneId: id,
      orders: orderRes.rows[0],
      drivers: driverRes.rows[0],
      teams: teamRes.rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── TEAM ROUTES ───────────────────────────────────────────────────────────

// GET /api/teams
zonesRouter.get("/teams", async (req, res) => {
  try {
    const { zone_id } = req.query as Record<string, string>;
    const conds = ["t.is_active = true"];
    const params: (string | number)[] = [];
    if (zone_id) { conds.push(`t.zone_id = $${params.length + 1}`); params.push(Number(zone_id)); }

    const { rows } = await pool.query(`
      SELECT t.*,
        z.name AS zone_name,
        COUNT(d.id)::int  AS driver_count,
        COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled'))::int AS active_orders
      FROM teams t
      LEFT JOIN zones   z ON z.id = t.zone_id
      LEFT JOIN drivers d ON d.team_id = t.id
      LEFT JOIN orders  o ON o.team_id  = t.id
      WHERE ${conds.join(" AND ")}
      GROUP BY t.id, z.name
      ORDER BY t.zone_id NULLS LAST, t.name
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/teams
zonesRouter.post("/teams", async (req, res) => {
  try {
    const { name, code, zone_id, description } = req.body;
    if (!name) return res.status(400).json({ error: "name 必填" });
    const { rows } = await pool.query(
      `INSERT INTO teams (name, code, zone_id, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, code || null, zone_id || null, description || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PATCH /api/teams/:id
zonesRouter.patch("/teams/:id", async (req, res) => {
  try {
    const { name, code, zone_id, description, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE teams SET
        name        = COALESCE($1, name),
        code        = COALESCE($2, code),
        zone_id     = CASE WHEN $3::int IS NULL THEN zone_id ELSE $3::int END,
        description = COALESCE($4, description),
        is_active   = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name, code, zone_id ?? null, description, is_active ?? null, Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/teams/:id (soft delete)
zonesRouter.delete("/teams/:id", async (req, res) => {
  try {
    await pool.query(`UPDATE teams SET is_active=false WHERE id=$1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ASSIGN ZONE/TEAM to entities ──────────────────────────────────────────

// PATCH /api/zones/assign/driver
zonesRouter.patch("/zones/assign/driver", async (req, res) => {
  try {
    const { driver_id, zone_id, team_id } = req.body;
    if (!driver_id) return res.status(400).json({ error: "driver_id 必填" });
    const { rows } = await pool.query(
      `UPDATE drivers SET
        zone_id = COALESCE($1::int, zone_id),
        team_id = COALESCE($2::int, team_id)
       WHERE id = $3 RETURNING id, name, zone_id, team_id`,
      [zone_id ?? null, team_id ?? null, Number(driver_id)]
    );
    res.json(rows[0] ?? { error: "Not found" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PATCH /api/zones/assign/order
zonesRouter.patch("/zones/assign/order", async (req, res) => {
  try {
    const { order_id, zone_id, team_id } = req.body;
    if (!order_id) return res.status(400).json({ error: "order_id 必填" });
    const { rows } = await pool.query(
      `UPDATE orders SET
        zone_id = COALESCE($1::int, zone_id),
        team_id = COALESCE($2::int, team_id)
       WHERE id = $3 RETURNING id, zone_id, team_id`,
      [zone_id ?? null, team_id ?? null, Number(order_id)]
    );
    res.json(rows[0] ?? { error: "Not found" });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── DISPATCH LOCK endpoint ─────────────────────────────────────────────────
// Used by the admin to safely assign a driver to an order using FOR UPDATE lock
// This is separate from the normal PATCH /orders/:id to allow atomic check-and-assign
zonesRouter.post("/dispatch/assign", async (req, res) => {
  const { order_id, driver_id, reassign_reason } = req.body as {
    order_id: number;
    driver_id: number;
    reassign_reason?: string;
  };

  if (!order_id || !driver_id) {
    return res.status(400).json({ error: "order_id 和 driver_id 必填" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Lock the order row to prevent concurrent dispatch ──────────────────
    const { rows: lockRows } = await client.query(
      `SELECT id, status, driver_id, zone_id FROM orders WHERE id = $1 FOR UPDATE NOWAIT`,
      [Number(order_id)]
    );

    if (!lockRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "訂單不存在" });
    }

    const order = lockRows[0];

    // Already assigned to this driver → idempotent
    if (order.driver_id === Number(driver_id) && order.status === "assigned") {
      await client.query("ROLLBACK");
      return res.json({ ok: true, idempotent: true, order });
    }

    // Only allow dispatch from pending or reassign from assigned
    if (!["pending", "assigned"].includes(order.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `訂單狀態 [${order.status}] 無法派車，只接受 pending/assigned`
      });
    }

    const prevDriverId = order.driver_id;

    // ── Assign driver ──────────────────────────────────────────────────────
    const { rows: updated } = await client.query(
      `UPDATE orders SET driver_id=$1, status='assigned', updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [Number(driver_id), Number(order_id)]
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor, note)
       VALUES ($1, $2, 'assigned', 'admin', $3)`,
      [
        Number(order_id),
        order.status,
        reassign_reason
          ? `改派：${reassign_reason}（前司機 #${prevDriverId ?? "無"}）`
          : `派車至司機 #${driver_id}`,
      ]
    );

    await client.query("COMMIT");
    res.json({ ok: true, order: updated[0], prevDriverId });

  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const msg = String(err);
    // PostgreSQL NOWAIT lock failure code = 55P03
    if (msg.includes("55P03") || msg.includes("could not obtain lock")) {
      return res.status(409).json({ error: "訂單正在被其他操作處理中，請稍後重試" });
    }
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
});

// GET /api/dispatch/lock-status/:id — check if an order is locked
zonesRouter.get("/dispatch/lock-status/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, driver_id,
        pg_try_advisory_lock(id) AS can_lock
       FROM orders WHERE id=$1`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const r = rows[0];
    // Release if we acquired it
    if (r.can_lock) await pool.query(`SELECT pg_advisory_unlock($1)`, [Number(req.params.id)]);
    res.json({ orderId: r.id, status: r.status, driver_id: r.driver_id, is_locked: !r.can_lock });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
