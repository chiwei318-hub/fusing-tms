/**
 * fleetOwner.ts
 * 加盟車行老闆後台 API
 *
 * All routes require fleet owner JWT (requireFleetOwner middleware).
 * Data is strictly isolated per franchisee_id.
 *
 * GET  /api/fleet/me                         車行資訊
 * PATCH /api/fleet/me                        更新車行資訊
 *
 * GET  /api/fleet/drivers                    旗下司機列表
 * POST /api/fleet/drivers                    新增司機
 * PATCH /api/fleet/drivers/:id               更新司機
 * DELETE /api/fleet/drivers/:id              停用司機
 * GET  /api/fleet/drivers/:id/location       司機即時位置
 *
 * GET  /api/fleet/dashboard                  即時調度牆（所有司機位置+狀態）
 *
 * GET  /api/fleet/orders                     車行接單列表
 * POST /api/fleet/orders/:id/assign          指派訂單給旗下司機
 *
 * GET  /api/fleet/pricing                    計費規則列表
 * POST /api/fleet/pricing                    新增計費規則
 * PATCH /api/fleet/pricing/:id               更新計費規則
 * DELETE /api/fleet/pricing/:id              刪除計費規則
 * POST /api/fleet/pricing/calculate          試算費用
 *
 * GET  /api/fleet/leaves                     請假申請列表
 * POST /api/fleet/leaves/:id/approve         核准請假
 * POST /api/fleet/leaves/:id/reject          拒絕請假
 *
 * GET  /api/fleet/salary                     薪資清算列表
 * POST /api/fleet/salary/calculate           計算當月薪資
 * POST /api/fleet/salary/settle              結算（標記已付）
 * GET  /api/fleet/salary/report              利潤報表
 *
 * GET  /api/fleet/standby                    待命時段列表
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { createHash, randomBytes } from "crypto";
import { requireFleetOwner } from "../middleware/fleetAuth";
import ExcelJS from "exceljs";
import { runFleetSheetSync } from "../lib/fleetSheetSync";

export const fleetOwnerRouter = Router();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 車行資訊
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/me", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, owner_name, phone, email, address,
            commission_rate, platform_commission_rate, status,
            zone_name, notes, joined_at
     FROM franchisees WHERE id = $1`,
    [req.fleet!.franchisee_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "車行不存在" });
  res.json({ ok: true, fleet: rows[0] });
});

fleetOwnerRouter.patch("/me", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const allowed = ["name", "owner_name", "phone", "email", "address", "notes"];
  const updates: string[] = [];
  const vals: unknown[] = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (req.body.password) {
    vals.push(hashPassword(req.body.password));
    updates.push(`password_hash = $${vals.length}`);
  }
  if (vals.length === 0) return res.status(400).json({ error: "無可更新欄位" });

  vals.push(fid);
  const { rows } = await pool.query(
    `UPDATE franchisees SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING
       id, code, name, owner_name, phone, email, address, commission_rate, status`,
    vals
  );
  res.json({ ok: true, fleet: rows[0] });
});

// ══════════════════════════════════════════════════════════════════════════════
// 司機管理
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/drivers", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.phone, d.vehicle_type, d.license_plate,
            d.status, d.commission_rate, d.engine_cc, d.tonnage,
            d.latitude, d.longitude, d.last_location_at,
            d.username, d.created_at,
            d.id_no, d.insurance_expiry, d.inspection_date,
            d.bank_code, d.bank_account, d.referrer,
            COUNT(DISTINCT dl.id) FILTER (WHERE dl.status='pending') AS pending_leaves
     FROM drivers d
     LEFT JOIN driver_leaves dl ON dl.driver_id = d.id
     WHERE d.franchisee_id = $1
     GROUP BY d.id
     ORDER BY d.name`,
    [fid]
  );
  res.json({ ok: true, drivers: rows });
});

fleetOwnerRouter.post("/drivers", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const {
    name, phone, vehicle_type, license_plate,
    username, password,
    engine_cc = null, tonnage = null,
    commission_rate,
    id_no = null, insurance_expiry = null, inspection_date = null,
    bank_code = null, bank_account = null, referrer = null,
  } = req.body ?? {};

  if (!name || !phone || !username || !password) {
    return res.status(400).json({ error: "name、phone、username、password 為必填" });
  }

  // Get fleet default commission_rate if not specified
  let driverRate = commission_rate;
  if (driverRate === undefined) {
    const fl = await pool.query(`SELECT commission_rate FROM franchisees WHERE id=$1`, [fid]);
    driverRate = fl.rows[0]?.commission_rate ?? 70;
  }

  const passwordHash = hashPassword(password);

  const { rows } = await pool.query(
    `INSERT INTO drivers
       (name, phone, vehicle_type, license_plate, username, password,
        engine_cc, tonnage, commission_rate, franchisee_id, status, created_at,
        id_no, insurance_expiry, inspection_date, bank_code, bank_account, referrer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'available',NOW(),$11,$12,$13,$14,$15,$16)
     RETURNING id, name, phone, vehicle_type, license_plate, username, status, commission_rate,
               id_no, insurance_expiry, inspection_date, bank_code, bank_account, referrer`,
    [name, phone, vehicle_type ?? "小貨車", license_plate, username, passwordHash,
     engine_cc, tonnage, driverRate, fid,
     id_no, insurance_expiry || null, inspection_date || null, bank_code, bank_account, referrer]
  );
  res.status(201).json({ ok: true, driver: rows[0] });
});

fleetOwnerRouter.patch("/drivers/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const did = Number(req.params.id);

  const allowed = [
    "name", "phone", "vehicle_type", "license_plate",
    "engine_cc", "tonnage", "commission_rate", "status",
    "id_no", "insurance_expiry", "inspection_date",
    "bank_code", "bank_account", "referrer",
  ];
  const updates: string[] = [];
  const vals: unknown[] = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (req.body.password) {
    vals.push(hashPassword(req.body.password));
    updates.push(`password = $${vals.length}`);
  }
  if (vals.length === 0) return res.status(400).json({ error: "無可更新欄位" });

  vals.push(did, fid);
  const { rows } = await pool.query(
    `UPDATE drivers SET ${updates.join(", ")}
     WHERE id = $${vals.length - 1} AND franchisee_id = $${vals.length}
     RETURNING id, name, phone, status, commission_rate`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "司機不存在或不屬於本車行" });
  res.json({ ok: true, driver: rows[0] });
});

fleetOwnerRouter.delete("/drivers/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  await pool.query(
    `UPDATE drivers SET status='offline'
     WHERE id=$1 AND franchisee_id=$2`,
    [Number(req.params.id), fid]
  );
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// 即時調度牆 — 所有司機位置 + 狀態
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/dashboard", async (req, res) => {
  const fid = req.fleet!.franchisee_id;

  const drivers = await pool.query(
    `SELECT d.id, d.name, d.phone, d.vehicle_type, d.license_plate,
            d.status, d.latitude, d.longitude, d.last_location_at,
            (SELECT COUNT(*) FROM driver_leaves dl
             WHERE dl.driver_id=d.id AND dl.status='approved'
               AND dl.leave_date = CURRENT_DATE) > 0 AS on_leave_today
     FROM drivers d
     WHERE d.franchisee_id = $1
     ORDER BY d.name`,
    [fid]
  );

  const orders = await pool.query(
    `SELECT o.id, o.status, o.pickup_address, o.delivery_address,
            o.driver_id, d.name AS driver_name
     FROM orders o
     JOIN drivers d ON d.id = o.driver_id
     WHERE d.franchisee_id = $1 AND o.status IN ('assigned','in_transit')
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [fid]
  );

  const leaves = await pool.query(
    `SELECT dl.*, d.name AS driver_name
     FROM driver_leaves dl
     JOIN drivers d ON d.id = dl.driver_id
     WHERE dl.franchisee_id = $1 AND dl.status = 'pending'
     ORDER BY dl.leave_date`,
    [fid]
  );

  // 今日蝦皮未派車趟：route_id 不為空（蝦皮路線）、driver_id 為空（尚未指派司機）
  // 包含今日建立 或 pickup_date = 今日
  const todayRoutes = await pool.query(
    `SELECT
       o.id, o.route_id, o.route_prefix, o.station_count, o.dispatch_dock,
       o.required_vehicle_type, o.vehicle_type,
       o.pickup_address, o.pickup_time,
       o.created_at, o.notes,
       pr.rate_per_trip AS shopee_rate,
       pr.service_type, pr.route_od
     FROM orders o
     LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
     WHERE o.route_id IS NOT NULL
       AND o.driver_id IS NULL
       AND (
         o.pickup_date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
         OR (o.pickup_date IS NULL AND DATE(o.created_at) = CURRENT_DATE)
       )
     ORDER BY o.route_id`
  );

  // 待派班表車趟：fleet_trips status='pending' driver_id IS NULL，不限日期（顯示所有待指派）
  const todayTrips = await pool.query(
    `SELECT
       t.id, t.notes, t.pickup_address, t.delivery_address,
       t.trip_date, t.amount, t.status, t.customer_name
     FROM fleet_trips t
     WHERE t.franchisee_id = $1
       AND t.driver_id IS NULL
       AND t.status = 'pending'
     ORDER BY t.trip_date DESC, t.id DESC
     LIMIT 50`,
    [fid]
  );

  res.json({
    ok: true,
    drivers: drivers.rows,
    active_orders: orders.rows,
    pending_leaves: leaves.rows,
    today_unassigned_routes: todayRoutes.rows,
    today_unassigned_trips: todayTrips.rows,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 訂單調度
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/orders", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { status, limit = 50, offset = 0 } = req.query;

  const statusFilter = status ? `AND o.status = $2` : "";
  const params: unknown[] = [fid];
  if (status) params.push(status);
  params.push(Number(limit), Number(offset));

  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.pickup_address, o.delivery_address,
            o.cargo_description, o.required_vehicle_type,
            o.customer_name, o.pickup_time,
            o.driver_id, d.name AS driver_name,
            o.created_at, o.updated_at
     FROM orders o
     LEFT JOIN drivers d ON d.id = o.driver_id
     WHERE (o.driver_id IS NULL OR d.franchisee_id = $1)
       AND o.status NOT IN ('cancelled','completed_settled')
       ${statusFilter}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ ok: true, orders: rows });
});

fleetOwnerRouter.post("/orders/:orderId/assign", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const orderId = Number(req.params.orderId);
  const { driver_id } = req.body ?? {};

  if (!driver_id) return res.status(400).json({ error: "driver_id 為必填" });

  // Verify driver belongs to this fleet
  const driverCheck = await pool.query(
    `SELECT id FROM drivers WHERE id=$1 AND franchisee_id=$2 AND status='available'`,
    [driver_id, fid]
  );
  if (!driverCheck.rows[0]) {
    return res.status(400).json({ error: "司機不存在、不屬於本車行，或目前不在線" });
  }

  const { rows } = await pool.query(
    `UPDATE orders SET driver_id=$1, status='assigned', updated_at=NOW()
     WHERE id=$2 AND (driver_id IS NULL OR driver_id=$1)
     RETURNING id, status, driver_id`,
    [driver_id, orderId]
  );
  if (!rows[0]) return res.status(409).json({ error: "訂單已被指派或不存在" });

  // Set driver busy
  await pool.query(
    `UPDATE drivers SET status='busy' WHERE id=$1`,
    [driver_id]
  );

  res.json({ ok: true, order: rows[0] });
});

// ══════════════════════════════════════════════════════════════════════════════
// 計費規則
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/pricing", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM fleet_pricing_rules WHERE franchisee_id=$1 ORDER BY vehicle_type, name`,
    [req.fleet!.franchisee_id]
  );
  res.json({ ok: true, rules: rows });
});

fleetOwnerRouter.post("/pricing", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const {
    name, vehicle_type = null, base_fee = 0,
    per_km_rate = 0, per_stop_rate = 0, min_fee = 0,
    driver_ratio = 70, notes = null,
  } = req.body ?? {};

  if (!name) return res.status(400).json({ error: "name 為必填" });
  if (driver_ratio < 0 || driver_ratio > 100) {
    return res.status(400).json({ error: "driver_ratio 必須在 0~100 之間" });
  }

  const { rows } = await pool.query(
    `INSERT INTO fleet_pricing_rules
       (franchisee_id, name, vehicle_type, base_fee, per_km_rate,
        per_stop_rate, min_fee, driver_ratio, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [fid, name, vehicle_type, base_fee, per_km_rate, per_stop_rate, min_fee, driver_ratio, notes]
  );
  res.status(201).json({ ok: true, rule: rows[0] });
});

fleetOwnerRouter.patch("/pricing/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const allowed = [
    "name", "vehicle_type", "base_fee", "per_km_rate",
    "per_stop_rate", "min_fee", "driver_ratio", "notes", "is_active",
  ];
  const updates: string[] = [];
  const vals: unknown[] = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (vals.length === 0) return res.status(400).json({ error: "無可更新欄位" });

  vals.push(Number(req.params.id), fid);
  const { rows } = await pool.query(
    `UPDATE fleet_pricing_rules SET ${updates.join(", ")}
     WHERE id=$${vals.length - 1} AND franchisee_id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "計費規則不存在" });
  res.json({ ok: true, rule: rows[0] });
});

fleetOwnerRouter.delete("/pricing/:id", async (req, res) => {
  await pool.query(
    `UPDATE fleet_pricing_rules SET is_active=false WHERE id=$1 AND franchisee_id=$2`,
    [Number(req.params.id), req.fleet!.franchisee_id]
  );
  res.json({ ok: true });
});

// 蝦皮費率列表（讀取全域 route_prefix_rates，供匯入用）
fleetOwnerRouter.get("/pricing/shopee-rates", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT prefix, description, service_type, route_od, vehicle_type,
            rate_per_trip, driver_pay_rate, notes
     FROM route_prefix_rates ORDER BY prefix`
  );
  res.json({ ok: true, rates: rows });
});

// 從蝦皮費率批次匯入計費規則
fleetOwnerRouter.post("/pricing/import-shopee", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { prefixes } = req.body as { prefixes: string[] };
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    return res.status(400).json({ error: "prefixes 為必填" });
  }

  const { rows: rates } = await pool.query(
    `SELECT * FROM route_prefix_rates WHERE prefix = ANY($1::text[])`,
    [prefixes]
  );

  let imported = 0;
  for (const r of rates) {
    const name = `蝦皮${r.prefix} - ${r.description ?? r.service_type ?? r.prefix}`;
    const baseFee = Number(r.rate_per_trip ?? 0);
    const driverPay = Number(r.driver_pay_rate ?? 0);
    const driverRatio = baseFee > 0 && driverPay > 0
      ? Math.min(100, Math.round((driverPay / baseFee) * 100))
      : 70;
    const notesStr = [r.service_type, r.route_od, r.notes].filter(Boolean).join(" | ");

    await pool.query(
      `INSERT INTO fleet_pricing_rules
         (franchisee_id, name, vehicle_type, base_fee, per_km_rate,
          per_stop_rate, min_fee, driver_ratio, notes)
       VALUES ($1,$2,$3,$4,0,0,$4,$5,$6)`,
      [fid, name, r.vehicle_type ?? "大貨車", baseFee, driverRatio, notesStr || null]
    );
    imported++;
  }
  res.json({ ok: true, imported });
});

// 試算費用
fleetOwnerRouter.post("/pricing/calculate", async (req, res) => {
  const { rule_id, distance_km = 0, stops = 1 } = req.body ?? {};

  let rule: Record<string, number> | null = null;

  if (rule_id) {
    const { rows } = await pool.query(
      `SELECT * FROM fleet_pricing_rules WHERE id=$1 AND franchisee_id=$2 AND is_active=true`,
      [rule_id, req.fleet!.franchisee_id]
    );
    rule = rows[0] ?? null;
  }

  if (!rule) {
    // Fallback to fleet's default commission_rate
    const fl = await pool.query(
      `SELECT commission_rate FROM franchisees WHERE id=$1`,
      [req.fleet!.franchisee_id]
    );
    rule = {
      base_fee: 0, per_km_rate: 0, per_stop_rate: 0,
      min_fee: 0, driver_ratio: fl.rows[0]?.commission_rate ?? 70,
    };
  }

  const gross = Math.max(
    Number(rule.base_fee) +
    Number(rule.per_km_rate) * Number(distance_km) +
    Number(rule.per_stop_rate) * Number(stops),
    Number(rule.min_fee)
  );

  const driverPayout = parseFloat((gross * Number(rule.driver_ratio) / 100).toFixed(2));
  const fleetIncome  = parseFloat((gross - driverPayout).toFixed(2));

  res.json({
    ok: true,
    gross_amount: gross,
    driver_payout: driverPayout,
    fleet_income: fleetIncome,
    driver_ratio: rule.driver_ratio,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 請假管理
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/leaves", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { status, driver_id } = req.query;

  const filters: string[] = ["dl.franchisee_id = $1"];
  const params: unknown[] = [fid];

  if (status) { params.push(status); filters.push(`dl.status = $${params.length}`); }
  if (driver_id) { params.push(Number(driver_id)); filters.push(`dl.driver_id = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT dl.*, d.name AS driver_name, d.phone AS driver_phone
     FROM driver_leaves dl
     JOIN drivers d ON d.id = dl.driver_id
     WHERE ${filters.join(" AND ")}
     ORDER BY dl.leave_date DESC, dl.created_at DESC`,
    params
  );
  res.json({ ok: true, leaves: rows });
});

fleetOwnerRouter.post("/leaves/:id/approve", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { rows } = await pool.query(
    `UPDATE driver_leaves
     SET status='approved', reviewed_at=NOW(), review_note=$1
     WHERE id=$2 AND franchisee_id=$3 AND status='pending'
     RETURNING *`,
    [req.body?.note ?? null, Number(req.params.id), fid]
  );
  if (!rows[0]) return res.status(404).json({ error: "申請不存在或已處理" });
  res.json({ ok: true, leave: rows[0] });
});

fleetOwnerRouter.post("/leaves/:id/reject", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { rows } = await pool.query(
    `UPDATE driver_leaves
     SET status='rejected', reviewed_at=NOW(), review_note=$1
     WHERE id=$2 AND franchisee_id=$3 AND status='pending'
     RETURNING *`,
    [req.body?.note ?? null, Number(req.params.id), fid]
  );
  if (!rows[0]) return res.status(404).json({ error: "申請不存在或已處理" });
  res.json({ ok: true, leave: rows[0] });
});

// ══════════════════════════════════════════════════════════════════════════════
// 薪資清算
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/salary", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  const { rows } = await pool.query(
    `SELECT s.*, d.name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.license_plate
     FROM driver_salary_records s
     JOIN drivers d ON d.id = s.driver_id
     WHERE s.franchisee_id=$1 AND s.period_year=$2 AND s.period_month=$3
     ORDER BY d.name`,
    [fid, year, month]
  );
  res.json({ ok: true, records: rows });
});

// 計算薪資（依訂單資料產生草稿）
fleetOwnerRouter.post("/salary/calculate", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const year  = Number(req.body?.year  ?? new Date().getFullYear());
  const month = Number(req.body?.month ?? new Date().getMonth() + 1);

  // Get fleet default commission_rate
  const flRow = await pool.query(
    `SELECT commission_rate, platform_commission_rate FROM franchisees WHERE id=$1`,
    [fid]
  );
  const fleetCommission = Number(flRow.rows[0]?.commission_rate ?? 70);
  const platformRate    = Number(flRow.rows[0]?.platform_commission_rate ?? 10);

  // Aggregate orders per driver this month
  const orderStats = await pool.query(
    `SELECT
       o.driver_id,
       COUNT(*)::int             AS total_orders,
       COALESCE(SUM(CASE WHEN o.extra_delivery_addresses IS NOT NULL
         THEN json_array_length(o.extra_delivery_addresses::json) + 1
         ELSE 1 END), 0)::int   AS total_stops,
       COALESCE(SUM(o.freight_amount), 0)::numeric AS gross_amount
     FROM orders o
     JOIN drivers d ON d.id = o.driver_id
     WHERE d.franchisee_id = $1
       AND o.status IN ('completed','delivered')
       AND EXTRACT(YEAR  FROM o.created_at) = $2
       AND EXTRACT(MONTH FROM o.created_at) = $3
     GROUP BY o.driver_id`,
    [fid, year, month]
  );

  const created: unknown[] = [];
  for (const stat of orderStats.rows) {
    const driverRow = await pool.query(
      `SELECT commission_rate FROM drivers WHERE id=$1`,
      [stat.driver_id]
    );
    const driverRate  = Number(driverRow.rows[0]?.commission_rate ?? fleetCommission);
    const gross       = Number(stat.gross_amount);
    const driverPayout = parseFloat((gross * driverRate / 100).toFixed(2));
    const platformFee  = parseFloat((gross * platformRate / 100).toFixed(2));
    const fleetIncome  = parseFloat((gross - driverPayout - platformFee).toFixed(2));

    const { rows } = await pool.query(
      `INSERT INTO driver_salary_records
         (driver_id, franchisee_id, period_type, period_year, period_month,
          total_orders, total_stops, gross_amount, commission_rate,
          driver_payout, fleet_income, platform_fee, status, created_at, updated_at)
       VALUES ($1,$2,'monthly',$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',NOW(),NOW())
       ON CONFLICT (driver_id, period_type, period_year, period_month)
       DO UPDATE SET
         total_orders=$5, total_stops=$6, gross_amount=$7,
         driver_payout=$9, fleet_income=$10, platform_fee=$11,
         updated_at=NOW()
       RETURNING *`,
      [stat.driver_id, fid, year, month,
       stat.total_orders, stat.total_stops, gross,
       driverRate, driverPayout, fleetIncome, platformFee]
    );
    created.push(rows[0]);
  }

  res.json({ ok: true, count: created.length, records: created });
});

// 結算（標記已付款）
fleetOwnerRouter.post("/salary/settle", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { record_ids } = req.body ?? {};

  if (!Array.isArray(record_ids) || record_ids.length === 0) {
    return res.status(400).json({ error: "record_ids 為必填陣列" });
  }

  const { rows } = await pool.query(
    `UPDATE driver_salary_records
     SET status='settled', settled_at=NOW(), updated_at=NOW()
     WHERE id = ANY($1) AND franchisee_id=$2 AND status='draft'
     RETURNING id, driver_id, driver_payout, status`,
    [record_ids, fid]
  );
  res.json({ ok: true, settled: rows });
});

// 從車趟記錄計算薪資（使用 fleet_trips.driver_payout）
fleetOwnerRouter.post("/salary/calculate-from-trips", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const year  = Number(req.body?.year  ?? new Date().getFullYear());
  const month = Number(req.body?.month ?? new Date().getMonth() + 1);

  const { rows: tripStats } = await pool.query(
    `SELECT
       t.driver_id,
       COUNT(*)::int                           AS total_trips,
       COALESCE(SUM(t.amount), 0)::numeric     AS gross_amount,
       COALESCE(SUM(t.driver_payout), 0)::numeric AS driver_payout_sum
     FROM fleet_trips t
     WHERE t.franchisee_id = $1
       AND EXTRACT(YEAR  FROM t.trip_date) = $2
       AND EXTRACT(MONTH FROM t.trip_date) = $3
       AND t.driver_id IS NOT NULL
       AND t.status = 'completed'
     GROUP BY t.driver_id`,
    [fid, year, month]
  );

  if (tripStats.length === 0) {
    return res.json({ ok: true, count: 0, records: [], message: "此期間無已完成車趟記錄" });
  }

  const created: unknown[] = [];
  for (const stat of tripStats) {
    const gross        = Number(stat.gross_amount);
    const driverPayout = Number(stat.driver_payout_sum);
    const fleetIncome  = parseFloat((gross - driverPayout).toFixed(2));
    const commRate     = gross > 0 ? parseFloat(((driverPayout / gross) * 100).toFixed(1)) : 0;

    const { rows } = await pool.query(
      `INSERT INTO driver_salary_records
         (driver_id, franchisee_id, period_type, period_year, period_month,
          total_orders, total_stops, gross_amount, commission_rate,
          driver_payout, fleet_income, platform_fee, status, created_at, updated_at)
       VALUES ($1,$2,'monthly',$3,$4,$5,$5,$6,$7,$8,$9,0,'draft',NOW(),NOW())
       ON CONFLICT (driver_id, period_type, period_year, period_month)
       DO UPDATE SET
         total_orders=$5, total_stops=$5, gross_amount=$6,
         commission_rate=$7, driver_payout=$8, fleet_income=$9,
         platform_fee=0, updated_at=NOW()
       RETURNING *`,
      [stat.driver_id, fid, year, month,
       stat.total_trips, gross, commRate, driverPayout, fleetIncome]
    );
    created.push(rows[0]);
  }

  res.json({ ok: true, count: created.length, records: created });
});

// 利潤報表
fleetOwnerRouter.get("/salary/report", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const year  = Number(req.query.year  ?? new Date().getFullYear());

  const { rows } = await pool.query(
    `SELECT
       s.period_month,
       SUM(s.gross_amount)::numeric   AS gross_amount,
       SUM(s.driver_payout)::numeric  AS driver_payout,
       SUM(s.fleet_income)::numeric   AS fleet_income,
       SUM(s.platform_fee)::numeric   AS platform_fee,
       SUM(s.total_orders)::int       AS total_orders,
       COUNT(DISTINCT s.driver_id)::int AS driver_count
     FROM driver_salary_records s
     WHERE s.franchisee_id=$1 AND s.period_year=$2
     GROUP BY s.period_month
     ORDER BY s.period_month`,
    [fid, year]
  );
  res.json({ ok: true, year, report: rows });
});

// ══════════════════════════════════════════════════════════════════════════════
// 車趟記錄 (fleet_trips)
// ══════════════════════════════════════════════════════════════════════════════

// Ensure fleet_trips table exists on first use
async function ensureFleetTripsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_trips (
      id            SERIAL PRIMARY KEY,
      franchisee_id INTEGER NOT NULL,
      driver_id     INTEGER,
      trip_date     DATE NOT NULL DEFAULT CURRENT_DATE,
      customer_name TEXT,
      pickup_address TEXT NOT NULL DEFAULT '',
      delivery_address TEXT NOT NULL DEFAULT '',
      amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
      driver_payout NUMERIC(12,2),
      status        TEXT NOT NULL DEFAULT 'completed',
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS fleet_trips_fid_idx ON fleet_trips(franchisee_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS fleet_trips_date_idx ON fleet_trips(trip_date)`);
}
ensureFleetTripsTable().catch(console.error);

// ─── LIST ──────────────────────────────────────────────────────────────
fleetOwnerRouter.get("/trips", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { date_from, date_to, driver_id, limit = "100", offset = "0" } = req.query as any;

  const filters: string[] = ["t.franchisee_id = $1"];
  const params: unknown[] = [fid];

  if (date_from) { params.push(date_from); filters.push(`t.trip_date >= $${params.length}`); }
  if (date_to)   { params.push(date_to);   filters.push(`t.trip_date <= $${params.length}`); }
  if (driver_id) { params.push(Number(driver_id)); filters.push(`t.driver_id = $${params.length}`); }

  params.push(Number(limit)); const limitIdx = params.length;
  params.push(Number(offset)); const offsetIdx = params.length;

  const { rows } = await pool.query(`
    SELECT t.*, d.name AS driver_name, d.vehicle_type, d.license_plate
    FROM fleet_trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    WHERE ${filters.join(" AND ")}
    ORDER BY t.trip_date DESC, t.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  const total = await pool.query(
    `SELECT COUNT(*)::int FROM fleet_trips t WHERE ${filters.slice(0, -2).join(" AND ") || "t.franchisee_id=$1"}`,
    [fid]
  );

  res.json({ ok: true, trips: rows, total: total.rows[0]?.count ?? rows.length });
});

// ─── CREATE ────────────────────────────────────────────────────────────
fleetOwnerRouter.post("/trips", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const {
    driver_id, trip_date, customer_name, pickup_address, delivery_address,
    amount, driver_payout, status = "completed", notes,
  } = req.body;

  if (!pickup_address && !delivery_address) {
    return res.status(400).json({ error: "請填寫起點或終點" });
  }

  const { rows } = await pool.query(`
    INSERT INTO fleet_trips
      (franchisee_id, driver_id, trip_date, customer_name, pickup_address,
       delivery_address, amount, driver_payout, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    fid,
    driver_id ?? null,
    trip_date ? new Date(trip_date) : new Date(),
    customer_name ?? null,
    pickup_address ?? "",
    delivery_address ?? "",
    Number(amount ?? 0),
    driver_payout != null ? Number(driver_payout) : null,
    status,
    notes ?? null,
  ]);
  res.status(201).json({ ok: true, trip: rows[0] });
});

// ─── UPDATE ────────────────────────────────────────────────────────────
fleetOwnerRouter.patch("/trips/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const id = Number(req.params.id);
  const allowed = ["driver_id","trip_date","customer_name","pickup_address","delivery_address","amount","driver_payout","status","notes"];
  const updates: string[] = [];
  const vals: unknown[] = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      if (f === "trip_date" && req.body[f]) {
        vals.push(new Date(req.body[f]));
      } else if (f === "amount" || f === "driver_payout") {
        vals.push(req.body[f] != null ? Number(req.body[f]) : null);
      } else {
        vals.push(req.body[f]);
      }
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "無可更新欄位" });

  vals.push(new Date()); updates.push(`updated_at = $${vals.length}`);
  vals.push(id, fid);

  const { rows } = await pool.query(
    `UPDATE fleet_trips SET ${updates.join(", ")}
     WHERE id = $${vals.length - 1} AND franchisee_id = $${vals.length}
     RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "找不到車趟" });
  res.json({ ok: true, trip: rows[0] });
});

// ─── DELETE ────────────────────────────────────────────────────────────
fleetOwnerRouter.delete("/trips/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const id = Number(req.params.id);
  await pool.query(`DELETE FROM fleet_trips WHERE id=$1 AND franchisee_id=$2`, [id, fid]);
  res.json({ ok: true });
});

// ─── PARSE GOOGLE SHEET 班表 ───────────────────────────────────────────
fleetOwnerRouter.post("/trips/parse-sheet", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { url } = req.body as { url: string };
  if (!url) return res.status(400).json({ error: "請提供 Google 試算表連結" });

  // Convert share URL to CSV export URL
  let csvUrl = url;
  const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  if (match) {
    const sheetId = match[1];
    const gid = gidMatch?.[1] ?? "0";
    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  let text: string;
  try {
    const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  } catch (e: any) {
    return res.status(502).json({ error: `無法取得試算表：${e.message}` });
  }

  // Strip BOM + split lines
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  // Parse CSV line (handles quoted fields)
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  }

  // Skip header row (contains 路線編號（預排）)
  const dataLines = lines.filter(l => !l.includes("路線編號（預排）"));

  // Fetch drivers for name/id matching
  const { rows: driverRows } = await pool.query(
    `SELECT id, name FROM drivers WHERE franchisee_id=$1`, [fid]
  );
  const driverById: Record<string, number> = {};
  const driverByName: Record<string, number> = {};
  for (const d of driverRows) {
    driverById[String(d.id)] = d.id;
    driverByName[d.name.trim()] = d.id;
  }

  // Group rows into routes
  const routes: Array<{
    trip_date: string; route_no: string; vehicle_type: string;
    driver_raw: string; time_slot: string; dock_no: string;
    stops: Array<{ seq: string; name: string; address: string }>;
  }> = [];

  let current: typeof routes[0] | null = null;

  for (const line of dataLines) {
    const cols = parseLine(line);
    const dateRaw = cols[0] ?? "";
    const routeNo = cols[2] ?? "";
    const stopSeq = cols[7] ?? "";
    const storeName = cols[8] ?? "";
    const storeAddr = cols[9] ?? "";

    if (routeNo && routeNo !== "路線編號（預排）") {
      // New route
      const dateStr = dateRaw.split(" ")[0]?.replace(/\//g, "-") ?? "";
      current = {
        trip_date: dateStr,
        route_no: routeNo,
        vehicle_type: cols[3] ?? "",
        driver_raw: cols[4] ?? "",
        time_slot: cols[5] ?? "",
        dock_no: cols[6] ?? "",
        stops: storeName ? [{ seq: stopSeq, name: storeName, address: storeAddr }] : [],
      };
      routes.push(current);
    } else if (current && (storeName || storeAddr)) {
      // Continuation stop for current route
      current.stops.push({ seq: stopSeq, name: storeName, address: storeAddr });
    }
  }

  // Convert routes to trip objects
  const trips = routes.map(r => {
    const stopCount = r.stops.length;
    const stopNames = r.stops.map(s => s.name).join("、").slice(0, 300);

    let driverId: number | null = null;
    if (r.driver_raw) {
      driverId = driverById[r.driver_raw] ?? driverByName[r.driver_raw] ?? null;
    }

    return {
      trip_date: r.trip_date || new Date().toISOString().split("T")[0],
      driver_id: driverId,
      driver_raw: r.driver_raw,
      customer_name: "蝦皮",
      pickup_address: r.dock_no ? `碼頭 ${r.dock_no}（${r.time_slot}）` : r.time_slot,
      delivery_address: stopCount > 0 ? `${stopCount} 站：${stopNames}` : "",
      amount: 0,
      driver_payout: null,
      status: "pending",
      notes: `${r.route_no} ｜ ${r.vehicle_type} ｜ ${stopCount} 站`,
      _route_no: r.route_no,
      _stop_count: stopCount,
      _vehicle_type: r.vehicle_type,
      _time_slot: r.time_slot,
      _dock_no: r.dock_no,
    };
  });

  res.json({ ok: true, trips, total: trips.length });
});

// ─── CSV EXPORT ────────────────────────────────────────────────────────
fleetOwnerRouter.get("/trips/export", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { date_from, date_to, format = "csv" } = req.query as any;

  const filters: string[] = ["t.franchisee_id = $1"];
  const params: unknown[] = [fid];
  if (date_from) { params.push(date_from); filters.push(`t.trip_date >= $${params.length}`); }
  if (date_to)   { params.push(date_to);   filters.push(`t.trip_date <= $${params.length}`); }

  const { rows } = await pool.query(`
    SELECT t.*, d.name AS driver_name
    FROM fleet_trips t LEFT JOIN drivers d ON d.id = t.driver_id
    WHERE ${filters.join(" AND ")}
    ORDER BY t.trip_date DESC, t.id DESC
  `, params);

  const COLS = [
    { key: "trip_date",         header: "日期",     width: 14 },
    { key: "driver_name",       header: "司機姓名", width: 12 },
    { key: "customer_name",     header: "客戶名稱", width: 16 },
    { key: "pickup_address",    header: "起點",     width: 30 },
    { key: "delivery_address",  header: "終點",     width: 30 },
    { key: "amount",            header: "金額",     width: 10 },
    { key: "driver_payout",     header: "司機薪資", width: 10 },
    { key: "status",            header: "狀態",     width: 10 },
    { key: "notes",             header: "備註",     width: 40 },
  ];

  const rowData = rows.map(r => ({
    trip_date:        r.trip_date ? String(r.trip_date).split("T")[0] : "",
    driver_name:      r.driver_name ?? "",
    customer_name:    r.customer_name ?? "",
    pickup_address:   r.pickup_address ?? "",
    delivery_address: r.delivery_address ?? "",
    amount:           r.amount != null ? Number(r.amount) : 0,
    driver_payout:    r.driver_payout != null ? Number(r.driver_payout) : "",
    status:           r.status ?? "",
    notes:            r.notes ?? "",
  }));

  // ─── XLSX ─────────────────────────────────────────────────────────────
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸";
    wb.created = new Date();
    const ws = wb.addWorksheet("車趟記錄");

    ws.columns = COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));

    // Style header row
    ws.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border    = { bottom: { style: "thin", color: { argb: "FFD1FAE5" } } };
    });

    rowData.forEach((r, i) => {
      const row = ws.addRow(r);
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFF0FDF4" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
      });
    });

    // Freeze header
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: `I1` };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="fleet_trips_${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  // ─── CSV ──────────────────────────────────────────────────────────────
  const header = COLS.map(c => c.header).join(",");
  const csvRows = rowData.map(r =>
    COLS.map(c => `"${String((r as any)[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="fleet_trips_${Date.now()}.csv"`);
  res.send("\uFEFF" + header + "\n" + csvRows);
});

// ─── CSV IMPORT ────────────────────────────────────────────────────────
fleetOwnerRouter.post("/trips/import", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { rows: inputRows } = req.body as { rows: any[] };

  if (!Array.isArray(inputRows) || inputRows.length === 0) {
    return res.status(400).json({ error: "無匯入資料" });
  }

  // Fetch driver name → id map for this franchisee
  const { rows: driverRows } = await pool.query(
    `SELECT id, name FROM drivers WHERE franchisee_id=$1`, [fid]
  );
  const driverMap: Record<string, number> = {};
  for (const d of driverRows) { driverMap[d.name.trim()] = d.id; }

  let inserted = 0;
  const errors: string[] = [];

  for (const [i, row] of inputRows.entries()) {
    try {
      const driverName = (row.driver_name ?? row["司機姓名"] ?? "").trim();
      const driverId = driverName ? (driverMap[driverName] ?? null) : null;

      const tripDate = row.date ?? row["日期"] ?? row.trip_date;
      const pickup = row.pickup_address ?? row["起點"] ?? "";
      const delivery = row.delivery_address ?? row["終點"] ?? "";
      const amount = Number(row.amount ?? row["金額"] ?? 0);
      const driverPayout = row.driver_payout ?? row["司機薪資"];
      const customerName = row.customer_name ?? row["客戶名稱"] ?? null;
      const notes = row.notes ?? row["備註"] ?? null;
      const status = row.status ?? row["狀態"] ?? "completed";

      await pool.query(`
        INSERT INTO fleet_trips
          (franchisee_id, driver_id, trip_date, customer_name,
           pickup_address, delivery_address, amount, driver_payout, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        fid, driverId,
        tripDate ? new Date(tripDate) : new Date(),
        customerName, pickup, delivery,
        amount,
        driverPayout != null && driverPayout !== "" ? Number(driverPayout) : null,
        status, notes,
      ]);
      inserted++;
    } catch (e: any) {
      errors.push(`第 ${i + 2} 列：${e.message}`);
    }
  }

  res.json({ ok: true, inserted, errors });
});

// ══════════════════════════════════════════════════════════════════════════════
// 待命時段
// ══════════════════════════════════════════════════════════════════════════════
fleetOwnerRouter.get("/standby", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { driver_id, date } = req.query;

  const filters: string[] = ["ss.franchisee_id = $1"];
  const params: unknown[] = [fid];

  if (driver_id) { params.push(Number(driver_id)); filters.push(`ss.driver_id = $${params.length}`); }
  if (date) { params.push(date); filters.push(`(ss.slot_date = $${params.length} OR ss.is_recurring=true)`); }

  const { rows } = await pool.query(
    `SELECT ss.*, d.name AS driver_name
     FROM driver_standby_slots ss
     JOIN drivers d ON d.id = ss.driver_id
     WHERE ${filters.join(" AND ")}
     ORDER BY ss.slot_date, ss.start_time`,
    params
  );
  res.json({ ok: true, slots: rows });
});

// ══════════════════════════════════════════════════════════════════════════════
// 班表自動同步設定 (fleet_sheet_sync_configs)
// ══════════════════════════════════════════════════════════════════════════════

// LIST
fleetOwnerRouter.get("/sheet-sync", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { rows } = await pool.query(
    `SELECT * FROM fleet_sheet_sync_configs WHERE franchisee_id=$1 ORDER BY id`,
    [fid]
  );
  res.json({ ok: true, configs: rows });
});

// CREATE
fleetOwnerRouter.post("/sheet-sync", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const { sync_name = "蝦皮班表", sheet_url, interval_minutes = 60 } = req.body ?? {};
  if (!sheet_url) return res.status(400).json({ error: "sheet_url 為必填" });

  const { rows } = await pool.query(
    `INSERT INTO fleet_sheet_sync_configs
       (franchisee_id, sync_name, sheet_url, interval_minutes)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [fid, sync_name, sheet_url, Number(interval_minutes)]
  );
  res.status(201).json({ ok: true, config: rows[0] });
});

// UPDATE
fleetOwnerRouter.patch("/sheet-sync/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const id = Number(req.params.id);
  const allowed = ["sync_name", "sheet_url", "interval_minutes", "is_active"];
  const updates: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (!allowed.includes(k)) continue;
    vals.push(v);
    updates.push(`${k}=$${vals.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: "無可更新欄位" });
  vals.push(id, fid);
  const { rows } = await pool.query(
    `UPDATE fleet_sheet_sync_configs SET ${updates.join(",")}, updated_at=NOW()
     WHERE id=$${vals.length - 1} AND franchisee_id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "找不到設定" });
  res.json({ ok: true, config: rows[0] });
});

// DELETE
fleetOwnerRouter.delete("/sheet-sync/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  await pool.query(
    `DELETE FROM fleet_sheet_sync_configs WHERE id=$1 AND franchisee_id=$2`,
    [Number(req.params.id), fid]
  );
  res.json({ ok: true });
});

// MANUAL RUN
fleetOwnerRouter.post("/sheet-sync/:id/run", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const id = Number(req.params.id);

  // Verify ownership
  const { rows: check } = await pool.query(
    `SELECT id FROM fleet_sheet_sync_configs WHERE id=$1 AND franchisee_id=$2`, [id, fid]
  );
  if (!check.length) return res.status(404).json({ error: "找不到設定" });

  try {
    const result = await runFleetSheetSync(id);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message });
  }
});
