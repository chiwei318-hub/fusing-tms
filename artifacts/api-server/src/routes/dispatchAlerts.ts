import { Router } from "express";
import { pool } from "@workspace/db";

export const dispatchAlertsRouter = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_alerts (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dispatch_alerts_order ON dispatch_alerts(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dispatch_alerts_ack ON dispatch_alerts(is_acknowledged)`);
}

ensureTable().catch(console.error);

export async function runAlertScan() {
  const now = new Date();

  const [existingRows, overdueUnassigned, overduePickup, overdueDelivery] = await Promise.all([
    pool.query<{ order_id: number; alert_type: string }>(
      `SELECT order_id, alert_type FROM dispatch_alerts WHERE is_acknowledged = FALSE`
    ),
    pool.query<{ id: number; pickup_date: string; pickup_time: string; customer_name: string; pickup_address: string }>(
      `SELECT o.id, o.pickup_date, o.pickup_time, o.customer_name, o.pickup_address
       FROM orders o
       WHERE o.status = 'pending'
         AND o.pickup_date IS NOT NULL AND o.pickup_date != ''
         AND o.pickup_time IS NOT NULL AND o.pickup_time != ''
         AND (o.pickup_date || ' ' || o.pickup_time)::timestamptz < NOW() - INTERVAL '30 minutes'
         AND o.driver_id IS NULL`
    ),
    pool.query<{ id: number; pickup_date: string; pickup_time: string; driver_name: string; pickup_address: string }>(
      `SELECT o.id, o.pickup_date, o.pickup_time, d.name AS driver_name, o.pickup_address
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.status = 'assigned'
         AND o.pickup_date IS NOT NULL AND o.pickup_date != ''
         AND o.pickup_time IS NOT NULL AND o.pickup_time != ''
         AND (o.pickup_date || ' ' || o.pickup_time)::timestamptz < NOW() - INTERVAL '60 minutes'`
    ),
    pool.query<{ id: number; delivery_date: string; delivery_time: string; driver_name: string; delivery_address: string }>(
      `SELECT o.id, o.delivery_date, o.delivery_time, d.name AS driver_name, o.delivery_address
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.status = 'in_transit'
         AND o.delivery_date IS NOT NULL AND o.delivery_date != ''
         AND o.delivery_time IS NOT NULL AND o.delivery_time != ''
         AND (o.delivery_date || ' ' || o.delivery_time)::timestamptz < NOW() - INTERVAL '60 minutes'`
    ),
  ]);

  const existing = new Set(existingRows.rows.map(r => `${r.order_id}:${r.alert_type}`));

  const inserts: { orderId: number; alertType: string; message: string }[] = [];

  for (const row of overdueUnassigned.rows) {
    const key = `${row.id}:unassigned_overdue`;
    if (!existing.has(key)) {
      inserts.push({
        orderId: row.id,
        alertType: "unassigned_overdue",
        message: `訂單 #${row.id}（${row.customer_name ?? "客戶"}）預定取貨時間已過 30 分鐘，尚未派車！取貨地址：${row.pickup_address ?? "—"}`,
      });
    }
  }

  for (const row of overduePickup.rows) {
    const key = `${row.id}:pickup_overdue`;
    if (!existing.has(key)) {
      inserts.push({
        orderId: row.id,
        alertType: "pickup_overdue",
        message: `訂單 #${row.id} 司機 ${row.driver_name ?? "—"} 超過預定取貨時間 60 分鐘，尚未取貨！地址：${row.pickup_address ?? "—"}`,
      });
    }
  }

  for (const row of overdueDelivery.rows) {
    const key = `${row.id}:delivery_overdue`;
    if (!existing.has(key)) {
      inserts.push({
        orderId: row.id,
        alertType: "delivery_overdue",
        message: `訂單 #${row.id} 司機 ${row.driver_name ?? "—"} 超過預定送達時間 60 分鐘，貨物尚未完成！送達地址：${row.delivery_address ?? "—"}`,
      });
    }
  }

  if (inserts.length > 0) {
    await Promise.all(
      inserts.map(ins =>
        pool.query(
          `INSERT INTO dispatch_alerts (order_id, alert_type, message) VALUES ($1, $2, $3)`,
          [ins.orderId, ins.alertType, ins.message]
        )
      )
    );
    console.log(`[AlertScan] Inserted ${inserts.length} new alert(s) at ${now.toISOString()}`);
  }
}

dispatchAlertsRouter.get("/dispatch-alerts", async (_req, res) => {
  try {
    const result = await pool.query<{
      id: number;
      order_id: number;
      alert_type: string;
      message: string;
      triggered_at: string;
      is_acknowledged: boolean;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
    }>(
      `SELECT * FROM dispatch_alerts ORDER BY is_acknowledged ASC, triggered_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

dispatchAlertsRouter.get("/dispatch-alerts/unread-count", async (_req, res) => {
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM dispatch_alerts WHERE is_acknowledged = FALSE`
    );
    res.json({ count: parseInt(result.rows[0]?.count ?? "0") });
  } catch (err) {
    res.status(500).json({ error: "Failed to count" });
  }
});

dispatchAlertsRouter.patch("/dispatch-alerts/:id/acknowledge", async (req, res) => {
  try {
    const { id } = req.params;
    const { by } = req.body as { by?: string };
    await pool.query(
      `UPDATE dispatch_alerts SET is_acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $1 WHERE id = $2`,
      [by ?? "admin", id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge" });
  }
});

dispatchAlertsRouter.patch("/dispatch-alerts/acknowledge-all", async (req, res) => {
  try {
    const { by } = req.body as { by?: string };
    await pool.query(
      `UPDATE dispatch_alerts SET is_acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $1 WHERE is_acknowledged = FALSE`,
      [by ?? "admin"]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge all" });
  }
});

dispatchAlertsRouter.post("/dispatch-alerts/scan", async (_req, res) => {
  try {
    await runAlertScan();
    res.json({ ok: true, scannedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("[dispatchAlerts scan]", err);
    res.status(500).json({ error: "Scan failed", detail: String(err?.message ?? err) });
  }
});
