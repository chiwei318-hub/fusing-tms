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
        engine_cc, tonnage, commission_rate, franchisee_id, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'available',NOW())
     RETURNING id, name, phone, vehicle_type, license_plate, username, status, commission_rate`,
    [name, phone, vehicle_type ?? "小貨車", license_plate, username, passwordHash,
     engine_cc, tonnage, driverRate, fid]
  );
  res.status(201).json({ ok: true, driver: rows[0] });
});

fleetOwnerRouter.patch("/drivers/:id", async (req, res) => {
  const fid = req.fleet!.franchisee_id;
  const did = Number(req.params.id);

  const allowed = [
    "name", "phone", "vehicle_type", "license_plate",
    "engine_cc", "tonnage", "commission_rate", "status",
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

  res.json({
    ok: true,
    drivers: drivers.rows,
    active_orders: orders.rows,
    pending_leaves: leaves.rows,
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
