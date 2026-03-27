import { Router } from "express";
import { pool } from "@workspace/db";

export const auditLogRouter = Router();

// ── Bootstrap table ───────────────────────────────────────────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           SERIAL PRIMARY KEY,
      action_type  TEXT        NOT NULL,
      actor        TEXT        NOT NULL DEFAULT 'system',
      target_type  TEXT,
      target_id    INTEGER,
      order_id     INTEGER,
      before_data  JSONB,
      after_data   JSONB,
      note         TEXT,
      ip_address   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_type      ON audit_log(action_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_target    ON audit_log(target_type, target_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_order     ON audit_log(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at DESC)`);
}
ensureTable().catch(console.error);

// ── Internal helper (used by other routes) ─────────────────────────────────
export async function writeAuditLog(opts: {
  action_type: string;
  actor?: string;
  target_type?: string;
  target_id?: number;
  order_id?: number;
  before_data?: Record<string, unknown>;
  after_data?: Record<string, unknown>;
  note?: string;
  ip_address?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log
        (action_type, actor, target_type, target_id, order_id, before_data, after_data, note, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        opts.action_type,
        opts.actor ?? "system",
        opts.target_type ?? null,
        opts.target_id ?? null,
        opts.order_id ?? null,
        opts.before_data ? JSON.stringify(opts.before_data) : null,
        opts.after_data ? JSON.stringify(opts.after_data) : null,
        opts.note ?? null,
        opts.ip_address ?? null,
      ]
    );
  } catch (e) {
    console.error("[AuditLog] write error:", e);
  }
}

// ── GET /api/audit-log ─────────────────────────────────────────────────────
auditLogRouter.get("/audit-log", async (req, res) => {
  try {
    const {
      action_type, actor, target_type, order_id,
      date_from, date_to, limit = "100", offset = "0",
    } = req.query as Record<string, string>;

    const conditions: string[] = ["1=1"];
    const params: (string | number)[] = [];
    let p = 1;

    if (action_type) { conditions.push(`action_type = $${p++}`); params.push(action_type); }
    if (actor)       { conditions.push(`actor ILIKE $${p++}`);    params.push(`%${actor}%`); }
    if (target_type) { conditions.push(`target_type = $${p++}`);  params.push(target_type); }
    if (order_id)    { conditions.push(`order_id = $${p++}`);     params.push(Number(order_id)); }
    if (date_from)   { conditions.push(`created_at >= $${p++}`);  params.push(date_from); }
    if (date_to)     { conditions.push(`created_at < $${p++}`);   params.push(date_to); }

    const { rows } = await pool.query(
      `SELECT * FROM audit_log WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, Number(limit), Number(offset)]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log WHERE ${conditions.join(" AND ")}`,
      params
    );

    res.json({ rows, total: countRes.rows[0].total });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/audit-log (manual write) ────────────────────────────────────
auditLogRouter.post("/audit-log", async (req, res) => {
  try {
    const { action_type, actor, target_type, target_id, order_id, before_data, after_data, note } = req.body;
    if (!action_type) return res.status(400).json({ error: "action_type is required" });
    await writeAuditLog({
      action_type, actor, target_type, target_id, order_id, before_data, after_data, note,
      ip_address: req.ip,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/audit-log/summary ─────────────────────────────────────────────
auditLogRouter.get("/audit-log/summary", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        action_type,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('day', NOW()))::int AS today_count
      FROM audit_log
      GROUP BY action_type
      ORDER BY count DESC
    `);
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log`);
    res.json({ byType: rows, total: total.rows[0].n });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
