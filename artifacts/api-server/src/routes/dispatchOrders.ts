import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const dispatchOrdersRouter = Router();

// ── Ensure tables ─────────────────────────────────────────────────────────────
export async function ensureDispatchOrdersTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_orders (
      id             SERIAL PRIMARY KEY,
      fleet_id       INTEGER,
      fleet_name     TEXT,
      title          TEXT NOT NULL,
      week_start     TEXT NOT NULL,
      week_end       TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'sent',
      notes          TEXT,
      sent_at        TIMESTAMPTZ DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_order_routes (
      id                  SERIAL PRIMARY KEY,
      dispatch_order_id   INTEGER NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
      order_id            INTEGER,
      route_label         TEXT,
      route_date          TEXT,
      prefix              TEXT,
      assigned_driver_id  INTEGER,
      assigned_driver_name TEXT,
      assigned_at         TIMESTAMPTZ
    )
  `);
}

// ── POST /dispatch-orders — platform creates & sends a dispatch order ─────────
dispatchOrdersRouter.post("/", async (req, res) => {
  try {
    const {
      fleet_id, fleet_name, title, week_start, week_end, notes = null,
      routes = [],   // [{ order_id, route_label, route_date, prefix }]
    } = req.body;

    if (!fleet_id || !title || !week_start || !week_end) {
      return res.status(400).json({ ok: false, error: "fleet_id / title / week_start / week_end 必填" });
    }

    const [inserted] = await db.execute(sql`
      INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, notes, status)
      VALUES (${Number(fleet_id)}, ${fleet_name ?? null}, ${title}, ${week_start}, ${week_end}, ${notes}, 'sent')
      RETURNING id
    `).then(r => r.rows as any[]);

    const orderId = inserted.id;

    for (const r of routes) {
      await db.execute(sql`
        INSERT INTO dispatch_order_routes (dispatch_order_id, order_id, route_label, route_date, prefix)
        VALUES (${orderId}, ${r.order_id ?? null}, ${r.route_label ?? null}, ${r.route_date ?? null}, ${r.prefix ?? null})
      `);
    }

    res.json({ ok: true, id: orderId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders — platform views all dispatch orders ─────────────────
dispatchOrdersRouter.get("/", async (req, res) => {
  try {
    const { fleet_id, status } = req.query as Record<string, string>;

    let conds: string[] = [];
    if (fleet_id) conds.push(`d.fleet_id = ${Number(fleet_id)}`);
    if (status)   conds.push(`d.status = '${status.replace(/'/g, "''")}'`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const orders = await db.execute(sql.raw(`
      SELECT d.*,
        COUNT(r.id)::int AS route_count,
        COUNT(r.assigned_driver_id)::int AS assigned_count
      FROM dispatch_orders d
      LEFT JOIN dispatch_order_routes r ON r.dispatch_order_id = d.id
      ${where}
      GROUP BY d.id
      ORDER BY d.sent_at DESC
    `));

    res.json({ ok: true, orders: orders.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders/fleet/:fleetId — fleet views received orders ─────────
// NOTE: must be registered BEFORE /:id to avoid "fleet" being parsed as id
dispatchOrdersRouter.get("/fleet/:fleetId", async (req, res) => {
  try {
    const fleetId = Number(req.params.fleetId);
    const orders = await db.execute(sql`
      SELECT d.*,
        COUNT(r.id)::int AS route_count,
        COUNT(r.assigned_driver_id)::int AS assigned_count
      FROM dispatch_orders d
      LEFT JOIN dispatch_order_routes r ON r.dispatch_order_id = d.id
      WHERE d.fleet_id = ${fleetId}
      GROUP BY d.id
      ORDER BY d.sent_at DESC
      LIMIT 20
    `);
    res.json({ ok: true, orders: orders.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders/:id — single order detail with routes ────────────────
dispatchOrdersRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.execute(sql`
      SELECT * FROM dispatch_orders WHERE id = ${id}
    `).then(r => r.rows as any[]);

    if (!order) return res.status(404).json({ ok: false, error: "找不到此派車單" });

    const routes = await db.execute(sql`
      SELECT r.*, fd.name AS driver_name, fd.vehicle_plate
      FROM dispatch_order_routes r
      LEFT JOIN fleet_drivers fd ON fd.id = r.assigned_driver_id
      WHERE r.dispatch_order_id = ${id}
      ORDER BY r.route_date, r.route_label
    `);

    res.json({ ok: true, order, routes: routes.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /dispatch-orders/:id/acknowledge — fleet acknowledges receipt ─────────
dispatchOrdersRouter.put("/:id/acknowledge", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`
      UPDATE dispatch_orders
      SET status = 'acknowledged', acknowledged_at = NOW()
      WHERE id = ${id} AND status = 'sent'
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /dispatch-orders/:id/routes/:routeItemId/assign — fleet assigns driver
dispatchOrdersRouter.put("/:id/routes/:routeItemId/assign", async (req, res) => {
  try {
    const orderId     = Number(req.params.id);
    const routeItemId = Number(req.params.routeItemId);
    const { driver_id, driver_name } = req.body;

    await db.execute(sql`
      UPDATE dispatch_order_routes
      SET assigned_driver_id   = ${driver_id   ?? null},
          assigned_driver_name = ${driver_name ?? null},
          assigned_at          = ${driver_id ? sql`NOW()` : sql`NULL`}
      WHERE id = ${routeItemId} AND dispatch_order_id = ${orderId}
    `);

    // If all routes assigned → auto-advance status to 'assigned'
    const [counts] = await db.execute(sql`
      SELECT COUNT(*)::int AS total, COUNT(assigned_driver_id)::int AS assigned
      FROM dispatch_order_routes
      WHERE dispatch_order_id = ${orderId}
    `).then(r => r.rows as any[]);

    if (counts && counts.total > 0 && counts.total === counts.assigned) {
      await db.execute(sql`
        UPDATE dispatch_orders SET status = 'assigned' WHERE id = ${orderId}
      `);
    } else {
      await db.execute(sql`
        UPDATE dispatch_orders SET status = 'acknowledged' WHERE id = ${orderId} AND status = 'sent'
      `);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /dispatch-orders/:id — platform recalls/deletes an order ──────────
dispatchOrdersRouter.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM dispatch_orders WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
