/**
 * reports.ts — 財務報表端點
 *
 * GET /api/reports/ar-aging         — 應收帳齡分析
 * GET /api/reports/driver-commission — 司機抽成報表
 * GET /api/reports/gross-margin     — 毛利報表（月度）
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const reportsRouter = Router();

// ── 應收帳齡分析（AR Aging） ──────────────────────────────────────────────────
reportsRouter.get("/reports/ar-aging", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      WITH base AS (
        SELECT
          al.id, al.enterprise_id, al.customer_id, al.order_id,
          al.amount, al.reconciled, al.created_at,
          EXTRACT(DAY FROM NOW() - al.created_at)::int AS age_days,
          ea.company_name  AS enterprise_name,
          ea.account_code,
          ea.billing_type  AS enterprise_billing_type,
          c.name           AS customer_name
        FROM ar_ledger al
        LEFT JOIN enterprise_accounts ea ON ea.id = al.enterprise_id
        LEFT JOIN customers           c  ON c.id  = al.customer_id
        WHERE al.entry_type = 'receivable'
          AND NOT al.reconciled
      )
      SELECT
        COALESCE(enterprise_name, customer_name, '未知') AS entity_name,
        COALESCE(account_code, '—') AS account_code,
        COALESCE(enterprise_billing_type, 'cash') AS billing_type,
        enterprise_id, customer_id,
        COUNT(*)                                           AS invoice_count,
        COALESCE(SUM(amount) FILTER (WHERE age_days <= 30),  0) AS bucket_0_30,
        COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 31 AND 60), 0) AS bucket_31_60,
        COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 61 AND 90), 0) AS bucket_61_90,
        COALESCE(SUM(amount) FILTER (WHERE age_days > 90),   0) AS bucket_91_plus,
        COALESCE(SUM(amount), 0)                               AS total_outstanding,
        MAX(age_days)                                          AS max_age_days,
        MIN(created_at)                                        AS oldest_entry
      FROM base
      GROUP BY enterprise_name, customer_name, account_code,
               enterprise_billing_type, enterprise_id, customer_id
      ORDER BY total_outstanding DESC
    `);

    const summary = (rows.rows as any[]).reduce(
      (acc, r) => {
        acc.bucket_0_30    += Number(r.bucket_0_30   ?? 0);
        acc.bucket_31_60   += Number(r.bucket_31_60  ?? 0);
        acc.bucket_61_90   += Number(r.bucket_61_90  ?? 0);
        acc.bucket_91_plus += Number(r.bucket_91_plus ?? 0);
        acc.total          += Number(r.total_outstanding ?? 0);
        return acc;
      },
      { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_91_plus: 0, total: 0 }
    );

    res.json({ rows: rows.rows, summary });
  } catch (err: any) {
    console.error("[reports] ar-aging error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Query failed" });
  }
});

// ── 司機抽成報表 ────────────────────────────────────────────────────────────
// Note: drivers table has commission_rate (numeric) as percentage value
reportsRouter.get("/reports/driver-commission", async (req, res) => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  try {
    const rows = await db.execute(sql`
      SELECT
        d.id                                                   AS driver_id,
        d.name                                                 AS driver_name,
        COALESCE(d.commission_rate, 0)                         AS commission_rate,
        d.driver_type,
        COUNT(o.id)                                            AS trip_count,
        COALESCE(SUM(o.total_fee), 0)                          AS total_revenue,
        COALESCE(SUM(o.extra_fee), 0)                          AS total_extra,
        ROUND((COALESCE(SUM(o.total_fee), 0)::numeric) * COALESCE(d.commission_rate, 0) / 100, 0) AS commission_amount,
        COALESCE(SUM(o.total_fee), 0)
          - ROUND((COALESCE(SUM(o.total_fee), 0)::numeric) * COALESCE(d.commission_rate, 0) / 100, 0)
                                                               AS platform_net,
        COALESCE(d.commission_rate, 0)                         AS effective_rate_pct
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id
        AND EXTRACT(YEAR  FROM COALESCE(o.completed_at, o.created_at)) = ${year}
        AND EXTRACT(MONTH FROM COALESCE(o.completed_at, o.created_at)) = ${month}
        AND o.status = 'delivered'
      WHERE d.status = 'active'
      GROUP BY d.id, d.name, d.commission_rate, d.driver_type
      ORDER BY total_revenue DESC
    `);

    const totals = (rows.rows as any[]).reduce(
      (acc, r) => {
        acc.trips        += Number(r.trip_count ?? 0);
        acc.revenue      += Number(r.total_revenue ?? 0);
        acc.commission   += Number(r.commission_amount ?? 0);
        acc.platform_net += Number(r.platform_net ?? 0);
        return acc;
      },
      { trips: 0, revenue: 0, commission: 0, platform_net: 0 }
    );

    res.json({ year, month, rows: rows.rows, totals });
  } catch (err: any) {
    console.error("[reports] driver-commission error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Query failed" });
  }
});

// ── 毛利報表（月度）─────────────────────────────────────────────────────────
reportsRouter.get("/reports/gross-margin", async (req, res) => {
  const months = Math.min(12, Number(req.query.months ?? 6));

  try {
    const rows = await db.execute(sql`
      WITH monthly_base AS (
        SELECT
          TO_CHAR(COALESCE(o.completed_at, o.created_at), 'YYYY-MM') AS month,
          COUNT(o.id)                                                  AS order_count,
          COALESCE(SUM(o.total_fee), 0)                               AS gross_revenue,
          COALESCE(SUM(o.total_fee::numeric * COALESCE(d.commission_rate, 70) / 100), 0) AS driver_cost,
          COALESCE(SUM(o.extra_fee), 0)                               AS extra_revenue,
          COUNT(o.id) FILTER (WHERE o.enterprise_id IS NOT NULL)       AS enterprise_orders,
          COUNT(o.id) FILTER (WHERE o.enterprise_id IS NULL)           AS retail_orders,
          COALESCE(SUM(o.total_fee) FILTER (WHERE o.enterprise_id IS NOT NULL), 0) AS enterprise_revenue,
          COALESCE(SUM(o.total_fee) FILTER (WHERE o.enterprise_id IS NULL), 0)     AS retail_revenue
        FROM orders o
        LEFT JOIN drivers d ON d.id = o.driver_id
        WHERE o.status = 'delivered'
          AND COALESCE(o.completed_at, o.created_at) >= NOW() - (${months} || ' months')::interval
        GROUP BY TO_CHAR(COALESCE(o.completed_at, o.created_at), 'YYYY-MM')
      ),
      monthly_franchise AS (
        SELECT
          TO_CHAR(created_at, 'YYYY-MM')       AS month,
          COALESCE(SUM(commission_amount), 0)  AS franchise_cost
        FROM franchisee_settlements
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      )
      SELECT
        mb.month,
        mb.order_count,
        mb.gross_revenue,
        mb.driver_cost,
        COALESCE(mf.franchise_cost, 0)                                  AS franchise_cost,
        mb.extra_revenue,
        mb.gross_revenue - mb.driver_cost - COALESCE(mf.franchise_cost, 0) AS gross_profit,
        CASE WHEN mb.gross_revenue > 0
          THEN ROUND(((mb.gross_revenue - mb.driver_cost - COALESCE(mf.franchise_cost, 0)) / mb.gross_revenue * 100)::numeric, 1)
          ELSE 0
        END AS gross_margin_pct,
        mb.enterprise_orders, mb.retail_orders,
        mb.enterprise_revenue, mb.retail_revenue
      FROM monthly_base mb
      LEFT JOIN monthly_franchise mf ON mf.month = mb.month
      ORDER BY mb.month DESC
      LIMIT ${months}
    `);

    res.json(rows.rows);
  } catch (err: any) {
    console.error("[reports] gross-margin error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Query failed" });
  }
});
