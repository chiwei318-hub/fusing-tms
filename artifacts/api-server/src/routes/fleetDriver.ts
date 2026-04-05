/**
 * fleetDriver.ts
 * 司機手機端 API（供 FlutterFlow 對接）
 *
 * All routes require fleet driver JWT (requireFleetDriver middleware).
 * Data isolated per driver_id + franchisee_id.
 *
 * GET  /api/driver/profile            個人資料
 * PATCH /api/driver/location          更新 GPS 位置
 * PATCH /api/driver/status            更新狀態（available/offline）
 *
 * GET  /api/driver/orders             我的訂單列表
 * POST /api/driver/orders/:id/accept  接受訂單
 * POST /api/driver/orders/:id/start   開始配送
 * POST /api/driver/orders/:id/complete 完成訂單
 *
 * GET  /api/driver/leaves             我的請假紀錄
 * POST /api/driver/leaves             提交請假申請
 * DELETE /api/driver/leaves/:id       取消請假（pending 中）
 *
 * GET  /api/driver/standby            我的待命時段
 * POST /api/driver/standby            新增待命時段
 * DELETE /api/driver/standby/:id      刪除待命時段
 *
 * GET  /api/driver/salary             我的薪資紀錄
 * GET  /api/driver/salary/summary     月結摘要
 *
 * GET  /api/driver/available-routes   今日可搶班表路線（蝦皮未派車趟）
 * POST /api/driver/routes/:id/claim   搶單（自願接單，原子性）
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireFleetDriver } from "../middleware/fleetAuth";

export const fleetDriverRouter = Router();

// ══════════════════════════════════════════════════════════════════════════════
// 個人資料
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.get("/profile", async (req, res) => {
  const { driver_id, franchisee_id } = req.fleet!;
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.phone, d.vehicle_type, d.license_plate,
            d.status, d.commission_rate, d.latitude, d.longitude,
            d.last_location_at,
            f.name AS fleet_name, f.code AS fleet_code
     FROM drivers d
     JOIN franchisees f ON f.id = d.franchisee_id
     WHERE d.id=$1 AND d.franchisee_id=$2`,
    [driver_id, franchisee_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "找不到司機資料" });
  res.json({ ok: true, driver: rows[0] });
});

// ══════════════════════════════════════════════════════════════════════════════
// GPS 位置更新
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.patch("/location", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { latitude, longitude } = req.body ?? {};

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: "latitude 和 longitude 為必填" });
  }

  await pool.query(
    `UPDATE drivers
     SET latitude=$1, longitude=$2, last_location_at=NOW()
     WHERE id=$3`,
    [latitude, longitude, driver_id]
  );
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// 狀態更新
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.patch("/status", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { status } = req.body ?? {};

  if (!["available", "offline"].includes(status)) {
    return res.status(400).json({ error: "status 只能是 available 或 offline" });
  }

  await pool.query(
    `UPDATE drivers SET status=$1 WHERE id=$2`,
    [status, driver_id]
  );
  res.json({ ok: true, status });
});

// ══════════════════════════════════════════════════════════════════════════════
// 訂單
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.get("/orders", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { status, limit = 20, offset = 0 } = req.query;

  const filters = ["o.driver_id = $1"];
  const params: unknown[] = [driver_id];

  if (status) { params.push(status); filters.push(`o.status = $${params.length}`); }

  params.push(Number(limit), Number(offset));
  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.pickup_address, o.delivery_address,
            o.extra_delivery_addresses, o.cargo_description,
            o.customer_name, o.customer_phone,
            o.pickup_time, o.notes,
            o.created_at, o.updated_at
     FROM orders o
     WHERE ${filters.join(" AND ")}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ ok: true, orders: rows });
});

fleetDriverRouter.post("/orders/:id/accept", async (req, res) => {
  const { driver_id } = req.fleet!;
  const orderId = Number(req.params.id);

  const { rows } = await pool.query(
    `UPDATE orders SET status='accepted', updated_at=NOW()
     WHERE id=$1 AND driver_id=$2 AND status='assigned'
     RETURNING id, status`,
    [orderId, driver_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "訂單不存在或已處理" });
  res.json({ ok: true, order: rows[0] });
});

fleetDriverRouter.post("/orders/:id/start", async (req, res) => {
  const { driver_id } = req.fleet!;
  const orderId = Number(req.params.id);

  const { rows } = await pool.query(
    `UPDATE orders SET status='in_transit', updated_at=NOW()
     WHERE id=$1 AND driver_id=$2 AND status IN ('assigned','accepted')
     RETURNING id, status`,
    [orderId, driver_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "訂單不存在或狀態不符" });

  await pool.query(
    `UPDATE drivers SET status='busy' WHERE id=$1`,
    [driver_id]
  );
  res.json({ ok: true, order: rows[0] });
});

fleetDriverRouter.post("/orders/:id/complete", async (req, res) => {
  const { driver_id } = req.fleet!;
  const orderId = Number(req.params.id);
  const { photo_url, signature_url, notes } = req.body ?? {};

  const { rows } = await pool.query(
    `UPDATE orders SET
       status='delivered',
       actual_delivery_at=NOW(),
       delivery_notes=$1,
       updated_at=NOW()
     WHERE id=$2 AND driver_id=$3 AND status='in_transit'
     RETURNING id, status`,
    [notes ?? null, orderId, driver_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "訂單不存在或狀態不符" });

  // Check if driver has more active orders
  const remaining = await pool.query(
    `SELECT COUNT(*) AS cnt FROM orders WHERE driver_id=$1 AND status='in_transit'`,
    [driver_id]
  );
  if (Number(remaining.rows[0].cnt) === 0) {
    await pool.query(
      `UPDATE drivers SET status='available' WHERE id=$1`,
      [driver_id]
    );
  }

  res.json({ ok: true, order: rows[0] });
});

// ══════════════════════════════════════════════════════════════════════════════
// 請假
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.get("/leaves", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { rows } = await pool.query(
    `SELECT * FROM driver_leaves WHERE driver_id=$1
     ORDER BY leave_date DESC`,
    [driver_id]
  );
  res.json({ ok: true, leaves: rows });
});

fleetDriverRouter.post("/leaves", async (req, res) => {
  const { driver_id, franchisee_id } = req.fleet!;
  const { leave_date, leave_end_date = null, leave_type = "full_day", reason = null } = req.body ?? {};

  if (!leave_date) return res.status(400).json({ error: "leave_date 為必填" });

  // Check for duplicate
  const dup = await pool.query(
    `SELECT id FROM driver_leaves
     WHERE driver_id=$1 AND leave_date=$2 AND status NOT IN ('rejected','cancelled')`,
    [driver_id, leave_date]
  );
  if (dup.rows[0]) {
    return res.status(409).json({ error: "該日期已有請假申請" });
  }

  const { rows } = await pool.query(
    `INSERT INTO driver_leaves
       (driver_id, franchisee_id, leave_date, leave_end_date, leave_type, reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [driver_id, franchisee_id, leave_date, leave_end_date, leave_type, reason]
  );
  res.status(201).json({ ok: true, leave: rows[0] });
});

fleetDriverRouter.delete("/leaves/:id", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { rows } = await pool.query(
    `UPDATE driver_leaves SET status='cancelled'
     WHERE id=$1 AND driver_id=$2 AND status='pending'
     RETURNING id`,
    [Number(req.params.id), driver_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "申請不存在或已處理" });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// 待命時段
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.get("/standby", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { rows } = await pool.query(
    `SELECT * FROM driver_standby_slots WHERE driver_id=$1
     ORDER BY slot_date, start_time`,
    [driver_id]
  );
  res.json({ ok: true, slots: rows });
});

fleetDriverRouter.post("/standby", async (req, res) => {
  const { driver_id, franchisee_id } = req.fleet!;
  const {
    slot_date = null, weekday = null,
    start_time, end_time, is_recurring = false,
  } = req.body ?? {};

  if (!start_time || !end_time) {
    return res.status(400).json({ error: "start_time 和 end_time 為必填" });
  }

  const { rows } = await pool.query(
    `INSERT INTO driver_standby_slots
       (driver_id, franchisee_id, slot_date, weekday, start_time, end_time, is_recurring)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [driver_id, franchisee_id, slot_date, weekday, start_time, end_time, is_recurring]
  );
  res.status(201).json({ ok: true, slot: rows[0] });
});

fleetDriverRouter.delete("/standby/:id", async (req, res) => {
  await pool.query(
    `DELETE FROM driver_standby_slots WHERE id=$1 AND driver_id=$2`,
    [Number(req.params.id), req.fleet!.driver_id]
  );
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// 薪資
// ══════════════════════════════════════════════════════════════════════════════
fleetDriverRouter.get("/salary", async (req, res) => {
  const { driver_id } = req.fleet!;
  const { rows } = await pool.query(
    `SELECT period_year, period_month, total_orders, total_stops,
            gross_amount, commission_rate, driver_payout, status, settled_at
     FROM driver_salary_records WHERE driver_id=$1
     ORDER BY period_year DESC, period_month DESC
     LIMIT 24`,
    [driver_id]
  );
  res.json({ ok: true, records: rows });
});

fleetDriverRouter.get("/salary/summary", async (req, res) => {
  const { driver_id } = req.fleet!;
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  // This month's orders
  const orders = await pool.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(freight_amount),0)::numeric AS gross
     FROM orders
     WHERE driver_id=$1
       AND status IN ('completed','delivered')
       AND EXTRACT(YEAR FROM created_at)=$2
       AND EXTRACT(MONTH FROM created_at)=$3`,
    [driver_id, year, month]
  );

  // Salary record if exists
  const salary = await pool.query(
    `SELECT * FROM driver_salary_records
     WHERE driver_id=$1 AND period_year=$2 AND period_month=$3`,
    [driver_id, year, month]
  );

  res.json({
    ok: true,
    year, month,
    order_summary: orders.rows[0],
    salary_record: salary.rows[0] ?? null,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 今日可搶班表路線（司機自願接單）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/driver/available-routes
 * 列出今日尚未指派司機的蝦皮班表路線，供同車行司機搶單用
 */
