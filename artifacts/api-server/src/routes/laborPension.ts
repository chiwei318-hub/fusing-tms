/**
 * laborPension.ts — 6% 勞退提撥管理（加盟者專用）
 *
 * GET    /api/labor-pension/records          列出提撥記錄（?month=YYYY-MM&franchisee=xxx）
 * POST   /api/labor-pension/records          新增記錄
 * PATCH  /api/labor-pension/records/:id      更新記錄
 * DELETE /api/labor-pension/records/:id      刪除記錄
 * POST   /api/labor-pension/records/bulk     批次匯入
 * GET    /api/labor-pension/summary          月度加盟者彙總（?month=YYYY-MM）
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const laborPensionRouter = Router();

// ── 建立資料表 ─────────────────────────────────────────────────────────────
export async function ensureLaborPensionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS labor_pension_records (
      id               SERIAL PRIMARY KEY,
      report_month     CHAR(7)        NOT NULL,
      franchisee_name  TEXT           NOT NULL DEFAULT '',
      employee_name    TEXT           NOT NULL,
      id_number        TEXT,
      monthly_salary   NUMERIC(12,2)  NOT NULL DEFAULT 0,
      contribution_rate NUMERIC(5,4)  NOT NULL DEFAULT 0.06,
      contribution_amt NUMERIC(12,2)  GENERATED ALWAYS AS
                        (ROUND(monthly_salary * contribution_rate)) STORED,
      paid_at          DATE,
      payment_method   TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS labor_pension_month_idx ON labor_pension_records (report_month)
  `);
}

// ── GET /api/labor-pension/records ─────────────────────────────────────────
laborPensionRouter.get("/labor-pension/records", async (req, res) => {
  const { month, franchisee } = req.query as Record<string, string>;
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (month)      { conds.push(`report_month = $${vals.length+1}`);    vals.push(month); }
  if (franchisee) { conds.push(`franchisee_name = $${vals.length+1}`); vals.push(franchisee); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM labor_pension_records ${where} ORDER BY franchisee_name, employee_name`,
    vals
  );
  res.json({ ok: true, records: rows });
});

// ── GET /api/labor-pension/summary ─────────────────────────────────────────
laborPensionRouter.get("/labor-pension/summary", async (req, res) => {
  const { month } = req.query as Record<string, string>;
  const where = month ? `WHERE report_month = $1` : "";
  const vals  = month ? [month] : [];
  const { rows } = await pool.query(
    `SELECT
       franchisee_name,
       COUNT(*)              AS employee_count,
       SUM(monthly_salary)   AS total_salary,
       SUM(contribution_amt) AS total_contribution,
       COUNT(*) FILTER (WHERE paid_at IS NOT NULL) AS paid_count
     FROM labor_pension_records ${where}
     GROUP BY franchisee_name
     ORDER BY franchisee_name`,
    vals
  );
  res.json({ ok: true, summary: rows });
});

// ── POST /api/labor-pension/records ────────────────────────────────────────
laborPensionRouter.post("/labor-pension/records", async (req, res) => {
  const { report_month, franchisee_name, employee_name, id_number,
          monthly_salary, contribution_rate, paid_at, payment_method, notes } = req.body;
  if (!report_month || !employee_name)
    return res.status(400).json({ error: "report_month 與 employee_name 為必填" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO labor_pension_records
         (report_month, franchisee_name, employee_name, id_number,
          monthly_salary, contribution_rate, paid_at, payment_method, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [report_month, franchisee_name ?? "", employee_name, id_number ?? null,
       monthly_salary ?? 0, contribution_rate ?? 0.06,
       paid_at ?? null, payment_method ?? null, notes ?? null]
    );
    res.status(201).json({ ok: true, record: rows[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── POST /api/labor-pension/records/bulk ───────────────────────────────────
laborPensionRouter.post("/labor-pension/records/bulk", async (req, res) => {
  const items: any[] = req.body?.records ?? [];
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "records 陣列為必填" });
  let inserted = 0, errors = 0;
  for (const d of items) {
    if (!d.report_month || !d.employee_name) continue;
    try {
      await pool.query(
        `INSERT INTO labor_pension_records
           (report_month, franchisee_name, employee_name, id_number,
            monthly_salary, contribution_rate, paid_at, payment_method, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [d.report_month, d.franchisee_name ?? "", d.employee_name, d.id_number ?? null,
         d.monthly_salary ?? 0, d.contribution_rate ?? 0.06,
         d.paid_at ?? null, d.payment_method ?? null, d.notes ?? null]
      );
      inserted++;
    } catch { errors++; }
  }
  res.json({ ok: true, inserted, errors });
});

// ── PATCH /api/labor-pension/records/:id ───────────────────────────────────
laborPensionRouter.patch("/labor-pension/records/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["franchisee_name","employee_name","id_number","monthly_salary",
                  "contribution_rate","paid_at","payment_method","notes"];
  const updates = ["updated_at=NOW()"];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`); }
  }
  if (!vals.length) return res.status(400).json({ error: "無可更新欄位" });
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE labor_pension_records SET ${updates.join(",")} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: "找不到記錄" });
  res.json({ ok: true, record: rows[0] });
});

// ── DELETE /api/labor-pension/records/:id ──────────────────────────────────
laborPensionRouter.delete("/labor-pension/records/:id", async (req, res) => {
  await pool.query("DELETE FROM labor_pension_records WHERE id=$1", [Number(req.params.id)]);
  res.json({ ok: true });
});
