/**
 * 推播通知 API
 * POST /api/notifications/send            批次推播
 * POST /api/notifications/trigger-daily   手動觸發今日班表推播
 * POST /api/notifications/trigger-expiry  手動觸發到期提醒
 * GET  /api/notifications/driver/:id      司機推播記錄
 * PATCH /api/notifications/:id/read       標記已讀
 * GET  /api/notifications/stats           推播統計
 * GET  /api/notifications                 全部列表（管理員）
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { sendBatchPush, PushPayload } from "../lib/pushNotification";
import { runDailySchedulePush, runExpiryReminders } from "../lib/scheduledNotifications";
import { triggerSheetCheck } from "../lib/sheetChangeWatcher";

export const notificationsRouter = Router();

// ─── POST /send — 批次推播 ────────────────────────────────────────────────────
notificationsRouter.post("/send", async (req, res) => {
  try {
    const {
      driver_ids,
      type       = "reminder",
      title,
      body,
      data,
      channel    = "both",
      line_user_ids,
    } = req.body as {
      driver_ids?: number[];
      type?: string;
      title: string;
      body: string;
      data?: Record<string, any>;
      channel?: string;
      line_user_ids?: string[];
    };

    if (!title || !body) {
      return res.status(400).json({ ok: false, error: "title、body 必填" });
    }

    let payloads: PushPayload[] = [];

    if (Array.isArray(driver_ids) && driver_ids.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, name, line_id, atoms_account, fleet_id
         FROM fleet_drivers WHERE id = ANY($1::int[])`,
        [driver_ids],
      );
      payloads = (rows as any[]).map(d => ({
        driverId: d.id, driverName: d.name, fleetId: d.fleet_id,
        channel: channel as any, type: type as any,
        title, body, data,
        lineUserId: d.line_id, atomsAccount: d.atoms_account,
      }));
    } else if (Array.isArray(line_user_ids) && line_user_ids.length > 0) {
      // Direct LINE push by user IDs (for manager/admin notifications)
      payloads = line_user_ids.map(uid => ({
        channel: "line" as const, type: type as any,
        title, body, data,
        lineUserId: uid,
      }));
    } else {
      // Broadcast to all active drivers with push channels
      const { rows } = await pool.query(
        `SELECT id, name, line_id, atoms_account, fleet_id
         FROM fleet_drivers
         WHERE is_active = TRUE
           AND (line_id IS NOT NULL OR atoms_account IS NOT NULL)`,
      );
      payloads = (rows as any[]).map(d => ({
        driverId: d.id, driverName: d.name, fleetId: d.fleet_id,
        channel: channel as any, type: type as any,
        title, body, data,
        lineUserId: d.line_id, atomsAccount: d.atoms_account,
      }));
    }

    if (payloads.length === 0) {
      return res.json({ ok: true, sent: 0, failed: 0, results: [], reason: "無可推播的目標" });
    }

    const result = await sendBatchPush(payloads);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /trigger-daily — 手動觸發今日 07:00 班表推播 ───────────────────────
notificationsRouter.post("/trigger-daily", async (_req, res) => {
  try {
    // Reset dedup flag so it always runs when manually triggered
    (runDailySchedulePush as any)._forceRun = true;
    await runDailySchedulePush();
    res.json({ ok: true, message: "今日班表推播已觸發" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /trigger-expiry — 手動觸發到期提醒 ─────────────────────────────────
notificationsRouter.post("/trigger-expiry", async (_req, res) => {
  try {
    await runExpiryReminders();
    res.json({ ok: true, message: "到期提醒推播已觸發" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /trigger-sheet-check — 手動觸發班表異動偵測 ─────────────────────────
notificationsRouter.post("/trigger-sheet-check", async (_req, res) => {
  try {
    const result = await triggerSheetCheck();
    res.json({ ok: true, message: "班表異動偵測已觸發", ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /route-confirmations — 路線確認狀態（車主查看） ─────────────────────
notificationsRouter.get("/route-confirmations", async (req, res) => {
  try {
    const { date, fleet_id } = req.query as Record<string, string>;
    if (!date) return res.status(400).json({ ok: false, error: "date 必填（YYYY-MM-DD）" });

    const fleetFilter = fleet_id ? `AND fd.fleet_id = ${Number(fleet_id)}` : "";

    // Get all drivers in the fleet(s) and their confirmation status for the date
    const { rows } = await pool.query(`
      SELECT
        fd.id            AS driver_id,
        fd.name          AS driver_name,
        fd.employee_id,
        fd.vehicle_plate,
        fd.line_id,
        f.fleet_name,
        -- Latest push notification for this driver on this date
        n.id             AS notification_id,
        n.type           AS notification_type,
        n.title,
        n.sent_at,
        n.confirmed_at,
        n.read_at,
        n.status         AS notification_status,
        n.line_status,
        n.atoms_status,
        -- Route info from dispatch
        r.route_label,
        r.assigned_at
      FROM fleet_drivers fd
      JOIN fusingao_fleets f ON f.id = fd.fleet_id
      LEFT JOIN LATERAL (
        SELECT * FROM push_notifications pn
        WHERE pn.driver_id = fd.id
          AND pn.type IN ('task', 'schedule_change')
          AND pn.sent_at::date >= ($1::date - INTERVAL '1 day')
          AND pn.sent_at::date <= $1::date
        ORDER BY pn.sent_at DESC
        LIMIT 1
      ) n ON TRUE
      LEFT JOIN dispatch_order_routes r
        ON r.assigned_driver_id = fd.id AND r.route_date = $1
      WHERE fd.is_active = TRUE
        ${fleetFilter}
      ORDER BY f.fleet_name, fd.name
    `, [date]);

    // Compute summary
    const total       = rows.length;
    const pushed      = rows.filter((r: any) => r.notification_id).length;
    const confirmed   = rows.filter((r: any) => r.confirmed_at).length;
    const unconfirmed = pushed - confirmed;

    res.json({
      ok: true,
      date,
      summary: { total, pushed, confirmed, unconfirmed },
      drivers: rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /driver/:driverId — 司機推播記錄 ────────────────────────────────────
notificationsRouter.get("/driver/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    const limit    = Math.min(Number(req.query.limit  ?? 50), 200);
    const offset   = Number(req.query.offset ?? 0);
    const { rows } = await pool.query(
      `SELECT * FROM push_notifications
       WHERE driver_id = $1
       ORDER BY sent_at DESC
       LIMIT $2 OFFSET $3`,
      [driverId, limit, offset],
    );
    const { rows: [cnt] } = await pool.query(
      `SELECT COUNT(*) FROM push_notifications WHERE driver_id = $1`,
      [driverId],
    );
    res.json({ ok: true, notifications: rows, total: Number(cnt.count) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /:id/read — 標記已讀 ─────────────────────────────────────────────
notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE push_notifications
       SET read_at = NOW(), status = 'read'
       WHERE id = $1 AND read_at IS NULL
       RETURNING id, read_at`,
      [id],
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "通知不存在或已讀" });
    }
    res.json({ ok: true, ...rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /stats — 推播統計 ────────────────────────────────────────────────────
notificationsRouter.get("/stats", async (req, res) => {
  try {
    const period = String(req.query.period ?? "7d");
    const days   = period === "30d" ? 30 : period === "1d" ? 1 : 7;

    const { rows: [s] } = await pool.query(`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE status IN ('sent','read'))                     AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')                             AS failed,
        COUNT(*) FILTER (WHERE status = 'read')                               AS read_count,
        COUNT(*) FILTER (WHERE line_status  = 'sent')                         AS line_sent,
        COUNT(*) FILTER (WHERE atoms_status = 'sent')                         AS atoms_sent,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'read')
          / NULLIF(COUNT(*) FILTER (WHERE status IN ('sent','read')), 0), 1
        )                                                                     AS read_rate,
        COUNT(*) FILTER (WHERE sent_at >= NOW() - ($1 || ' days')::interval)  AS period_total,
        COUNT(*) FILTER (WHERE sent_at >= NOW() - ($1 || ' days')::interval
                           AND status IN ('sent','read'))                     AS period_sent,
        COUNT(*) FILTER (WHERE sent_at >= NOW() - ($1 || ' days')::interval
                           AND line_status = 'sent')                          AS period_line_sent,
        COUNT(*) FILTER (WHERE sent_at >= NOW() - ($1 || ' days')::interval
                           AND atoms_status = 'sent')                         AS period_atoms_sent
      FROM push_notifications
    `, [days]);

    const { rows: byType } = await pool.query(`
      SELECT type, COUNT(*) AS count,
             COUNT(*) FILTER (WHERE status IN ('sent','read')) AS sent
      FROM push_notifications
      WHERE sent_at >= NOW() - ($1 || ' days')::interval
      GROUP BY type ORDER BY count DESC
    `, [days]);

    res.json({ ok: true, period, stats: s, by_type: byType });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET / — 全部列表（管理員用） ────────────────────────────────────────────
notificationsRouter.get("/", async (req, res) => {
  try {
    const { type, status, driver_id } = req.query as Record<string, string>;
    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);

    const filters: string[] = ["1=1"];
    const params: any[] = [];

    if (type) {
      params.push(type);
      filters.push(`n.type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      filters.push(`n.status = $${params.length}`);
    }
    if (driver_id) {
      params.push(Number(driver_id));
      filters.push(`n.driver_id = $${params.length}`);
    }
    const where = filters.join(" AND ");

    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(
      `SELECT n.*, fd.name AS driver_display_name
       FROM push_notifications n
       LEFT JOIN fleet_drivers fd ON fd.id = n.driver_id
       WHERE ${where}
       ORDER BY n.sent_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, -2);
    const { rows: [cnt] } = await pool.query(
      `SELECT COUNT(*) FROM push_notifications n WHERE ${where}`,
      countParams,
    );

    res.json({ ok: true, notifications: rows, total: Number(cnt.count) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
