import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const pnlRouter = Router();

// GET /pnl/overview  — platform-level P&L
pnlRouter.get("/overview", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    let dateFilter = "";
    if (from) dateFilter += ` AND o.created_at >= '${from}'`;
    if (to)   dateFilter += ` AND o.created_at <= '${to} 23:59:59'`;

    // Route revenue & costs
    const routeRows = await db.execute(sql`
      WITH parsed AS (
        SELECT
          o.id,
          (regexp_match(o.notes, '司機ID：([0-9]+)'))[1]   AS shopee_id,
          (regexp_match(o.notes, '路線：([A-Z0-9]+)-'))[1] AS prefix,
          (regexp_match(o.notes, '路線：([^｜]+)'))[1]     AS route_id,
          o.required_vehicle_type,
          o.driver_payment_status,
          o.created_at
        FROM orders o
        WHERE o.notes LIKE '路線：%'
        ${sql.raw(dateFilter)}
      )
      SELECT
        p.prefix,
        pr.description,
        pr.service_type,
        pr.route_od,
        COUNT(*)                               AS route_count,
        SUM(COALESCE(pr.rate_per_trip, 0))     AS shopee_income,
        SUM(COALESCE(pr.driver_pay_rate, 0))   AS driver_cost,
        SUM(COALESCE(pr.rate_per_trip,0) - COALESCE(pr.driver_pay_rate,0)) AS gross_profit
      FROM parsed p
      LEFT JOIN route_prefix_rates pr ON pr.prefix = p.prefix
      GROUP BY p.prefix, pr.description, pr.service_type, pr.route_od
      ORDER BY gross_profit DESC NULLS LAST
    `);

    // Total penalties (already paid fines deducted from Shopee income)
    const penaltyRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(fine_amount), 0) AS total_penalty,
        COUNT(*) AS penalty_count
      FROM shopee_penalties
      WHERE source = 'NDD過刷異常' AND fine_amount > 0
      ${sql.raw(from ? `AND incident_date >= '${from}'` : "")}
      ${sql.raw(to   ? `AND incident_date <= '${to}'`   : "")}
    `);

    const routeData = routeRows.rows as any[];
    const penData   = (penaltyRows.rows as any[])[0];

    const totals = routeData.reduce(
      (acc, r) => ({
        route_count:  acc.route_count  + Number(r.route_count),
        shopee_income: acc.shopee_income + Number(r.shopee_income),
        driver_cost:  acc.driver_cost  + Number(r.driver_cost),
        gross_profit: acc.gross_profit + Number(r.gross_profit),
      }),
      { route_count: 0, shopee_income: 0, driver_cost: 0, gross_profit: 0 }
    );

    const totalPenalty = Number(penData.total_penalty);
    const netProfit    = totals.gross_profit - totalPenalty;
    const margin       = totals.shopee_income > 0
      ? Math.round((netProfit / totals.shopee_income) * 10000) / 100
      : 0;

    res.json({
      ok: true,
      totals: {
        ...totals,
        total_penalty: totalPenalty,
        penalty_count: Number(penData.penalty_count),
        net_profit: netProfit,
        margin_pct: margin,
      },
      byPrefix: routeData,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /pnl/by-vehicle  — per driver/vehicle P&L
pnlRouter.get("/by-vehicle", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    let dateFilter = "";
    if (from) dateFilter += ` AND o.created_at >= '${from}'`;
    if (to)   dateFilter += ` AND o.created_at <= '${to} 23:59:59'`;

    const rows = await db.execute(sql`
      WITH parsed AS (
        SELECT
          o.id,
          (regexp_match(o.notes, '司機ID：([0-9]+)'))[1]   AS shopee_id,
          (regexp_match(o.notes, '路線：([A-Z0-9]+)-'))[1] AS prefix,
          (regexp_match(o.notes, '路線：([^｜]+)'))[1]     AS route_id,
          o.required_vehicle_type,
          o.driver_payment_status,
          o.created_at
        FROM orders o
        WHERE o.notes LIKE '路線：%'
        ${sql.raw(dateFilter)}
      )
      SELECT
        COALESCE(p.shopee_id, '(未指派)')         AS shopee_id,
        sd.name                                    AS driver_name,
        sd.vehicle_plate,
        sd.fleet_name,
        sd.is_own_driver,
        COUNT(*)                                   AS route_count,
        SUM(COALESCE(pr.rate_per_trip,0))          AS shopee_income,
        SUM(COALESCE(pr.driver_pay_rate,0))        AS driver_cost,
        SUM(COALESCE(pr.rate_per_trip,0) - COALESCE(pr.driver_pay_rate,0)) AS gross_profit,
        COUNT(CASE WHEN p.driver_payment_status='paid' THEN 1 END) AS paid_routes,
        json_agg(json_build_object(
          'id', p.id,
          'route_id', p.route_id,
          'prefix', p.prefix,
          'service_type', pr.service_type,
          'shopee_rate', pr.rate_per_trip,
          'driver_rate', pr.driver_pay_rate,
          'profit', COALESCE(pr.rate_per_trip,0)-COALESCE(pr.driver_pay_rate,0),
          'payment_status', p.driver_payment_status,
          'created_at', p.created_at
        ) ORDER BY p.created_at) AS routes,
        COALESCE((
          SELECT SUM(sp.fine_amount)
          FROM shopee_penalties sp
          WHERE sp.driver_code = p.shopee_id
            AND sp.source = 'NDD過刷異常'
        ), 0) AS penalty_deduction
      FROM parsed p
      LEFT JOIN shopee_drivers sd ON sd.shopee_id = p.shopee_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = p.prefix
      GROUP BY p.shopee_id, sd.name, sd.vehicle_plate, sd.fleet_name, sd.is_own_driver
      ORDER BY gross_profit DESC NULLS LAST
    `);

    const vehicleData = (rows.rows as any[]).map(r => ({
      ...r,
      net_profit: Number(r.gross_profit) - Number(r.penalty_deduction),
      margin_pct: Number(r.shopee_income) > 0
        ? Math.round(((Number(r.gross_profit) - Number(r.penalty_deduction)) / Number(r.shopee_income)) * 10000) / 100
        : 0,
    }));

    res.json({ ok: true, vehicles: vehicleData });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /pnl/by-fleet  — per fleet P&L
pnlRouter.get("/by-fleet", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    let dateFilter = "";
    if (from) dateFilter += ` AND o.created_at >= '${from}'`;
    if (to)   dateFilter += ` AND o.created_at <= '${to} 23:59:59'`;

    const rows = await db.execute(sql`
      WITH parsed AS (
        SELECT
          o.id,
          (regexp_match(o.notes, '司機ID：([0-9]+)'))[1]   AS shopee_id,
          (regexp_match(o.notes, '路線：([A-Z0-9]+)-'))[1] AS prefix,
          o.driver_payment_status,
          o.created_at
        FROM orders o
        WHERE o.notes LIKE '路線：%'
        ${sql.raw(dateFilter)}
      )
      SELECT
        COALESCE(sd.fleet_name, '（未分車隊）') AS fleet_name,
        COUNT(DISTINCT p.shopee_id) AS driver_count,
        COUNT(*)                    AS route_count,
        SUM(COALESCE(pr.rate_per_trip,0))        AS shopee_income,
        SUM(COALESCE(pr.driver_pay_rate,0))      AS driver_cost,
        SUM(COALESCE(pr.rate_per_trip,0) - COALESCE(pr.driver_pay_rate,0)) AS gross_profit,
        COALESCE((
          SELECT SUM(sp.fine_amount)
          FROM shopee_penalties sp
          INNER JOIN shopee_drivers sd2 ON sd2.shopee_id = sp.driver_code
          WHERE COALESCE(sd2.fleet_name,'（未分車隊）') = COALESCE(sd.fleet_name,'（未分車隊）')
            AND sp.source = 'NDD過刷異常'
        ), 0) AS penalty_deduction
      FROM parsed p
      LEFT JOIN shopee_drivers sd ON sd.shopee_id = p.shopee_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = p.prefix
      GROUP BY fleet_name
      ORDER BY gross_profit DESC NULLS LAST
    `);

    const fleetData = (rows.rows as any[]).map(r => ({
      ...r,
      net_profit: Number(r.gross_profit) - Number(r.penalty_deduction),
      margin_pct: Number(r.shopee_income) > 0
        ? Math.round(((Number(r.gross_profit) - Number(r.penalty_deduction)) / Number(r.shopee_income)) * 10000) / 100
        : 0,
    }));

    res.json({ ok: true, fleets: fleetData });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /pnl/prefix-rates/:prefix  — update income & driver rate
pnlRouter.put("/prefix-rates/:prefix", async (req, res) => {
  try {
    const { prefix } = req.params;
    const { rate_per_trip, driver_pay_rate, service_type, route_od, description, pay_notes } = req.body;
    await db.execute(sql`
      UPDATE route_prefix_rates
      SET rate_per_trip    = ${rate_per_trip},
          driver_pay_rate  = ${driver_pay_rate},
          service_type     = ${service_type},
          route_od         = ${route_od},
          description      = ${description},
          pay_notes        = ${pay_notes ?? null},
          updated_at       = NOW()
      WHERE prefix = ${prefix}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
