/**
 * payrollCost.ts — 貨運自動化薪資成本結算
 *
 * GET    /api/payroll-cost/params           取得費率參數
 * PUT    /api/payroll-cost/params           更新費率參數
 * GET    /api/payroll-cost/records          月度記錄（?month=YYYY-MM）
 * POST   /api/payroll-cost/records          新增
 * PATCH  /api/payroll-cost/records/:id      更新
 * DELETE /api/payroll-cost/records/:id      刪除
 * POST   /api/payroll-cost/import-excel     匯入 Excel
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import multer from "multer";

export const payrollCostRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 建立/升級資料表 ────────────────────────────────────────────────────────
export async function ensurePayrollCostTables() {
  // 費率參數（保留，但新版欄位改為固定金額輸入）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_cost_params (
      id               SERIAL PRIMARY KEY,
      labor_ins_rate   NUMERIC(6,4) NOT NULL DEFAULT 0.07,
      health_ins_rate  NUMERIC(6,4) NOT NULL DEFAULT 0.045,
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO payroll_cost_params (id, labor_ins_rate, health_ins_rate)
    VALUES (1, 0.07, 0.045) ON CONFLICT (id) DO NOTHING
  `);

  // 月度薪資記錄（建立基礎表）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_cost_records (
      id               SERIAL PRIMARY KEY,
      report_month     CHAR(7)        NOT NULL,
      driver_name      TEXT           NOT NULL,
      attendance_days  NUMERIC(4,1)   NOT NULL DEFAULT 0,
      daily_wage       NUMERIC(10,2)  NOT NULL DEFAULT 0,
      freight_income   NUMERIC(14,2)  NOT NULL DEFAULT 0,
      toll_fee         NUMERIC(12,2)  NOT NULL DEFAULT 0,
      diesel_fee       NUMERIC(12,2)  NOT NULL DEFAULT 0,
      other_fee        NUMERIC(12,2)  NOT NULL DEFAULT 0,
      invoice_tax_rate NUMERIC(6,2)   NOT NULL DEFAULT 0,
      notes            TEXT,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);

  // ── 新版欄位：ALTER ADD COLUMN IF NOT EXISTS ────────────────────────────
  const newCols: string[] = [
    "ADD COLUMN IF NOT EXISTS daily_trips       NUMERIC(6,1)  NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS trip_price        NUMERIC(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS fuel_cost         NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS insurance_fee     NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS maintenance_fee   NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS pay_mode          TEXT          NOT NULL DEFAULT 'fixed'",
    "ADD COLUMN IF NOT EXISTS fixed_salary      NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS commission_rate   NUMERIC(6,2)  NOT NULL DEFAULT 80",
    "ADD COLUMN IF NOT EXISTS labor_ins_fixed   NUMERIC(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS health_ins_fixed  NUMERIC(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS advance_payment   NUMERIC(12,2) NOT NULL DEFAULT 0",
  ];
  for (const col of newCols) {
    await pool.query(`ALTER TABLE payroll_cost_records ${col}`).catch(() => {});
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS payroll_cost_month_idx ON payroll_cost_records (report_month)
  `);
  console.log("[PayrollCost] schema ensured (v2 fields added)");
}

// ── GET /api/payroll-cost/params ───────────────────────────────────────────
payrollCostRouter.get("/payroll-cost/params", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM payroll_cost_params WHERE id=1");
  res.json({ ok: true, params: rows[0] ?? null });
});

// ── PUT /api/payroll-cost/params ───────────────────────────────────────────
payrollCostRouter.put("/payroll-cost/params", async (req, res) => {
  const { labor_ins_rate, health_ins_rate } = req.body;
  const { rows } = await pool.query(
    `UPDATE payroll_cost_params SET labor_ins_rate=$1, health_ins_rate=$2, updated_at=NOW()
     WHERE id=1 RETURNING *`,
    [labor_ins_rate, health_ins_rate]
  );
  res.json({ ok: true, params: rows[0] });
});

// ── GET /api/payroll-cost/records ──────────────────────────────────────────
payrollCostRouter.get("/payroll-cost/records", async (req, res) => {
  const { month } = req.query as { month?: string };
  const where = month ? "WHERE report_month=$1" : "";
  const vals  = month ? [month] : [];
  const { rows } = await pool.query(
    `SELECT * FROM payroll_cost_records ${where} ORDER BY driver_name`,
    vals
  );
  res.json({ ok: true, records: rows });
});

// ── POST /api/payroll-cost/records ─────────────────────────────────────────
payrollCostRouter.post("/payroll-cost/records", async (req, res) => {
  const b = req.body;
  if (!b.report_month || !b.driver_name)
    return res.status(400).json({ error: "report_month 與 driver_name 為必填" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO payroll_cost_records
         (report_month, driver_name, attendance_days, daily_trips, trip_price,
          toll_fee, fuel_cost, insurance_fee, maintenance_fee,
          pay_mode, fixed_salary, commission_rate,
          labor_ins_fixed, health_ins_fixed, advance_payment, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.report_month, b.driver_name,
       b.attendance_days ?? 0, b.daily_trips ?? 0, b.trip_price ?? 0,
       b.toll_fee ?? 0, b.fuel_cost ?? 0, b.insurance_fee ?? 0, b.maintenance_fee ?? 0,
       b.pay_mode ?? "fixed", b.fixed_salary ?? 0, b.commission_rate ?? 80,
       b.labor_ins_fixed ?? 0, b.health_ins_fixed ?? 0, b.advance_payment ?? 0,
       b.notes ?? null]
    );
    res.status(201).json({ ok: true, record: rows[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── PATCH /api/payroll-cost/records/:id ────────────────────────────────────
payrollCostRouter.patch("/payroll-cost/records/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ALLOWED = ["driver_name","attendance_days","daily_trips","trip_price",
    "toll_fee","fuel_cost","insurance_fee","maintenance_fee",
    "pay_mode","fixed_salary","commission_rate",
    "labor_ins_fixed","health_ins_fixed","advance_payment","notes"];
  const updates = ["updated_at=NOW()"];
  const vals: unknown[] = [];
  for (const f of ALLOWED) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`); }
  }
  if (!vals.length) return res.status(400).json({ error: "無可更新欄位" });
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE payroll_cost_records SET ${updates.join(",")} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: "找不到記錄" });
  res.json({ ok: true, record: rows[0] });
});

// ── DELETE /api/payroll-cost/records/:id ───────────────────────────────────
payrollCostRouter.delete("/payroll-cost/records/:id", async (req, res) => {
  await pool.query("DELETE FROM payroll_cost_records WHERE id=$1", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── POST /api/payroll-cost/import-excel ────────────────────────────────────
payrollCostRouter.post(
  "/payroll-cost/import-excel",
  upload.single("file"),
  async (req: any, res) => {
    let xlsx: any;
    try { xlsx = require("xlsx"); } catch { return res.status(500).json({ error: "xlsx 未安裝" }); }

    // 取得當月（由 body 傳入，或預設當月）
    const report_month: string = req.body?.report_month ?? new Date().toISOString().slice(0, 7);

    let wb: any;
    try {
      if (req.file?.buffer) {
        wb = xlsx.read(req.file.buffer, { type: "buffer" });
      } else {
        const path = require("path");
        const p = path.resolve(process.cwd(),
          "../../attached_assets/貨運自動化薪資成本結算表.xlsx_-_Sheet1_1776499935022.xlsx");
        wb = xlsx.readFile(p);
      }
    } catch (e: any) {
      return res.status(400).json({ error: `無法開啟 Excel: ${e.message}` });
    }

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

    // Row 0 = 標題列，Row 1+ = 資料
    // 欄位順序：[司機姓名, 出勤天數, 日薪, 基本薪資(skip), 勞保(skip), 健保(skip),
    //            運費收入, 過路費, 柴油費, 其他費用, 發票稅%, 稅額(skip), 總成本(skip), 淨利潤(skip)]
    const records: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const driver_name = String(r[0] ?? "").trim();
      if (!driver_name) continue;
      records.push({
        report_month,
        driver_name,
        attendance_days:  Number(r[1])  || 0,
        daily_wage:       Number(r[2])  || 0,
        freight_income:   Number(r[6])  || 0,
        toll_fee:         Number(r[7])  || 0,
        diesel_fee:       Number(r[8])  || 0,
        other_fee:        Number(r[9])  || 0,
        invoice_tax_rate: Number(r[10]) || 0,
      });
    }

    let inserted = 0, errors = 0;
    for (const d of records) {
      try {
        await pool.query(
          `INSERT INTO payroll_cost_records
             (report_month, driver_name, attendance_days, daily_wage, freight_income,
              toll_fee, diesel_fee, other_fee, invoice_tax_rate)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT DO NOTHING`,
          [d.report_month, d.driver_name, d.attendance_days, d.daily_wage, d.freight_income,
           d.toll_fee, d.diesel_fee, d.other_fee, d.invoice_tax_rate]
        );
        inserted++;
      } catch { errors++; }
    }
    res.json({ ok: true, inserted, errors, total: records.length });
  }
);
