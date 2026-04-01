/**
 * franchisees.ts
 * 加盟主管理 API
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const franchiseesRouter = Router();

// ─── 產生加盟主代碼 ───────────────────────────────────────────────────
async function generateFranchiseeCode(): Promise<string> {
  const row = await db.execute(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INT)), 0) + 1 AS next_num
    FROM franchisees WHERE code ~ '^FM[0-9]+$'
  `);
  const num = String((row.rows[0] as any)?.next_num ?? 1).padStart(3, "0");
  return `FM${num}`;
}

// ─── LIST ─────────────────────────────────────────────────────────────
franchiseesRouter.get("/franchisees", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      f.*,
      COUNT(DISTINCT s.id)                               AS settlement_count,
      COALESCE(SUM(s.gross_revenue), 0)                  AS total_gross_revenue,
      COALESCE(SUM(s.net_payout), 0)                     AS total_net_payout,
      COALESCE(
        (SELECT order_count FROM franchisee_settlements
         WHERE franchisee_id = f.id
           AND period_year  = EXTRACT(YEAR  FROM NOW())
           AND period_month = EXTRACT(MONTH FROM NOW())
         LIMIT 1), 0)                                    AS current_month_orders
    FROM franchisees f
    LEFT JOIN franchisee_settlements s ON s.franchisee_id = f.id
    GROUP BY f.id
    ORDER BY f.code ASC
  `);
  res.json(rows.rows);
});

// ─── STATS overview ───────────────────────────────────────────────────
franchiseesRouter.get("/franchisees/stats/overview", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')     AS active_count,
      COUNT(*) FILTER (WHERE status = 'pending')    AS pending_count,
      COUNT(*) FILTER (WHERE status = 'suspended')  AS suspended_count,
      COUNT(*)                                       AS total_count
    FROM franchisees
  `);
  const settle = await db.execute(sql`
    SELECT
      COALESCE(SUM(gross_revenue) FILTER (WHERE period_year = EXTRACT(YEAR FROM NOW())
        AND period_month = EXTRACT(MONTH FROM NOW())), 0)  AS this_month_revenue,
      COALESCE(SUM(net_payout)   FILTER (WHERE status = 'pending'), 0) AS pending_payout
    FROM franchisee_settlements
  `);
  res.json({ franchisees: rows.rows[0], settlements: settle.rows[0] });
});

// ─── GET ONE ──────────────────────────────────────────────────────────
franchiseesRouter.get("/franchisees/:id", async (req, res) => {
  const { id } = req.params;
  const rows = await db.execute(sql`SELECT * FROM franchisees WHERE id = ${id} LIMIT 1`);
  if (!(rows.rows as any[]).length) return res.status(404).json({ error: "找不到加盟主" });
  return res.json(rows.rows[0]);
});

// ─── CREATE ───────────────────────────────────────────────────────────
franchiseesRouter.post("/franchisees", async (req, res) => {
  const {
    name, owner_name, phone, email, address, zone_name,
    contract_type = "revenue_share", commission_rate = 70, monthly_fee = 0,
    status = "active", notes, joined_at, contract_end_at,
  } = req.body;

  if (!name) return res.status(400).json({ error: "缺少加盟商名稱" });

  const code = await generateFranchiseeCode();
  const result = await db.execute(sql`
    INSERT INTO franchisees (
      code, name, owner_name, phone, email, address, zone_name,
      contract_type, commission_rate, monthly_fee,
      status, notes, joined_at, contract_end_at
    ) VALUES (
      ${code}, ${name}, ${owner_name ?? null}, ${phone ?? null}, ${email ?? null},
      ${address ?? null}, ${zone_name ?? null},
      ${contract_type}, ${Number(commission_rate)}, ${Number(monthly_fee)},
      ${status}, ${notes ?? null},
      ${joined_at ? new Date(joined_at) : new Date()},
      ${contract_end_at ? new Date(contract_end_at) : null}
    ) RETURNING *
  `);
  return res.status(201).json(result.rows[0]);
});

// ─── UPDATE ───────────────────────────────────────────────────────────
franchiseesRouter.patch("/franchisees/:id", async (req, res) => {
  const { id } = req.params;
  const {
    name, owner_name, phone, email, address, zone_name,
    contract_type, commission_rate, monthly_fee,
    status, notes, joined_at, contract_end_at,
  } = req.body;

  await db.execute(sql`
    UPDATE franchisees SET
      name             = COALESCE(${name ?? null}, name),
      owner_name       = COALESCE(${owner_name ?? null}, owner_name),
      phone            = COALESCE(${phone ?? null}, phone),
      email            = COALESCE(${email ?? null}, email),
      address          = COALESCE(${address ?? null}, address),
      zone_name        = COALESCE(${zone_name ?? null}, zone_name),
      contract_type    = COALESCE(${contract_type ?? null}, contract_type),
      commission_rate  = COALESCE(${commission_rate != null ? Number(commission_rate) : null}, commission_rate),
      monthly_fee      = COALESCE(${monthly_fee != null ? Number(monthly_fee) : null}, monthly_fee),
      status           = COALESCE(${status ?? null}, status),
      notes            = COALESCE(${notes ?? null}, notes),
      joined_at        = COALESCE(${joined_at ? new Date(joined_at) : null}, joined_at),
      contract_end_at  = COALESCE(${contract_end_at ? new Date(contract_end_at) : null}, contract_end_at),
      updated_at       = NOW()
    WHERE id = ${id}
  `);
  const rows = await db.execute(sql`SELECT * FROM franchisees WHERE id = ${id} LIMIT 1`);
  return res.json(rows.rows[0]);
});

// ─── DELETE / 停用 ────────────────────────────────────────────────────
franchiseesRouter.delete("/franchisees/:id", async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`UPDATE franchisees SET status = 'terminated', updated_at = NOW() WHERE id = ${id}`);
  return res.json({ ok: true });
});

// ─── SETTLEMENTS: LIST ────────────────────────────────────────────────
franchiseesRouter.get("/franchisees/:id/settlements", async (req, res) => {
  const { id } = req.params;
  const rows = await db.execute(sql`
    SELECT * FROM franchisee_settlements
    WHERE franchisee_id = ${id}
    ORDER BY period_year DESC, period_month DESC
  `);
  res.json(rows.rows);
});

// ─── SETTLEMENTS: GENERATE monthly ───────────────────────────────────
franchiseesRouter.post("/franchisees/:id/settlements/generate", async (req, res) => {
  const { id } = req.params;
  const { year, month } = req.body;
  const targetYear  = Number(year  ?? new Date().getFullYear());
  const targetMonth = Number(month ?? new Date().getMonth() + 1);

  // 取加盟主設定
  const fRows = await db.execute(sql`SELECT * FROM franchisees WHERE id = ${id} LIMIT 1`);
  if (!(fRows.rows as any[]).length) return res.status(404).json({ error: "找不到加盟主" });
  const f = (fRows.rows as any[])[0];

  // 從歷史結算找舊資料（若有），否則使用 0（由管理員手動帶入業績）
  const existingRow = await db.execute(sql`
    SELECT order_count, gross_revenue FROM franchisee_settlements
    WHERE franchisee_id = ${id} AND period_year = ${targetYear} AND period_month = ${targetMonth}
    LIMIT 1
  `);
  const existingOrderCount   = Number((existingRow.rows[0] as any)?.order_count ?? 0);
  const existingGrossRevenue = Number((existingRow.rows[0] as any)?.gross_revenue ?? 0);

  // 使用 req.body 手動帶入業績，否則沿用既有值（或 0）
  const manualOrderCount = req.body.order_count != null ? Number(req.body.order_count) : existingOrderCount;
  const manualGross      = req.body.gross_revenue != null ? Number(req.body.gross_revenue) : existingGrossRevenue;

  const oRows = { rows: [{ order_count: manualOrderCount, gross_revenue: manualGross }] };
  const { order_count, gross_revenue } = (oRows.rows as any[])[0];
  const gross  = Number(gross_revenue);
  const rate   = Number(f.commission_rate) / 100;
  const commission = Math.round(gross * rate);
  const platform   = gross - commission;
  const monthly_fee_charge = Number(f.monthly_fee);
  const net_payout = Math.max(0, commission - monthly_fee_charge);

  // Upsert
  const result = await db.execute(sql`
    INSERT INTO franchisee_settlements (
      franchisee_id, period_year, period_month,
      order_count, gross_revenue, commission_rate, commission_amount,
      platform_fee, monthly_fee, net_payout, status
    ) VALUES (
      ${id}, ${targetYear}, ${targetMonth},
      ${Number(order_count)}, ${gross}, ${f.commission_rate}, ${commission},
      ${platform}, ${monthly_fee_charge}, ${net_payout}, 'pending'
    )
    ON CONFLICT (franchisee_id, period_year, period_month)
    DO UPDATE SET
      order_count = EXCLUDED.order_count,
      gross_revenue = EXCLUDED.gross_revenue,
      commission_amount = EXCLUDED.commission_amount,
      platform_fee = EXCLUDED.platform_fee,
      net_payout = EXCLUDED.net_payout,
      status = 'pending'
    RETURNING *
  `);
  return res.json(result.rows[0]);
});

// ─── SETTLEMENTS: CONFIRM / PAY ───────────────────────────────────────
franchiseesRouter.patch("/franchisee-settlements/:sid/status", async (req, res) => {
  const { sid } = req.params;
  const { status } = req.body;
  if (!["pending", "confirmed", "paid"].includes(status))
    return res.status(400).json({ error: "無效的狀態" });

  await db.execute(sql`
    UPDATE franchisee_settlements
    SET status     = ${status},
        settled_at = ${status === "paid" ? new Date() : null}
    WHERE id = ${sid}
  `);
  const rows = await db.execute(sql`SELECT * FROM franchisee_settlements WHERE id = ${sid} LIMIT 1`);
  return res.json(rows.rows[0]);
});

// ─── ALL SETTLEMENTS (admin overview) ─────────────────────────────────
franchiseesRouter.get("/franchisee-settlements", async (req, res) => {
  const { year, month } = req.query;
  const rows = await db.execute(sql`
    SELECT s.*, f.name AS franchisee_name, f.code AS franchisee_code, f.zone_name
    FROM franchisee_settlements s
    JOIN franchisees f ON f.id = s.franchisee_id
    WHERE (${year ? Number(year) : null} IS NULL OR s.period_year = ${year ? Number(year) : null})
      AND (${month ? Number(month) : null} IS NULL OR s.period_month = ${month ? Number(month) : null})
    ORDER BY s.period_year DESC, s.period_month DESC, f.code ASC
  `);
  res.json(rows.rows);
});