fleetDriverRouter.get("/available-routes", async (req, res) => {
  const { franchisee_id } = req.fleet!;

  const { rows } = await pool.query(
    `SELECT
       o.id, o.route_id, o.route_prefix, o.station_count, o.dispatch_dock,
       o.required_vehicle_type, o.vehicle_type,
       o.pickup_address, o.pickup_time,
       o.created_at,
       pr.rate_per_trip AS shopee_rate
     FROM orders o
     LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
     WHERE o.route_id IS NOT NULL
       AND o.driver_id IS NULL
       AND (
         o.pickup_date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
         OR (o.pickup_date IS NULL AND DATE(o.created_at) = CURRENT_DATE)
       )
     ORDER BY o.pickup_time NULLS LAST, o.route_id`
  );

  res.json({ ok: true, routes: rows });
});

/**
 * POST /api/driver/routes/:id/claim
 * 司機搶單：將指定路線 order 指派給自己
 */
fleetDriverRouter.post("/routes/:id/claim", async (req, res) => {
  const { driver_id, franchisee_id } = req.fleet!;
  const orderId = Number(req.params.id);

  // 確認司機目前 available
  const driverRow = await pool.query(
    `SELECT status FROM drivers WHERE id=$1 AND franchisee_id=$2`,
    [driver_id, franchisee_id]
  );
  if (!driverRow.rows[0]) {
    return res.status(403).json({ error: "司機帳號不存在" });
  }
  if (driverRow.rows[0].status !== "available") {
    return res.status(400).json({ error: "您目前狀態非「待命」，無法搶單" });
  }

  // 原子性搶單：只有在 driver_id IS NULL 時才能搶到
  const { rows } = await pool.query(
    `UPDATE orders
     SET driver_id=$1, status='assigned', updated_at=NOW()
     WHERE id=$2
       AND route_id IS NOT NULL
       AND driver_id IS NULL
       AND (
         pickup_date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
         OR (pickup_date IS NULL AND DATE(created_at) = CURRENT_DATE)
       )
     RETURNING id, route_id, status`,
    [driver_id, orderId]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: "此車趟已被搶走或不存在，請重新整理" });
  }

  // 更新司機狀態為忙碌
  await pool.query(`UPDATE drivers SET status='busy' WHERE id=$1`, [driver_id]);

  res.json({ ok: true, order: rows[0] });
});
