/**
 * Order Status Flow - Granular Status Events
 *
 * Status machine:
 *   pending → assigned → arrived → loading → in_transit → delivered
 *                                                       ↓
 *                                                   exception
 *
 * New statuses (additions to base flow):
 *   arrived   = 司機已到點 (pickup location)
 *   loading   = 開始裝貨
 *   exception = 異常 (with reason code)
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { writeAuditLog } from "./auditLog";

export const orderStatusFlowRouter = Router();

// ── Abnormal reason codes ─────────────────────────────────────────────────
export const EXCEPTION_CODES: Record<string, { label: string; defaultAttrib: string }> = {
  E01: { label: "客戶不在現場",         defaultAttrib: "customer" },
  E02: { label: "貨物未備妥",           defaultAttrib: "customer" },
  E03: { label: "地址錯誤/無法進入",    defaultAttrib: "customer" },
  E04: { label: "貨物超重/超尺寸",      defaultAttrib: "customer" },
  E05: { label: "道路塞車/管制",        defaultAttrib: "company" },
  E06: { label: "車輛故障",             defaultAttrib: "company" },
  E07: { label: "氣候因素",             defaultAttrib: "company" },
  E08: { label: "司機健康因素",         defaultAttrib: "company" },
  E09: { label: "貨物損毀（司機責任）",  defaultAttrib: "driver" },
  E10: { label: "交通事故",             defaultAttrib: "driver" },
  E11: { label: "等候費（超過15分鐘）", defaultAttrib: "customer" },
  E99: { label: "其他（備註說明）",     defaultAttrib: "company" },
};

// ── Ensure tables ─────────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id          SERIAL PRIMARY KEY,
      order_id    INTEGER     NOT NULL,
      from_status TEXT,
      to_status   TEXT        NOT NULL,
      actor       TEXT        NOT NULL DEFAULT 'system',
      note        TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_osh_order ON order_status_history(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_osh_time  ON order_status_history(occurred_at DESC)`);

  // Add new columns to orders if not present
  for (const [col, def] of [
    ["arrived_at",           "TIMESTAMPTZ"],
    ["loaded_at",            "TIMESTAMPTZ"],
    ["exception_code",       "TEXT"],
    ["exception_note",       "TEXT"],
    ["exception_at",         "TIMESTAMPTZ"],
    ["exception_attribution","TEXT"],
    ["pod_photo_url",        "TEXT"],
    ["pod_note",             "TEXT"],
  ] as [string, string][]) {
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col} ${def}`
    );
  }
}
ensureTables().catch(console.error);

// ── Valid transitions ─────────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ["assigned", "cancelled"],
  assigned:   ["arrived",  "cancelled", "exception"],
  arrived:    ["loading",  "cancelled", "exception"],
  loading:    ["in_transit","exception"],
  in_transit: ["delivered","exception"],
  delivered:  [],
  exception:  ["assigned", "in_transit", "delivered"],
  cancelled:  [],
};

// ── GET /api/orders/:id/status-history ────────────────────────────────────
orderStatusFlowRouter.get("/orders/:id/status-history", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT osh.*, o.arrived_at, o.loaded_at, o.check_in_at, o.completed_at,
              o.exception_code, o.exception_note, o.exception_attribution,
              o.pod_photo_url, o.pod_note, o.status
       FROM order_status_history osh
       JOIN orders o ON o.id = osh.order_id
       WHERE osh.order_id = $1
       ORDER BY osh.occurred_at ASC`,
      [Number(req.params.id)]
    );
    // Also return current order state
    const orderRes = await pool.query(
      `SELECT id, status, arrived_at, loaded_at, check_in_at AS departed_at, completed_at,
              exception_code, exception_note, exception_attribution, exception_at,
              pod_photo_url, pod_note, signature_photo_url
       FROM orders WHERE id = $1`,
      [Number(req.params.id)]
    );
    res.json({
      history: rows,
      current: orderRes.rows[0] ?? null,
      exceptionCodes: EXCEPTION_CODES,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/orders/:id/status-event ─────────────────────────────────────
// Handles new granular events: arrive, start_loading, exception, pod_upload
orderStatusFlowRouter.post("/orders/:id/status-event", async (req, res) => {
  const id = Number(req.params.id);
  const { event, actor = "driver", note, exception_code, exception_attribution, pod_photo_url } = req.body as {
    event: "arrive" | "start_loading" | "exception" | "resolve_exception" | "pod_upload";
    actor?: string;
    note?: string;
    exception_code?: string;
    exception_attribution?: string;
    pod_photo_url?: string;
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, arrived_at, loaded_at, customer_phone, customer_name FROM orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "訂單不存在" }); }

    const order = rows[0];
    const now = new Date();
    let newStatus: string | null = null;
    const updates: Record<string, unknown> = { updated_at: now };

    switch (event) {
      case "arrive":
        if (!["assigned", "pending"].includes(order.status))
          throw new Error(`無效狀態轉換：${order.status} → arrived`);
        newStatus = "arrived";
        updates.arrived_at = now;
        break;

      case "start_loading":
        if (order.status !== "arrived")
          throw new Error(`無效狀態轉換：${order.status} → loading`);
        newStatus = "loading";
        updates.loaded_at = now;
        break;

      case "exception": {
        if (!VALID_TRANSITIONS[order.status]?.includes("exception"))
          throw new Error(`此狀態不可回報異常：${order.status}`);
        if (!exception_code || !EXCEPTION_CODES[exception_code])
          throw new Error("無效的異常原因碼");
        const attrib = exception_attribution ?? EXCEPTION_CODES[exception_code]?.defaultAttrib ?? "company";
        newStatus = "exception";
        updates.exception_code        = exception_code;
        updates.exception_note        = note ?? null;
        updates.exception_attribution = attrib;
        updates.exception_at          = now;
        break;
      }

      case "resolve_exception":
        if (order.status !== "exception")
          throw new Error("訂單不在異常狀態");
        newStatus = "assigned";
        break;

      case "pod_upload":
        if (pod_photo_url) updates.pod_photo_url = pod_photo_url;
        if (note)         updates.pod_note = note;
        // No status change for POD upload
        break;

      default:
        throw new Error("未知的事件類型");
    }

    // Apply status change
    if (newStatus) updates.status = newStatus;

    // Build SET clause
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    const values     = Object.values(updates);
    await client.query(
      `UPDATE orders SET ${setClauses.join(", ")} WHERE id = $1`,
      [id, ...values]
    );

    // Write status history
    if (newStatus) {
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, actor, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, order.status, newStatus, actor, note ?? null]
      );
    }

    await client.query("COMMIT");

    // Audit log
    await writeAuditLog({
      action_type: `order_status_${event}`,
      actor,
      target_type: "order",
      target_id: id,
      order_id: id,
      before_data: { status: order.status },
      after_data: { status: newStatus, event, note },
    });

    // LINE notifications (async, non-blocking)
    if (newStatus && (order.customer_phone || order.customer_name)) {
      setImmediate(async () => {
        try {
          const { isLineConfigured } = await import("../lib/line");
          if (!isLineConfigured()) return;

          const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

          // Notify admin of exceptions
          if (newStatus === "exception" && process.env.ADMIN_LINE_ID) {
            const code = exception_code ?? "E99";
            const label = EXCEPTION_CODES[code]?.label ?? code;
            await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                to: process.env.ADMIN_LINE_ID,
                messages: [{
                  type: "text",
                  text: `⚠️ 訂單異常 #${id}\n客戶：${order.customer_name ?? order.customer_phone}\n原因：[${code}] ${label}\n備註：${note ?? "—"}`,
                }],
              }),
            });
          }
        } catch (e) { console.warn("[StatusFlow] LINE notify failed:", e); }
      });
    }

    // Return updated order
    const updated = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    res.json({ ok: true, order: updated.rows[0], newStatus });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: String(err) });
  } finally {
    client.release();
  }
});

// ── GET /api/exception-codes ──────────────────────────────────────────────
orderStatusFlowRouter.get("/exception-codes", (_req, res) => {
  res.json(EXCEPTION_CODES);
});

// ── GET /api/orders/:id/timeline ─────────────────────────────────────────
// Returns a clean timeline for display
orderStatusFlowRouter.get("/orders/:id/timeline", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [histRes, orderRes] = await Promise.all([
      pool.query(
        `SELECT from_status, to_status, actor, note, occurred_at
         FROM order_status_history WHERE order_id = $1 ORDER BY occurred_at ASC`,
        [id]
      ),
      pool.query(
        `SELECT id, status, created_at, driver_accepted_at, arrived_at, loaded_at,
                check_in_at, completed_at, exception_code, exception_note,
                exception_attribution, exception_at, pod_photo_url, pod_note,
                signature_photo_url, customer_name, pickup_address, delivery_address
         FROM orders WHERE id = $1`,
        [id]
      ),
    ]);

    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "訂單不存在" });

    const steps = [
      { status: "pending",    label: "待派車",   time: order.created_at,       icon: "clock" },
      { status: "assigned",   label: "已派車",   time: order.driver_accepted_at, icon: "truck" },
      { status: "arrived",    label: "司機到點", time: order.arrived_at,        icon: "map-pin" },
      { status: "loading",    label: "裝貨中",   time: order.loaded_at,         icon: "package" },
      { status: "in_transit", label: "配送中",   time: order.check_in_at,       icon: "navigation" },
      { status: "delivered",  label: "已完成",   time: order.completed_at,      icon: "check-circle" },
    ];

    const STEP_ORDER = ["pending","assigned","arrived","loading","in_transit","delivered"];
    const currentIdx = STEP_ORDER.indexOf(order.status);

    res.json({
      orderId: id,
      currentStatus: order.status,
      steps: steps.map((s, i) => ({
        ...s,
        done: i < currentIdx || order.status === s.status,
        active: order.status === s.status,
      })),
      exception: order.status === "exception" ? {
        code: order.exception_code,
        label: EXCEPTION_CODES[order.exception_code]?.label,
        note: order.exception_note,
        attribution: order.exception_attribution,
        at: order.exception_at,
      } : null,
      pod: {
        photo_url: order.pod_photo_url ?? order.signature_photo_url,
        note: order.pod_note,
        completed_at: order.completed_at,
      },
      history: histRes.rows,
      customerName: order.customer_name,
      pickup: order.pickup_address,
      delivery: order.delivery_address,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/exception-stats ──────────────────────────────────────────────
orderStatusFlowRouter.get("/exception-stats", async (req, res) => {
  try {
    const { date_from, date_to } = req.query as Record<string, string>;
    const params: string[] = [];
    const conds = ["exception_code IS NOT NULL"];
    if (date_from) { conds.push(`exception_at >= $${params.length+1}`); params.push(date_from); }
    if (date_to)   { conds.push(`exception_at < $${params.length+1}`);  params.push(date_to); }

    const { rows } = await pool.query(`
      SELECT
        exception_code,
        exception_attribution,
        COUNT(*)::int  AS count,
        COALESCE(SUM(total_fee), 0) AS revenue_at_risk
      FROM orders
      WHERE ${conds.join(" AND ")}
      GROUP BY exception_code, exception_attribution
      ORDER BY count DESC
    `, params);

    const enriched = rows.map(r => ({
      ...r,
      label: EXCEPTION_CODES[r.exception_code]?.label ?? r.exception_code,
    }));

    res.json(enriched);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
