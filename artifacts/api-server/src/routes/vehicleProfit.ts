/**
 * vehicleProfit.ts — 車輛盈虧獲利分析
 *
 * GET    /api/vehicle-profit/params           取得全域參數
 * PUT    /api/vehicle-profit/params           更新全域參數
 * GET    /api/vehicle-profit/records          取得月度記錄（?month=YYYY-MM）
 * POST   /api/vehicle-profit/records          新增記錄
 * PATCH  /api/vehicle-profit/records/:id      更新記錄
 * DELETE /api/vehicle-profit/records/:id      刪除記錄
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const vehicleProfitRouter = Router();

// ── 建立資料表 ─────────────────────────────────────────────────────────────
export async function ensureVehicleProfitTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_profit_params (
      id                  SERIAL PRIMARY KEY,
      annual_insurance    NUMERIC(12,2) NOT NULL DEFAULT 120000,
      annual_depreciation NUMERIC(12,2) NOT NULL DEFAULT 240000,
      fuel_per_km         NUMERIC(8,4)  NOT NULL DEFAULT 0.35,
      diesel_price        NUMERIC(8,2)  NOT NULL DEFAULT 28,
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO vehicle_profit_params (id, annual_insurance, annual_depreciation, fuel_per_km, diesel_price)
    VALUES (1, 120000, 240000, 0.35, 28)
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_profit_records (
      id              SERIAL PRIMARY KEY,
      report_month    CHAR(7)        NOT NULL,
      vehicle_plate   TEXT           NOT NULL,
      vehicle_type    TEXT,
      tonnage         NUMERIC(6,2),
      vehicle_price   NUMERIC(14,2),
      total_km        NUMERIC(10,2)  NOT NULL DEFAULT 0,
      freight_income  NUMERIC(14,2)  NOT NULL DEFAULT 0,
      toll_fee        NUMERIC(12,2)  NOT NULL DEFAULT 0,
      maintenance_fee NUMERIC(12,2)  NOT NULL DEFAULT 0,
      tire_fee        NUMERIC(12,2)  NOT NULL DEFAULT 0,
      other_expense   NUMERIC(12,2)  NOT NULL DEFAULT 0,
      notes           TEXT,
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      UNIQUE (report_month, vehicle_plate)
    )
  `);
}

// ── GET /api/vehicle-profit/params ─────────────────────────────────────────
vehicleProfitRouter.get("/vehicle-profit/params", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM vehicle_profit_params WHERE id = 1");
  res.json({ ok: true, params: rows[0] ?? null });
});

// ── PUT /api/vehicle-profit/params ─────────────────────────────────────────
vehicleProfitRouter.put("/vehicle-profit/params", async (req, res) => {
  const { annual_insurance, annual_depreciation, fuel_per_km, diesel_price } = req.body;
  const { rows } = await pool.query(
    `UPDATE vehicle_profit_params
     SET annual_insurance=$1, annual_depreciation=$2, fuel_per_km=$3, diesel_price=$4, updated_at=NOW()
     WHERE id=1 RETURNING *`,
    [annual_insurance, annual_depreciation, fuel_per_km, diesel_price]
  );
  res.json({ ok: true, params: rows[0] });
});

// ── GET /api/vehicle-profit/records ────────────────────────────────────────
vehicleProfitRouter.get("/vehicle-profit/records", async (req, res) => {
  const { month } = req.query as { month?: string };
  const where = month ? `WHERE report_month = $1` : "";
  const vals  = month ? [month] : [];
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_profit_records ${where} ORDER BY vehicle_plate`,
    vals
  );
  res.json({ ok: true, records: rows });
});

// ── POST /api/vehicle-profit/records ───────────────────────────────────────
vehicleProfitRouter.post("/vehicle-profit/records", async (req, res) => {
  const { report_month, vehicle_plate, vehicle_type, tonnage, vehicle_price,
          total_km, freight_income, toll_fee, maintenance_fee, tire_fee, other_expense, notes } = req.body;
  if (!report_month || !vehicle_plate)
    return res.status(400).json({ error: "report_month 與 vehicle_plate 為必填" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO vehicle_profit_records
         (report_month, vehicle_plate, vehicle_type, tonnage, vehicle_price,
          total_km, freight_income, toll_fee, maintenance_fee, tire_fee, other_expense, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (report_month, vehicle_plate) DO UPDATE SET
         vehicle_type=EXCLUDED.vehicle_type, tonnage=EXCLUDED.tonnage, vehicle_price=EXCLUDED.vehicle_price,
         total_km=EXCLUDED.total_km, freight_income=EXCLUDED.freight_income, toll_fee=EXCLUDED.toll_fee,
         maintenance_fee=EXCLUDED.maintenance_fee, tire_fee=EXCLUDED.tire_fee,
         other_expense=EXCLUDED.other_expense, notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [report_month, vehicle_plate, vehicle_type ?? null, tonnage ?? null, vehicle_price ?? null,
       total_km ?? 0, freight_income ?? 0, toll_fee ?? 0, maintenance_fee ?? 0, tire_fee ?? 0, other_expense ?? 0,
       notes ?? null]
    );
    res.status(201).json({ ok: true, record: rows[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── PATCH /api/vehicle-profit/records/:id ──────────────────────────────────
vehicleProfitRouter.patch("/vehicle-profit/records/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["vehicle_type","tonnage","vehicle_price","total_km","freight_income",
                  "toll_fee","maintenance_fee","tire_fee","other_expense","notes"];
  const updates = ["updated_at=NOW()"];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`); }
  }
  if (!vals.length) return res.status(400).json({ error: "無可更新欄位" });
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE vehicle_profit_records SET ${updates.join(",")} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: "找不到記錄" });
  res.json({ ok: true, record: rows[0] });
});

// ── DELETE /api/vehicle-profit/records/:id ─────────────────────────────────
vehicleProfitRouter.delete("/vehicle-profit/records/:id", async (req, res) => {
  await pool.query("DELETE FROM vehicle_profit_records WHERE id=$1", [Number(req.params.id)]);
  res.json({ ok: true });
});
