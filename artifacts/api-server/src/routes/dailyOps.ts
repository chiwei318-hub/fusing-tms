/**
 * Daily Operations KPI & Reporting API
 *
 * Endpoints:
 *  GET /api/ops/daily            — Real-time daily metrics (refreshed on call)
 *  GET /api/ops/weekly-summary   — Week/month performance per zone, customer, route
 *  GET /api/ops/driver-ranking   — Driver leaderboard with composite score
 *  GET /api/ops/vehicle-utilization — Per-driver utilization + empty-car rate
 *  GET /api/ops/ar-aging         — AR aging buckets per customer
 *  GET /api/ops/on-time-trend    — Hourly on-time rate last N days
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { taipeiDate } from "../lib/timezone";

export const dailyOpsRouter = Router();

// ── Shared helper ─────────────────────────────────────────────────────────
type DateRange = { from: string; to: string };

function buildDateRange(queryFrom: string | undefined, queryTo: string | undefined): DateRange {
  const to   = queryTo   ?? taipeiDate();
  const from = queryFrom ?? taipeiDate();
  return { from, to };
}

// ── GET /api/ops/daily ─────────────────────────────────────────────────────
dailyOpsRouter.get("/ops/daily", async (req, res) => {
  try {
    const { date, zone_id } = req.query as Record<string, string>;
    const day = date ?? taipeiDate();
    const zoneFilter = zone_id ? `AND zone_id = ${Number(zone_id)}` : "";

    const [orderRes, driverRes, exceptionRes, delayRes] = await Promise.all([

      // Order metrics for the day
      pool.query(`
        SELECT
          COUNT(*)::int                                                        AS total,
          COUNT(*) FILTER (WHERE status='delivered')::int                     AS completed,
          COUNT(*) FILTER (WHERE status='pending')::int                       AS pending,
          COUNT(*) FILTER (WHERE status IN ('assigned','arrived','loading','in_transit'))::int AS active,
          COUNT(*) FILTER (WHERE status='cancelled')::int                     AS cancelled,
          COUNT(*) FILTER (WHERE status='exception')::int                     AS exception_count,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS revenue,
          COALESCE(AVG(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS avg_order_value,
          -- Reassignment count (rough: orders that have had >1 driver assignment)
          COUNT(*) FILTER (
            WHERE driver_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM order_status_history h
                WHERE h.order_id = orders.id AND h.note LIKE '改派%'
              )
          )::int AS reassignment_count
        FROM orders
        WHERE created_at::date = $1::date ${zoneFilter}
      `, [day]),

      // Driver utilization
      pool.query(`
        SELECT
          COUNT(*)::int AS total_drivers,
          COUNT(*) FILTER (WHERE status='available')::int  AS available,
          COUNT(*) FILTER (WHERE status='busy')::int       AS busy,
          COUNT(*) FILTER (WHERE status='offline')::int    AS offline,
          -- Empty-car rate = available / (available + busy) × 100
          CASE
            WHEN COUNT(*) FILTER (WHERE status IN ('available','busy')) = 0 THEN 0
            ELSE ROUND(
              COUNT(*) FILTER (WHERE status='available')::numeric /
              NULLIF(COUNT(*) FILTER (WHERE status IN ('available','busy')), 0) * 100
            , 1)
          END AS empty_car_pct
        FROM drivers
        WHERE status != 'inactive'
          ${zone_id ? `AND zone_id = ${Number(zone_id)}` : ""}
      `),

      // Exception breakdown for the day
      pool.query(`
        SELECT
          exception_code,
          exception_attribution,
          COUNT(*)::int AS count
        FROM orders
        WHERE exception_at::date = $1::date
          AND exception_code IS NOT NULL
          ${zoneFilter}
        GROUP BY exception_code, exception_attribution
        ORDER BY count DESC
      `, [day]),

      // On-time vs delayed (using pickup_date/pickup_time as SLA)
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='delivered')::int AS delivered_total,
          COUNT(*) FILTER (
            WHERE status='delivered'
              AND completed_at IS NOT NULL
              AND (
                -- Delivered before or on same day as pickup_date
                completed_at::date <= COALESCE(delivery_date::date, pickup_date::date + 1)
                OR delivery_date IS NULL
              )
          )::int AS on_time,
          COUNT(*) FILTER (
            WHERE status='delivered'
              AND completed_at IS NOT NULL
              AND delivery_date IS NOT NULL
              AND completed_at::date > delivery_date::date
          )::int AS delayed
        FROM orders
        WHERE created_at::date = $1::date ${zoneFilter}
      `, [day]),
    ]);

    const orders  = orderRes.rows[0]  as Record<string, unknown>;
    const drivers = driverRes.rows[0] as Record<string, unknown>;
    const delay   = delayRes.rows[0]  as Record<string, unknown>;
    const delTotal = Number(delay.delivered_total);
    const onTime   = Number(delay.on_time);

    const onTimePct = delTotal > 0 ? Math.round(onTime / delTotal * 100) : null;

    // Vehicle utilization = busy / (available + busy) * 100
    const vehicleUtil = 100 - Number(drivers.empty_car_pct ?? 0);

    res.json({
      date: day,
      zoneId: zone_id ? Number(zone_id) : null,
      orders: {
        ...orders,
        completion_rate: Number(orders.total) > 0
          ? Math.round(Number(orders.completed) / Number(orders.total) * 100)
          : null,
      },
      drivers: {
        ...drivers,
        vehicle_utilization_pct: vehicleUtil,
      },
      onTime: {
        on_time:       onTime,
        delayed:       Number(delay.delayed),
        total:         delTotal,
        on_time_pct:   onTimePct,
      },
      exceptions: exceptionRes.rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/ops/weekly-summary ────────────────────────────────────────────
dailyOpsRouter.get("/ops/weekly-summary", async (req, res) => {
  try {
    const { from, to, zone_id, group_by = "day" } = req.query as Record<string, string>;
    const range = buildDateRange(from, to);
    const zoneFilter = zone_id ? `AND zone_id = ${Number(zone_id)}` : "";

    const trunc = group_by === "month" ? "month" : group_by === "week" ? "week" : "day";

    const [trendRes, customerRes, routeRes, outsourceRes, arRes] = await Promise.all([

      // Daily/weekly trend
      pool.query(`
        SELECT
          DATE_TRUNC($1, created_at)::date         AS period,
          COUNT(*)::int                             AS total_orders,
          COUNT(*) FILTER (WHERE status='delivered')::int AS completed,
          COUNT(*) FILTER (WHERE status='exception')::int AS exceptions,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS revenue,
          COUNT(*) FILTER (
            WHERE status='delivered' AND delivery_date IS NOT NULL
              AND completed_at::date > delivery_date::date
          )::int AS delayed
        FROM orders
        WHERE created_at >= $2 AND created_at < ($3::date + 1)
          ${zoneFilter}
        GROUP BY DATE_TRUNC($1, created_at)
        ORDER BY period
      `, [trunc, range.from, range.to]),

      // Per-customer performance (grouped by name since no FK on orders)
      pool.query(`
        SELECT
          COALESCE(o.customer_name, '未知客戶') AS customer,
          COUNT(*)::int                          AS total_orders,
          COUNT(*) FILTER (WHERE o.status='delivered')::int AS completed,
          COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric AS revenue,
          ROUND(COUNT(*) FILTER (WHERE o.status='delivered')::numeric
            / NULLIF(COUNT(*), 0) * 100, 1)     AS completion_rate
        FROM orders o
        WHERE o.created_at >= $1 AND o.created_at < ($2::date + 1)
          ${zoneFilter}
        GROUP BY COALESCE(o.customer_name, '未知客戶')
        ORDER BY revenue DESC
        LIMIT 20
      `, [range.from, range.to]),

      // Per-route (region) performance
      pool.query(`
        SELECT
          COALESCE(region, '未設定') AS route,
          COUNT(*)::int               AS total_orders,
          COUNT(*) FILTER (WHERE status='delivered')::int AS completed,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS revenue,
          COALESCE(AVG(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS avg_fee
        FROM orders
        WHERE created_at >= $1 AND created_at < ($2::date + 1)
          ${zoneFilter}
        GROUP BY COALESCE(region, '未設定')
        ORDER BY revenue DESC
        LIMIT 15
      `, [range.from, range.to]),

      // Outsource vs self-delivery ratio
      pool.query(`
        SELECT
          COUNT(*)::int                              AS total_orders,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM approval_requests ar
            WHERE ar.order_id = orders.id
              AND ar.action_type = 'outsource_order'
              AND ar.status = 'approved'
          ))::int                                    AS outsourced_count
        FROM orders
        WHERE created_at >= $1 AND created_at < ($2::date + 1)
          ${zoneFilter}
      `, [range.from, range.to]),

      // AR overdue — join via customer_name (no FK on orders)
      pool.query(`
        SELECT
          c.name AS customer,
          c.id   AS customer_id,
          c.credit_days,
          c.billing_cycle,
          COALESCE(SUM(o.total_fee) FILTER (
            WHERE o.status='delivered'
              AND o.completed_at < NOW() - INTERVAL '1 day' * COALESCE(c.credit_days, 30)
              AND o.payment_confirmed_at IS NULL
          ), 0)::numeric AS overdue_amount,
          COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric AS total_revenue
        FROM customers c
        LEFT JOIN orders o ON o.customer_name = c.name
          AND o.created_at >= $1 AND o.created_at < ($2::date + 1)
        WHERE c.is_blacklisted = false
        GROUP BY c.name, c.id, c.credit_days, c.billing_cycle
        HAVING COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0) > 0
        ORDER BY overdue_amount DESC
        LIMIT 15
      `, [range.from, range.to]),
    ]);

    const out = outsourceRes.rows[0] as Record<string, unknown>;
    const outsourcePct = Number(out.total_orders) > 0
      ? Math.round(Number(out.outsourced_count) / Number(out.total_orders) * 100)
      : 0;

    res.json({
      range,
      trend:          trendRes.rows,
      perCustomer:    customerRes.rows,
      perRoute:       routeRes.rows,
      outsource:      { ...out, outsource_pct: outsourcePct },
      arOverdue:      arRes.rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/ops/driver-ranking ────────────────────────────────────────────
dailyOpsRouter.get("/ops/driver-ranking", async (req, res) => {
  try {
    const { from, to, zone_id, limit = "20" } = req.query as Record<string, string>;
    const range = buildDateRange(from, to);
    const zoneFilter = zone_id ? `AND d.zone_id = ${Number(zone_id)}` : "";

    const { rows } = await pool.query(`
      SELECT
        d.id, d.name, d.license_plate, d.vehicle_type, d.status,
        d.zone_id, d.team_id,
        COUNT(o.id)::int                              AS total_orders,
        COUNT(o.id) FILTER (WHERE o.status='delivered')::int AS completed,
        COUNT(o.id) FILTER (WHERE o.status='cancelled')::int AS cancelled,
        COUNT(o.id) FILTER (WHERE o.status='exception')::int AS exceptions,
        COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric AS revenue,
        ROUND(COALESCE(AVG(r.stars), 0)::numeric, 1)  AS avg_rating,
        COUNT(r.id)::int                              AS rating_count,
        -- On-time rate
        ROUND(
          COUNT(o.id) FILTER (
            WHERE o.status='delivered'
              AND (o.delivery_date IS NULL
                OR o.completed_at::date <= o.delivery_date::date)
          )::numeric
          / NULLIF(COUNT(o.id) FILTER (WHERE o.status='delivered'), 0) * 100
        , 1)                                          AS on_time_pct,
        -- Composite score (higher is better)
        ROUND(
          (COUNT(o.id) FILTER (WHERE o.status='delivered')::numeric * 2)
          + (COALESCE(AVG(r.stars), 3) * 5)
          - (COUNT(o.id) FILTER (WHERE o.status='exception') * 3)
          - (COUNT(o.id) FILTER (WHERE o.status='cancelled') * 1)
        , 0)                                          AS composite_score
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id
        AND o.created_at >= $1 AND o.created_at < ($2::date + 1)
      LEFT JOIN driver_ratings r ON r.driver_id = d.id
      WHERE d.status != 'inactive' ${zoneFilter}
      GROUP BY d.id, d.name, d.license_plate, d.vehicle_type, d.status, d.zone_id, d.team_id
      ORDER BY composite_score DESC
      LIMIT $3
    `, [range.from, range.to, Number(limit)]);

    res.json({ range, drivers: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/ops/vehicle-utilization ──────────────────────────────────────
dailyOpsRouter.get("/ops/vehicle-utilization", async (req, res) => {
  try {
    const { date } = req.query as Record<string, string>;
    const day = date ?? taipeiDate();

    const { rows } = await pool.query(`
      SELECT
        d.id, d.name, d.license_plate, d.vehicle_type, d.status,
        d.zone_id, d.team_id,
        -- Active hours today (rough: count of unique order-active hours)
        COUNT(o.id) FILTER (WHERE o.created_at::date = $1::date)::int AS trips_today,
        -- Revenue today
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.created_at::date = $1::date AND o.status='delivered'
        ), 0)::numeric AS revenue_today,
        -- Current load
        COUNT(o.id) FILTER (
          WHERE o.status IN ('assigned','arrived','loading','in_transit')
        )::int AS active_orders_now
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id
      WHERE d.status != 'inactive'
      GROUP BY d.id, d.name, d.license_plate, d.vehicle_type, d.status, d.zone_id, d.team_id
      ORDER BY trips_today DESC, d.name
    `, [day]);

    // Compute fleet-level stats
    const total = rows.length;
    const withTrips = rows.filter(r => Number(r.trips_today) > 0).length;
    const emptyNow  = rows.filter(r => r.status === "available").length;
    const busyNow   = rows.filter(r => r.status === "busy").length;

    res.json({
      date: day,
      fleet: {
        total_vehicles: total,
        with_trips_today: withTrips,
        empty_now: emptyNow,
        busy_now: busyNow,
        utilization_pct: total > 0 ? Math.round(withTrips / total * 100) : 0,
        empty_car_pct: (emptyNow + busyNow) > 0 ? Math.round(emptyNow / (emptyNow + busyNow) * 100) : 0,
      },
      vehicles: rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/ops/ar-aging ──────────────────────────────────────────────────
dailyOpsRouter.get("/ops/ar-aging", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id, c.name AS customer, c.short_name, c.credit_days, c.billing_cycle, c.payment_type,
        -- AR buckets
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered' AND o.completed_at >= NOW() - INTERVAL '30 days'
            AND o.payment_confirmed_at IS NULL
        ), 0)::numeric AS current_30d,
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered'
            AND o.completed_at < NOW() - INTERVAL '30 days'
            AND o.completed_at >= NOW() - INTERVAL '60 days'
            AND o.payment_confirmed_at IS NULL
        ), 0)::numeric AS overdue_30_60d,
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered'
            AND o.completed_at < NOW() - INTERVAL '60 days'
            AND o.completed_at >= NOW() - INTERVAL '90 days'
            AND o.payment_confirmed_at IS NULL
        ), 0)::numeric AS overdue_60_90d,
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered'
            AND o.completed_at < NOW() - INTERVAL '90 days'
            AND o.payment_confirmed_at IS NULL
        ), 0)::numeric AS overdue_90d_plus,
        -- Total outstanding
        COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered'
            AND o.payment_confirmed_at IS NULL
        ), 0)::numeric AS total_outstanding
      FROM customers c
      LEFT JOIN orders o ON o.customer_name = c.name
      GROUP BY c.id, c.name, c.short_name, c.credit_days, c.billing_cycle, c.payment_type
      HAVING COALESCE(SUM(o.total_fee) FILTER (
          WHERE o.status='delivered'
            AND o.payment_confirmed_at IS NULL
      ), 0) > 0
      ORDER BY (
        COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'
          AND o.completed_at < NOW() - INTERVAL '30 days'
          AND o.payment_confirmed_at IS NULL
        ), 0)
      ) DESC
      LIMIT 30
    `);

    const totals = rows.reduce((acc, r) => ({
      current_30d:      acc.current_30d      + Number(r.current_30d),
      overdue_30_60d:   acc.overdue_30_60d   + Number(r.overdue_30_60d),
      overdue_60_90d:   acc.overdue_60_90d   + Number(r.overdue_60_90d),
      overdue_90d_plus: acc.overdue_90d_plus + Number(r.overdue_90d_plus),
      total_outstanding:acc.total_outstanding+ Number(r.total_outstanding),
    }), { current_30d: 0, overdue_30_60d: 0, overdue_60_90d: 0, overdue_90d_plus: 0, total_outstanding: 0 });

    res.json({ customers: rows, totals });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/ops/zone-summary ──────────────────────────────────────────────
dailyOpsRouter.get("/ops/zone-summary", async (req, res) => {
  try {
    const { date } = req.query as Record<string, string>;
    const day = date ?? taipeiDate();

    const { rows } = await pool.query(`
      SELECT
        z.id AS zone_id,
        z.name AS zone_name,
        z.region,
        COUNT(o.id)::int                              AS total_orders,
        COUNT(o.id) FILTER (WHERE o.status='delivered')::int AS completed,
        COUNT(o.id) FILTER (WHERE o.status='pending')::int   AS pending,
        COUNT(o.id) FILTER (WHERE o.status='exception')::int AS exceptions,
        COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric AS revenue,
        COUNT(DISTINCT d.id)::int                     AS total_drivers,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status='available')::int AS available_drivers,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status='busy')::int      AS busy_drivers
      FROM zones z
      LEFT JOIN orders  o ON o.zone_id = z.id AND o.created_at::date = $1::date
      LEFT JOIN drivers d ON d.zone_id = z.id AND d.status != 'inactive'
      WHERE z.is_active
      GROUP BY z.id, z.name, z.region
      ORDER BY revenue DESC
    `, [day]);

    // Global stats (unassigned to any zone)
    const unzoned = await pool.query(`
      SELECT
        COUNT(*)::int AS unzoned_orders,
        COUNT(*) FILTER (WHERE status='pending')::int AS unzoned_pending
      FROM orders WHERE zone_id IS NULL AND created_at::date = $1::date
    `, [day]);

    res.json({ date: day, zones: rows, unzoned: unzoned.rows[0] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
