import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const kpiDashboardRouter = Router();

kpiDashboardRouter.get("/kpi/dashboard", async (_req, res) => {
  try {
    const [summaryRes, vehicleRes, routeRes, costRes, arRes, customerArRes, driverRes] =
      await Promise.all([
        // ── 1. Today / Week summary ──────────────────────────────────────
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE status='delivered'
              AND completed_at::date = CURRENT_DATE)::int                       AS today_completed,
            COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int        AS today_total,
            COUNT(*) FILTER (WHERE status='delivered'
              AND created_at >= DATE_TRUNC('week', NOW()))::int                 AS week_completed,
            COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', NOW()))::int AS week_total,
            COUNT(*) FILTER (
              WHERE status='delivered'
                AND created_at >= DATE_TRUNC('week', NOW())
                AND (
                  (delivery_date IS NOT NULL
                    AND completed_at IS NOT NULL
                    AND completed_at::date <= delivery_date::date)
                  OR (delivery_date IS NULL AND pickup_date IS NOT NULL
                    AND completed_at IS NOT NULL
                    AND completed_at::date <= pickup_date::date + 1)
                  OR (delivery_date IS NULL AND pickup_date IS NULL)
                )
            )::int                                                               AS week_ontime,
            COUNT(*) FILTER (
              WHERE status NOT IN ('delivered','cancelled')
                AND pickup_date IS NOT NULL
                AND pickup_date::date < CURRENT_DATE
            )::int                                                               AS overdue_count,
            COUNT(*) FILTER (
              WHERE surcharge_reason IS NOT NULL AND surcharge_reason <> ''
                AND created_at >= DATE_TRUNC('week', NOW())
            )::int                                                               AS week_anomaly
          FROM orders
        `),

        // ── 2. Vehicle / Driver utilisation ─────────────────────────────
        db.execute(sql`
          SELECT
            d.id,
            d.name,
            d.license_plate,
            d.vehicle_type,
            d.status,
            COUNT(o.id) FILTER (WHERE o.status='delivered')::int                AS total_trips,
            COUNT(o.id) FILTER (WHERE o.status='delivered'
              AND o.completed_at::date = CURRENT_DATE)::int                     AS today_trips,
            COUNT(o.id) FILTER (WHERE o.status='delivered'
              AND o.created_at >= NOW() - INTERVAL '7 days')::int               AS week_trips,
            ROUND(
              COUNT(o.id) FILTER (WHERE o.status='delivered'
                AND o.created_at >= NOW() - INTERVAL '7 days')::numeric / 7.0, 1
            )                                                                    AS avg_daily_trips
          FROM drivers d
          LEFT JOIN orders o ON o.driver_id = d.id
          GROUP BY d.id, d.name, d.license_plate, d.vehicle_type, d.status
          ORDER BY total_trips DESC
          LIMIT 20
        `),

        // ── 3. Profit by route/region ────────────────────────────────────
        db.execute(sql`
          SELECT
            COALESCE(region, '未設定')                                          AS route,
            COUNT(*) FILTER (WHERE status='delivered')::int                     AS trips,
            COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)       AS revenue,
            COALESCE(AVG(total_fee) FILTER (WHERE status='delivered'), 0)       AS avg_fee,
            COALESCE(AVG(distance_km)
              FILTER (WHERE status='delivered' AND distance_km > 0), 0)         AS avg_km
          FROM orders
          WHERE created_at >= DATE_TRUNC('month', NOW())
          GROUP BY COALESCE(region, '未設定')
          ORDER BY revenue DESC
          LIMIT 10
        `),

        // ── 4. Cost structure this month ─────────────────────────────────
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE status='delivered')::int                     AS month_trips,
            COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)       AS month_revenue,
            COALESCE(SUM(surcharge_amount) FILTER (WHERE status='delivered'), 0) AS month_surcharge,
            COALESCE(SUM(wait_minutes)     FILTER (WHERE status='delivered'), 0) AS month_wait_min,
            COALESCE(SUM(distance_km)
              FILTER (WHERE status='delivered' AND distance_km > 0), 0)         AS month_km
          FROM orders
          WHERE created_at >= DATE_TRUNC('month', NOW())
        `),

        // ── 5a. AR aging buckets ─────────────────────────────────────────
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE fee_status='unpaid')::int                    AS unpaid_count,
            COALESCE(SUM(total_fee) FILTER (WHERE fee_status='unpaid'), 0)      AS unpaid_amount,
            COUNT(*) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '30 days')::int                 AS d30_count,
            COALESCE(SUM(total_fee) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '30 days'), 0)                  AS d30_amount,
            COUNT(*) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '60 days')::int                 AS d60_count,
            COALESCE(SUM(total_fee) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '60 days'), 0)                  AS d60_amount,
            COUNT(*) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '90 days')::int                 AS d90_count,
            COALESCE(SUM(total_fee) FILTER (WHERE fee_status='unpaid'
              AND created_at < NOW() - INTERVAL '90 days'), 0)                  AS d90_amount
          FROM orders
          WHERE status = 'delivered'
        `),

        // ── 5b. Top customer credit exposure ────────────────────────────
        db.execute(sql`
          SELECT
            customer_name,
            customer_phone,
            COUNT(*)::int                                                        AS unpaid_orders,
            COALESCE(SUM(total_fee), 0)                                         AS exposure,
            MIN(created_at)                                                      AS oldest_unpaid
          FROM orders
          WHERE status='delivered' AND fee_status='unpaid' AND total_fee IS NOT NULL
          GROUP BY customer_name, customer_phone
          ORDER BY exposure DESC
          LIMIT 10
        `),

        // ── 6. Driver performance this month ─────────────────────────────
        db.execute(sql`
          SELECT
            d.id,
            d.name,
            d.license_plate,
            d.vehicle_type,
            COUNT(o.id) FILTER (WHERE o.status='delivered')::int                AS completed,
            COUNT(o.id) FILTER (WHERE o.status='cancelled')::int                AS cancelled,
            COUNT(o.id) FILTER (
              WHERE o.status='delivered'
                AND o.pickup_date IS NOT NULL
                AND o.completed_at IS NOT NULL
                AND o.completed_at::date <= o.pickup_date::date + 1
            )::int                                                               AS ontime,
            ROUND(COALESCE(AVG(r.stars), 0)::numeric, 1)                       AS avg_rating,
            COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)   AS revenue
          FROM drivers d
          LEFT JOIN orders o
            ON o.driver_id = d.id
            AND o.created_at >= DATE_TRUNC('month', NOW())
          LEFT JOIN driver_ratings r
            ON r.driver_id = d.id
            AND r.created_at >= DATE_TRUNC('month', NOW())
          GROUP BY d.id, d.name, d.license_plate, d.vehicle_type
          ORDER BY completed DESC
          LIMIT 20
        `),
      ]);

    const s = summaryRes.rows[0] as Record<string, unknown>;
    const c = costRes.rows[0] as Record<string, unknown>;
    const ar = arRes.rows[0] as Record<string, unknown>;

    const monthTrips   = Number(c.month_trips)   || 0;
    const monthRevenue = Number(c.month_revenue)  || 0;
    const monthKm      = Number(c.month_km)       || 0;
    const monthSurcharge = Number(c.month_surcharge) || 0;
    const monthWaitMin   = Number(c.month_wait_min)  || 0;

    const fuelCost       = Math.round(monthTrips * 320);
    const tollCost       = Math.round(monthTrips * 180);
    const depreciation   = Math.round(monthTrips * 250);
    const commissionCost = Math.round(monthRevenue * 0.15);
    const waitFee        = Math.round(monthWaitMin * 5);
    const totalCost      = fuelCost + tollCost + depreciation + commissionCost + monthSurcharge + waitFee;
    const grossProfit    = monthRevenue - totalCost;

    const weekCompleted = Number(s.week_completed) || 0;
    const weekOntime    = Number(s.week_ontime)    || 0;
    const todayTotal    = Number(s.today_total)    || 0;
    const todayCompleted = Number(s.today_completed) || 0;

    const allDrivers    = vehicleRes.rows as Record<string, unknown>[];
    const availableCount = allDrivers.filter(d => d.status === "available").length;
    const busyCount      = allDrivers.filter(d => d.status === "busy").length;
    const offlineCount   = allDrivers.filter(d => d.status === "offline").length;

    const driverPerf = (driverRes.rows as Record<string, unknown>[]).map(d => ({
      id:           d.id,
      name:         d.name,
      license_plate: d.license_plate,
      vehicle_type: d.vehicle_type,
      completed:    Number(d.completed),
      cancelled:    Number(d.cancelled),
      ontime:       Number(d.ontime),
      ontime_rate:  Number(d.completed) > 0
        ? Math.round(Number(d.ontime) / Number(d.completed) * 100) : 0,
      avg_rating:   Number(d.avg_rating),
      revenue:      Number(d.revenue),
    }));

    res.json({
      summary: {
        today_completed:      todayCompleted,
        today_total:          todayTotal,
        today_completion_rate: todayTotal > 0 ? Math.round(todayCompleted / todayTotal * 100) : 0,
        week_completed:       weekCompleted,
        week_total:           Number(s.week_total) || 0,
        week_ontime:          weekOntime,
        week_ontime_rate:     weekCompleted > 0 ? Math.round(weekOntime / weekCompleted * 100) : 0,
        overdue_count:        Number(s.overdue_count) || 0,
        week_anomaly:         Number(s.week_anomaly)  || 0,
      },
      vehicleUtil: {
        drivers:       allDrivers,
        total:         allDrivers.length,
        available:     availableCount,
        busy:          busyCount,
        offline:       offlineCount,
        idle_rate:     allDrivers.length > 0
          ? Math.round(availableCount / allDrivers.length * 100) : 0,
      },
      profit: {
        month_revenue:   monthRevenue,
        month_cost:      totalCost,
        month_profit:    grossProfit,
        month_margin:    monthRevenue > 0 ? Math.round(grossProfit / monthRevenue * 100) : 0,
        per_km_profit:   monthKm > 0 ? Math.round(grossProfit / monthKm) : 0,
        by_route:        routeRes.rows,
      },
      costBreakdown: {
        month_trips:  monthTrips,
        month_revenue: monthRevenue,
        fuel:         fuelCost,
        toll:         tollCost,
        depreciation,
        commission:   commissionCost,
        surcharge:    monthSurcharge + waitFee,
        total:        totalCost,
      },
      ar: {
        unpaid_count:  Number(ar.unpaid_count)  || 0,
        unpaid_amount: Number(ar.unpaid_amount) || 0,
        current:       Math.max(0, (Number(ar.unpaid_amount) || 0) - (Number(ar.d30_amount) || 0)),
        d30_count:     Number(ar.d30_count)     || 0,
        d30_amount:    Number(ar.d30_amount)    || 0,
        d60_count:     Number(ar.d60_count)     || 0,
        d60_amount:    Number(ar.d60_amount)    || 0,
        d90_count:     Number(ar.d90_count)     || 0,
        d90_amount:    Number(ar.d90_amount)    || 0,
        top_customers: customerArRes.rows,
      },
      driverPerf,
    });
  } catch (err) {
    console.error("[KPI Dashboard]", err);
    res.status(500).json({ error: "KPI 資料載入失敗" });
  }
});
