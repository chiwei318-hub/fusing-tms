/**
 * cashFlow.ts
 * 金流拆解 API — 按訂單/月份拆解收入到：司機、加盟主、平台淨利
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const cashFlowRouter = Router();

// ─── 月度金流摘要 ─────────────────────────────────────────────────────────
cashFlowRouter.get("/cash-flow/monthly", async (req, res) => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  // 訂單收入 + 司機薪資（用各司機的 commission_rate）
  const orderRows = await db.execute(sql`
    SELECT
      COUNT(*)                                                AS order_count,
      COALESCE(SUM(o.total_fee), 0)                          AS total_revenue,
      COALESCE(SUM(
        ROUND((o.total_fee * COALESCE(d.commission_rate, 15) / 100)::numeric, 0)
      ), 0)                                                   AS driver_payout,
      COALESCE(SUM(o.total_fee) FILTER (WHERE o.enterprise_id IS NOT NULL), 0) AS enterprise_revenue,
      COALESCE(SUM(o.total_fee) FILTER (WHERE o.enterprise_id IS NULL), 0)     AS retail_revenue,
      COUNT(*) FILTER (WHERE o.status = 'delivered')         AS delivered_count,
      COUNT(*) FILTER (WHERE o.status = 'cancelled')         AS cancelled_count
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.status IN ('delivered', 'assigned', 'in_transit', 'pending', 'cancelled')
      AND EXTRACT(YEAR  FROM o.created_at) = ${year}
      AND EXTRACT(MONTH FROM o.created_at) = ${month}
  `);

  // 加盟主結算（該月份已產出的結算總額）
  const franchiseRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(gross_revenue), 0)    AS franchise_gross,
      COALESCE(SUM(commission_amount), 0) AS franchise_payout,
      COALESCE(SUM(platform_fee), 0)      AS franchise_platform_fee,
      COUNT(*)                            AS settlement_count
    FROM franchisee_settlements
    WHERE period_year = ${year} AND period_month = ${month}
  `);

  // 車輛成本（該月已記錄）
  const costRows = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total_vehicle_cost
    FROM cost_events
    WHERE EXTRACT(YEAR  FROM occurred_at) = ${year}
      AND EXTRACT(MONTH FROM occurred_at) = ${month}
  `).catch(() => ({ rows: [{ total_vehicle_cost: 0 }] }));

  const o  = (orderRows.rows as any[])[0];
  const fr = (franchiseRows.rows as any[])[0];
  const co = (costRows.rows as any[])[0];

  const totalRevenue   = Number(o.total_revenue);
  const driverPayout   = Number(o.driver_payout);
  const franchisePayout = Number(fr.franchise_payout);
  const vehicleCost    = Number(co.total_vehicle_cost);
  const platformProfit = totalRevenue - driverPayout - franchisePayout - vehicleCost;
  const profitMargin   = totalRevenue > 0 ? Math.round((platformProfit / totalRevenue) * 100) : 0;

  res.json({
    year, month,
    order_count:      Number(o.order_count),
    delivered_count:  Number(o.delivered_count),
    cancelled_count:  Number(o.cancelled_count),
    total_revenue:    totalRevenue,
    enterprise_revenue: Number(o.enterprise_revenue),
    retail_revenue:   Number(o.retail_revenue),
    driver_payout:    driverPayout,
    franchise_payout: franchisePayout,
    vehicle_cost:     vehicleCost,
    platform_profit:  platformProfit,
    profit_margin:    profitMargin,
    franchise_settlement_count: Number(fr.settlement_count),
  });
});

// ─── 月度趨勢（最近 N 個月）────────────────────────────────────────────────
cashFlowRouter.get("/cash-flow/trend", async (req, res) => {
  const months = Math.min(Number(req.query.months ?? 6), 12);

  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM')     AS period,
      COALESCE(SUM(o.total_fee), 0)                              AS total_revenue,
      COALESCE(SUM(
        ROUND((o.total_fee * COALESCE(d.commission_rate, 15) / 100)::numeric, 0)
      ), 0)                                                       AS driver_payout,
      COUNT(*) FILTER (WHERE o.status = 'delivered')             AS delivered_count,
      COUNT(*)                                                    AS order_count
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.created_at >= NOW() - (${months} || ' months')::INTERVAL
    GROUP BY DATE_TRUNC('month', o.created_at)
    ORDER BY period ASC
  `);

  // Enrich with franchise payout for each period
  const periodRows = rows.rows as any[];
  const enriched = await Promise.all(
    periodRows.map(async (r) => {
      const [yr, mo] = r.period.split("-").map(Number);
      const fs = await db.execute(sql`
        SELECT COALESCE(SUM(commission_amount), 0) AS franchise_payout
        FROM franchisee_settlements
        WHERE period_year = ${yr} AND period_month = ${mo}
      `);
      const fp = Number((fs.rows[0] as any)?.franchise_payout ?? 0);
      const rev = Number(r.total_revenue);
      const dp  = Number(r.driver_payout);
      return {
        period:          r.period,
        total_revenue:   rev,
        driver_payout:   dp,
        franchise_payout: fp,
        platform_profit: rev - dp - fp,
        order_count:     Number(r.order_count),
        delivered_count: Number(r.delivered_count),
      };
    })
  );

  res.json(enriched);
});

// ─── 訂單級別金流明細 ────────────────────────────────────────────────────
cashFlowRouter.get("/cash-flow/orders", async (req, res) => {
  const year   = Number(req.query.year  ?? new Date().getFullYear());
  const month  = Number(req.query.month ?? new Date().getMonth() + 1);
  const page   = Math.max(1, Number(req.query.page  ?? 1));
  const limit  = Math.min(100, Number(req.query.limit ?? 30));
  const offset = (page - 1) * limit;

  const rows = await db.execute(sql`
    SELECT
      o.id, o.created_at, o.status,
      o.customer_name, o.customer_phone,
      o.pickup_address, o.delivery_address,
      o.total_fee,
      d.id             AS driver_id,
      d.name           AS driver_name,
      COALESCE(d.commission_rate, 15)    AS driver_commission_rate,
      ROUND((o.total_fee * COALESCE(d.commission_rate, 15) / 100)::numeric, 0) AS driver_payout,
      ROUND((o.total_fee - (o.total_fee * COALESCE(d.commission_rate, 15) / 100))::numeric, 0) AS platform_net,
      o.enterprise_id,
      ea.company_name  AS enterprise_name
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    LEFT JOIN enterprise_accounts ea ON ea.id = o.enterprise_id
    WHERE o.total_fee IS NOT NULL AND o.total_fee > 0
      AND EXTRACT(YEAR  FROM o.created_at) = ${year}
      AND EXTRACT(MONTH FROM o.created_at) = ${month}
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRow = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE total_fee IS NOT NULL AND total_fee > 0
      AND EXTRACT(YEAR  FROM created_at) = ${year}
      AND EXTRACT(MONTH FROM created_at) = ${month}
  `);

  res.json({
    data:  rows.rows,
    total: Number((countRow.rows[0] as any)?.total ?? 0),
    page, limit,
  });
});

// ─── 各司機金流彙總（當月）────────────────────────────────────────────────
cashFlowRouter.get("/cash-flow/by-driver", async (req, res) => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  const rows = await db.execute(sql`
    SELECT
      d.id, d.name, d.vehicle_type, d.license_plate,
      COALESCE(d.commission_rate, 15)                             AS commission_rate,
      COUNT(o.id) FILTER (WHERE o.status = 'delivered')          AS delivered_count,
      COALESCE(SUM(o.total_fee) FILTER (WHERE o.status = 'delivered'), 0) AS gross_revenue,
      COALESCE(SUM(
        ROUND((o.total_fee * COALESCE(d.commission_rate, 15) / 100)::numeric, 0)
      ) FILTER (WHERE o.status = 'delivered'), 0)                AS driver_payout,
      COALESCE(SUM(
        ROUND((o.total_fee - o.total_fee * COALESCE(d.commission_rate, 15) / 100)::numeric, 0)
      ) FILTER (WHERE o.status = 'delivered'), 0)                AS platform_net
    FROM drivers d
    LEFT JOIN orders o ON o.driver_id = d.id
      AND EXTRACT(YEAR  FROM o.created_at) = ${year}
      AND EXTRACT(MONTH FROM o.created_at) = ${month}
    GROUP BY d.id, d.name, d.vehicle_type, d.license_plate, d.commission_rate
    ORDER BY gross_revenue DESC
    LIMIT 50
  `);

  res.json(rows.rows);
});

// ─── 加盟主金流彙總（當月）────────────────────────────────────────────────
cashFlowRouter.get("/cash-flow/by-franchisee", async (req, res) => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  const rows = await db.execute(sql`
    SELECT
      f.id, f.code, f.name, f.commission_rate,
      s.order_count, s.gross_revenue, s.commission_amount AS franchisee_payout,
      s.platform_fee, s.monthly_fee, s.net_payout, s.status
    FROM franchisees f
    LEFT JOIN franchisee_settlements s
      ON s.franchisee_id = f.id
      AND s.period_year  = ${year}
      AND s.period_month = ${month}
    WHERE f.status = 'active'
    ORDER BY f.code ASC
  `);

  res.json(rows.rows);
});
