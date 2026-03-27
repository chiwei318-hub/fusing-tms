import { Router } from "express";
import { pool } from "@workspace/db";
import { writeAuditLog } from "./auditLog";

export const approvalsRouter = Router();

// ── Bootstrap table ────────────────────────────────────────────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id              SERIAL PRIMARY KEY,
      action_type     TEXT        NOT NULL,
      order_id        INTEGER,
      driver_id       INTEGER,
      customer_id     INTEGER,
      requested_by    TEXT        NOT NULL,
      requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status          TEXT        NOT NULL DEFAULT 'pending',
      payload         JSONB       NOT NULL DEFAULT '{}',
      reason          TEXT,
      review_note     TEXT,
      reviewed_by     TEXT,
      reviewed_at     TIMESTAMPTZ,
      priority        TEXT        NOT NULL DEFAULT 'normal'
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_approval_order  ON approval_requests(order_id)`);
}
ensureTable().catch(console.error);

// ── Action types ───────────────────────────────────────────────────────────
// price_change     → payload: { old_fee, new_fee }
// cancel_order     → payload: { reason }
// reassign_driver  → payload: { old_driver_id, new_driver_id, new_driver_name }
// apply_discount   → payload: { discount_amount, discount_pct }
// outsource_order  → payload: { fleet_id, fleet_name, outsource_fee }
// refund           → payload: { refund_amount, refund_reason }

// ── GET /api/approvals/count ───────────────────────────────────────────────
approvalsRouter.get("/approvals/count", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS pending FROM approval_requests WHERE status='pending'`
    );
    res.json({ pending: rows[0].pending });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/approvals/pending ─────────────────────────────────────────────
approvalsRouter.get("/approvals/pending", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ar.*,
        o.customer_name, o.pickup_address, o.delivery_address,
        o.total_fee, o.status AS order_status,
        d.name AS driver_name
      FROM approval_requests ar
      LEFT JOIN orders  o ON o.id = ar.order_id
      LEFT JOIN drivers d ON d.id = ar.driver_id
      WHERE ar.status = 'pending'
      ORDER BY
        CASE ar.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        ar.requested_at ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/approvals ─────────────────────────────────────────────────────
approvalsRouter.get("/approvals", async (req, res) => {
  try {
    const { status, action_type, limit = "50" } = req.query as Record<string, string>;
    const params: unknown[] = [];
    const conds: string[] = [];
    if (status)      { params.push(status);      conds.push(`ar.status = $${params.length}`); }
    if (action_type) { params.push(action_type); conds.push(`ar.action_type = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    params.push(Math.min(Number(limit), 200));
    const { rows } = await pool.query(`
      SELECT
        ar.*,
        o.customer_name, o.pickup_address, o.delivery_address,
        o.total_fee, o.status AS order_status,
        d.name AS driver_name
      FROM approval_requests ar
      LEFT JOIN orders  o ON o.id = ar.order_id
      LEFT JOIN drivers d ON d.id = ar.driver_id
      ${where}
      ORDER BY ar.requested_at DESC
      LIMIT $${params.length}
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/approvals ────────────────────────────────────────────────────
approvalsRouter.post("/approvals", async (req, res) => {
  try {
    const {
      action_type, order_id, driver_id, customer_id,
      requested_by, payload, reason, priority,
    } = req.body;
    if (!action_type || !requested_by)
      return res.status(400).json({ error: "缺少必填欄位 action_type / requested_by" });

    const { rows } = await pool.query(`
      INSERT INTO approval_requests
        (action_type, order_id, driver_id, customer_id, requested_by, payload, reason, priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      action_type,
      order_id   || null,
      driver_id  || null,
      customer_id || null,
      requested_by,
      JSON.stringify(payload || {}),
      reason   || null,
      priority || "normal",
    ]);
    res.json({ ok: true, approval: rows[0] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── PATCH /api/approvals/:id/approve ─────────────────────────────────────
approvalsRouter.patch("/approvals/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [ar] } = await client.query(
      `SELECT * FROM approval_requests WHERE id=$1 AND status='pending' FOR UPDATE`,
      [req.params.id]
    );
    if (!ar) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "審批請求不存在或已處理" });
    }

    const payload = ar.payload || {};
    let actionResult: Record<string, unknown> = {};

    // Execute the deferred action
    switch (ar.action_type) {
      case "price_change":
        if (ar.order_id != null && payload.new_fee != null) {
          await client.query(
            `UPDATE orders SET total_fee=$1, updated_at=NOW() WHERE id=$2`,
            [payload.new_fee, ar.order_id]
          );
          actionResult = { updated_fee: payload.new_fee };
        }
        break;

      case "cancel_order":
        if (ar.order_id != null) {
          await client.query(
            `UPDATE orders SET status='cancelled', updated_at=NOW() WHERE id=$1`,
            [ar.order_id]
          );
          actionResult = { cancelled: true };
        }
        break;

      case "reassign_driver":
        if (ar.order_id != null && payload.new_driver_id != null) {
          await client.query(
            `UPDATE orders SET driver_id=$1, status='assigned', updated_at=NOW() WHERE id=$2`,
            [payload.new_driver_id, ar.order_id]
          );
          actionResult = { new_driver_id: payload.new_driver_id };
        }
        break;

      case "apply_discount":
        if (ar.order_id != null && payload.discount_amount != null) {
          await client.query(
            `UPDATE orders SET total_fee=GREATEST(0, total_fee - $1), updated_at=NOW() WHERE id=$2`,
            [payload.discount_amount, ar.order_id]
          );
          actionResult = { discount_applied: payload.discount_amount };
        }
        break;

      // outsource_order / refund → human acts after approval, just log
      default:
        actionResult = { note: "人工執行" };
    }

    const { reviewed_by = "admin", review_note } = req.body;
    const { rows } = await client.query(`
      UPDATE approval_requests
      SET status='approved', reviewed_by=$1, review_note=$2, reviewed_at=NOW()
      WHERE id=$3
      RETURNING *
    `, [reviewed_by, review_note || null, req.params.id]);

    await client.query("COMMIT");
    const approved = rows[0];
    // Write audit log
    await writeAuditLog({
      action_type: `approve_${ar.action_type}`,
      actor: approved.reviewed_by,
      target_type: "approval_request",
      target_id: approved.id,
      order_id: ar.order_id ?? undefined,
      before_data: { status: "pending", payload: ar.payload },
      after_data:  { status: "approved", action_result: actionResult },
      note: approved.review_note,
      ip_address: req.ip,
    });
    res.json({ ok: true, approval: approved, action_result: actionResult });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ── PATCH /api/approvals/:id/reject ──────────────────────────────────────
approvalsRouter.patch("/approvals/:id/reject", async (req, res) => {
  try {
    const { reviewed_by = "admin", review_note } = req.body;
    const { rows } = await pool.query(`
      UPDATE approval_requests
      SET status='rejected', reviewed_by=$1, review_note=$2, reviewed_at=NOW()
      WHERE id=$3 AND status='pending'
      RETURNING *
    `, [reviewed_by, review_note || null, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "審批請求不存在或已處理" });
    // Write audit log
    await writeAuditLog({
      action_type: `reject_${rows[0].action_type}`,
      actor: reviewed_by,
      target_type: "approval_request",
      target_id: rows[0].id,
      order_id: rows[0].order_id ?? undefined,
      before_data: { status: "pending" },
      after_data:  { status: "rejected" },
      note: review_note,
      ip_address: req.ip,
    });
    res.json({ ok: true, approval: rows[0] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
