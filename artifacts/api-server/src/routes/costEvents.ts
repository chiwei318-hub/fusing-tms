import { Router } from "express";
import { pool } from "@workspace/db";

export const costEventsRouter = Router();

// ── Bootstrap table ────────────────────────────────────────────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_cost_events (
      id               SERIAL PRIMARY KEY,
      order_id         INTEGER     NOT NULL,
      event_type       TEXT        NOT NULL,
      amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
      responsibility   TEXT        NOT NULL DEFAULT 'company',
      deduction_target TEXT,
      description      TEXT,
      created_by       TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_settled       BOOLEAN     NOT NULL DEFAULT FALSE,
      settled_at       TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cost_events_order  ON order_cost_events(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cost_events_settled ON order_cost_events(is_settled)`);
}
ensureTable().catch(console.error);

// event_type:
//   wait_fee        等候費
//   re_delivery     二次配送費
//   cargo_damage    貨損賠償
//   return_cargo    退貨費用
//   overtime        加班費
//   other           其他

// responsibility:
//   driver    → deduct from driver payroll
//   customer  → add to customer invoice
//   company   → company absorbs

// ── GET /api/orders/:id/cost-events ───────────────────────────────────────
costEventsRouter.get("/orders/:id/cost-events", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM order_cost_events WHERE order_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/orders/:id/cost-events ──────────────────────────────────────
costEventsRouter.post("/orders/:id/cost-events", async (req, res) => {
  try {
    const { event_type, amount, responsibility, deduction_target, description, created_by } = req.body;
    if (!event_type || amount == null)
      return res.status(400).json({ error: "缺少 event_type / amount" });

    const { rows } = await pool.query(`
      INSERT INTO order_cost_events
        (order_id, event_type, amount, responsibility, deduction_target, description, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      req.params.id,
      event_type,
      amount,
      responsibility || "company",
      deduction_target || null,
      description || null,
      created_by || "admin",
    ]);
    res.json({ ok: true, event: rows[0] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── PATCH /api/cost-events/:id/settle ─────────────────────────────────────
costEventsRouter.patch("/cost-events/:id/settle", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      UPDATE order_cost_events
      SET is_settled=TRUE, settled_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "不存在" });
    res.json({ ok: true, event: rows[0] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── DELETE /api/cost-events/:id ────────────────────────────────────────────
costEventsRouter.delete("/cost-events/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM order_cost_events WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/cost-events/summary ──────────────────────────────────────────
// Summary for settlement: all unsettled cost events grouped by type/responsibility
costEventsRouter.get("/cost-events/summary", async (req, res) => {
  try {
    const { month } = req.query as { month?: string };
    const dateCond = month
      ? `AND DATE_TRUNC('month', ce.created_at) = DATE_TRUNC('month', '${month}'::date)`
      : `AND DATE_TRUNC('month', ce.created_at) = DATE_TRUNC('month', NOW())`;

    const { rows } = await pool.query(`
      SELECT
        ce.event_type,
        ce.responsibility,
        ce.deduction_target,
        COUNT(*)::int               AS event_count,
        SUM(ce.amount)              AS total_amount,
        COUNT(*) FILTER (WHERE ce.is_settled)::int AS settled_count
      FROM order_cost_events ce
      WHERE 1=1 ${dateCond}
      GROUP BY ce.event_type, ce.responsibility, ce.deduction_target
      ORDER BY total_amount DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/cost-events/by-order ─────────────────────────────────────────
// Full list with order info for settlement view
costEventsRouter.get("/cost-events/by-order", async (req, res) => {
  try {
    const { responsibility, is_settled, month } = req.query as Record<string, string>;
    const params: unknown[] = [];
    const conds: string[] = [];

    if (responsibility) { params.push(responsibility); conds.push(`ce.responsibility=$${params.length}`); }
    if (is_settled !== undefined) { params.push(is_settled === "true"); conds.push(`ce.is_settled=$${params.length}`); }
    if (month) {
      params.push(month);
      conds.push(`DATE_TRUNC('month', ce.created_at) = DATE_TRUNC('month', $${params.length}::date)`);
    } else {
      conds.push(`DATE_TRUNC('month', ce.created_at) = DATE_TRUNC('month', NOW())`);
    }

    const where = `WHERE ${conds.join(" AND ")}`;
    const { rows } = await pool.query(`
      SELECT
        ce.*,
        o.customer_name, o.driver_id,
        d.name AS driver_name,
        d.license_plate
      FROM order_cost_events ce
      LEFT JOIN orders  o ON o.id = ce.order_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      ${where}
      ORDER BY ce.created_at DESC
      LIMIT 200
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
