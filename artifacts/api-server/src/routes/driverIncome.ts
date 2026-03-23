import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const driverIncomeRouter = Router();

// GET /api/driver-income/leaderboard - MUST be before /:driverId
driverIncomeRouter.get("/driver-income/leaderboard", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT d.id, d.name, d.vehicle_type, d.license_plate,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(o.total_fee), 0) AS gross_earnings,
           ROUND(AVG(r.stars)::numeric, 2) AS avg_rating
    FROM drivers d
    LEFT JOIN orders o ON o.driver_id = d.id 
      AND o.status = 'delivered'
      AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
    LEFT JOIN driver_ratings r ON r.driver_id = d.id
    GROUP BY d.id, d.name, d.vehicle_type, d.license_plate
    ORDER BY gross_earnings DESC
    LIMIT 20
  `);
  res.json(rows.rows);
});

// GET /api/driver-income/:driverId - comprehensive income stats
driverIncomeRouter.get("/driver-income/:driverId", async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { period = "month" } = req.query as { period?: string };

  const interval = period === "week" ? "7 days" : period === "year" ? "365 days" : "30 days";

  const summary = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'delivered') AS completed_orders,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
      COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS gross_earnings,
      COALESCE(SUM(distance_km) FILTER (WHERE status = 'delivered'), 0) AS total_km,
      COALESCE(AVG(total_fee) FILTER (WHERE status = 'delivered'), 0) AS avg_fee_per_order,
      MIN(created_at) FILTER (WHERE status = 'delivered') AS earliest_order,
      MAX(created_at) FILTER (WHERE status = 'delivered') AS latest_order
    FROM orders
    WHERE driver_id = ${driverId}
      AND created_at >= NOW() - ${sql.raw(`INTERVAL '${interval}'`)}
  `);

  const dailyBreakdown = await db.execute(sql`
    SELECT 
      DATE(created_at) AS day,
      COUNT(*) FILTER (WHERE status = 'delivered') AS order_count,
      COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS earnings,
      COALESCE(SUM(distance_km) FILTER (WHERE status = 'delivered'), 0) AS km
    FROM orders
    WHERE driver_id = ${driverId}
      AND created_at >= NOW() - ${sql.raw(`INTERVAL '${interval}'`)}
    GROUP BY DATE(created_at)
    ORDER BY day DESC
    LIMIT 30
  `);

  const orderHistory = await db.execute(sql`
    SELECT o.id, o.status, o.pickup_address, o.delivery_address, 
           o.cargo_description, o.total_fee, o.distance_km,
           o.created_at, o.completed_at,
           (SELECT ROUND(AVG(stars)::numeric,1) FROM driver_ratings WHERE order_id = o.id) AS rating
    FROM orders o
    WHERE o.driver_id = ${driverId} AND o.status = 'delivered'
    ORDER BY o.created_at DESC
    LIMIT 50
  `);

  const ratingStats = await db.execute(sql`
    SELECT 
      ROUND(AVG(stars)::numeric, 2) AS avg_stars,
      COUNT(*) AS total_ratings,
      COUNT(*) FILTER (WHERE stars = 5) AS five_stars,
      COUNT(*) FILTER (WHERE stars >= 4) AS four_plus_stars
    FROM driver_ratings
    WHERE driver_id = ${driverId}
  `);

  // Get deduction rate from config
  const cfgRows = await db.execute(sql`SELECT value FROM pricing_config WHERE key = 'driver_deduction_rate'`);
  const deductionRate = (cfgRows.rows as any[])[0]?.value ? Number((cfgRows.rows as any[])[0].value) : 15;

  const gross = Number((summary.rows[0] as any)?.gross_earnings ?? 0);
  const deductionAmount = Math.round(gross * deductionRate / 100);
  const netEarnings = gross - deductionAmount;

  res.json({
    summary: {
      ...(summary.rows[0] as any),
      deductionRate,
      deductionAmount,
      netEarnings,
    },
    dailyBreakdown: dailyBreakdown.rows,
    orderHistory: orderHistory.rows,
    ratings: ratingStats.rows[0],
  });
});

// GET /api/driver-income/:driverId/settlements - settlement history
driverIncomeRouter.get("/driver-income/:driverId/settlements", async (req, res) => {
  const rows = await db.execute(sql`
    SELECT * FROM driver_settlements
    WHERE driver_id = ${Number(req.params.driverId)}
    ORDER BY period_start DESC
    LIMIT 12
  `);
  res.json(rows.rows);
});

// POST /api/driver-income/settle - create a settlement
driverIncomeRouter.post("/driver-income/settle", async (req, res) => {
  const { driverId, periodStart, periodEnd } = req.body;

  // Calculate earnings for period
  const earningsRows = await db.execute(sql`
    SELECT 
      COUNT(*) AS order_count,
      COALESCE(SUM(total_fee), 0) AS gross_earnings,
      COALESCE(SUM(distance_km), 0) AS km_total
    FROM orders
    WHERE driver_id = ${Number(driverId)}
      AND status = 'delivered'
      AND DATE(created_at) BETWEEN ${periodStart} AND ${periodEnd}
  `);
  const stats = (earningsRows.rows[0] as any);

  const cfgRows = await db.execute(sql`SELECT value FROM pricing_config WHERE key = 'driver_deduction_rate'`);
  const deductionRate = (cfgRows.rows as any[])[0]?.value ? Number((cfgRows.rows as any[])[0].value) : 15;

  const gross = Number(stats.gross_earnings);
  const deductionAmount = Math.round(gross * deductionRate / 100);
  const netEarnings = gross - deductionAmount;

  await db.execute(sql`
    INSERT INTO driver_settlements (driver_id, period_start, period_end, gross_earnings, 
      deduction_rate, deduction_amount, net_earnings, order_count, km_total)
    VALUES (${Number(driverId)}, ${periodStart}, ${periodEnd}, ${gross},
            ${deductionRate}, ${deductionAmount}, ${netEarnings},
            ${Number(stats.order_count)}, ${Number(stats.km_total)})
  `);

  res.json({ ok: true, gross, deductionAmount, netEarnings, orderCount: stats.order_count });
});

