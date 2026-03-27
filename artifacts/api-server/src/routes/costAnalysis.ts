import { Router } from "express";
import { pool } from "@workspace/db";

export const costAnalysisRouter = Router();

// ── Cost constants (can be overridden via query params) ────────────────────
const DEFAULT_RATES = {
  fuel_per_km:      8,    // NT$/km
  fuel_base:        120,  // NT$ fixed per trip (urban)
  toll_per_km:      1.5,  // NT$/km
  toll_base:        80,   // NT$ fixed per trip
  depreciation_per_km: 2, // NT$/km
  depreciation_base: 150, // NT$ fixed per trip
  labor_pct:        0.15, // 15% of revenue → driver commission
  labor_fixed:      0,    // optional fixed labor per trip
  overhead_pct:     0.05, // 5% overhead (insurance, admin)
};

function tripCost(
  revenue: number, km: number, waitMin: number, surcharge: number,
  rates: typeof DEFAULT_RATES
) {
  const dist = km > 0 ? km : 30; // fallback 30km if no GPS data
  const fuel     = rates.fuel_base     + dist * rates.fuel_per_km;
  const toll     = rates.toll_base     + dist * rates.toll_per_km;
  const depr     = rates.depreciation_base + dist * rates.depreciation_per_km;
  const labor    = revenue * rates.labor_pct + rates.labor_fixed;
  const overhead = revenue * rates.overhead_pct;
  const wait     = waitMin * 5; // NT$5/min extra cost attribution
  const totalCost = fuel + toll + depr + labor + overhead + wait + surcharge;
  return { fuel, toll, depr, labor, overhead, wait, surcharge, totalCost };
}

// ── GET /api/cost-analysis/per-order ─────────────────────────────────────
costAnalysisRouter.get("/cost-analysis/per-order", async (req, res) => {
  try {
    const { limit = "50", offset = "0", date_from, date_to, customer_name } = req.query as Record<string, string>;
    const rates = { ...DEFAULT_RATES };

    const conditions = ["o.status = 'delivered'"];
    const params: (string | number)[] = [];
    let p = 1;
    if (date_from)     { conditions.push(`o.created_at >= $${p++}`); params.push(date_from); }
    if (date_to)       { conditions.push(`o.created_at < $${p++}`);  params.push(date_to); }
    if (customer_name) { conditions.push(`o.customer_name ILIKE $${p++}`); params.push(`%${customer_name}%`); }

    const { rows } = await pool.query(`
      SELECT
        o.id, o.created_at, o.customer_name, o.pickup_address, o.delivery_address,
        o.region, COALESCE(o.distance_km, 0) AS distance_km,
        COALESCE(o.total_fee, 0)         AS revenue,
        COALESCE(o.surcharge_amount, 0)  AS surcharge,
        COALESCE(o.wait_minutes, 0)      AS wait_minutes,
        d.name AS driver_name, d.vehicle_type
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY o.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `, [...params, Number(limit), Number(offset)]);

    const result = rows.map(r => {
      const revenue  = Number(r.revenue);
      const km       = Number(r.distance_km);
      const waitMin  = Number(r.wait_minutes);
      const surcharge = Number(r.surcharge);
      const cost = tripCost(revenue, km, waitMin, surcharge, rates);
      const grossProfit = revenue - cost.totalCost;
      const margin = revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0;
      const perKm = km > 0 ? Math.round(grossProfit / km) : null;
      return {
        id: r.id, created_at: r.created_at,
        customer_name: r.customer_name, driver_name: r.driver_name,
        vehicle_type: r.vehicle_type, region: r.region,
        distance_km: km, revenue, ...cost,
        gross_profit: grossProfit, margin, per_km_profit: perKm,
      };
    });

    res.json({ rows: result, count: result.length });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/cost-analysis/per-route ─────────────────────────────────────
costAnalysisRouter.get("/cost-analysis/per-route", async (req, res) => {
  try {
    const rates = { ...DEFAULT_RATES };
    const { date_from, date_to } = req.query as Record<string, string>;

    const conditions = ["o.status = 'delivered'"];
    const params: (string | number)[] = [];
    let p = 1;
    if (date_from) { conditions.push(`o.created_at >= $${p++}`); params.push(date_from); }
    if (date_to)   { conditions.push(`o.created_at < $${p++}`);  params.push(date_to); }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(o.region, '未指定') AS route,
        COUNT(*)::int                AS trips,
        COALESCE(SUM(o.total_fee), 0)           AS revenue,
        COALESCE(AVG(o.total_fee), 0)           AS avg_fee,
        COALESCE(SUM(o.distance_km)
          FILTER (WHERE o.distance_km > 0), 0)  AS total_km,
        COALESCE(AVG(o.distance_km)
          FILTER (WHERE o.distance_km > 0), 0)  AS avg_km,
        COALESCE(SUM(o.surcharge_amount), 0)    AS total_surcharge,
        COALESCE(SUM(o.wait_minutes), 0)        AS total_wait_min
      FROM orders o
      WHERE ${conditions.join(" AND ")}
      GROUP BY COALESCE(o.region, '未指定')
      ORDER BY revenue DESC
      LIMIT 20
    `, params);

    const result = rows.map(r => {
      const revenue   = Number(r.revenue);
      const trips     = Number(r.trips);
      const totalKm   = Number(r.total_km);
      const avgKm     = Number(r.avg_km);
      const surcharge = Number(r.total_surcharge);
      const waitMin   = Number(r.total_wait_min);

      const avgRevenue = trips > 0 ? revenue / trips : 0;
      const cost = tripCost(avgRevenue, avgKm, waitMin / Math.max(trips, 1), surcharge / Math.max(trips, 1), rates);
      const perTripCost = cost.totalCost;
      const totalCost = perTripCost * trips;
      const grossProfit = revenue - totalCost;
      const margin = revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0;
      const perKmProfit = totalKm > 0 ? Math.round(grossProfit / totalKm) : null;

      return {
        route: r.route, trips, revenue,
        avg_fee: Math.round(Number(r.avg_fee)),
        total_km: Math.round(totalKm),
        avg_km: Math.round(avgKm * 10) / 10,
        fuel:         Math.round(cost.fuel * trips),
        toll:         Math.round(cost.toll * trips),
        depreciation: Math.round(cost.depr * trips),
        labor:        Math.round(cost.labor * trips),
        overhead:     Math.round(cost.overhead * trips),
        wait_cost:    Math.round(waitMin * 5),
        surcharge_cost: Math.round(surcharge),
        total_cost:   Math.round(totalCost),
        gross_profit: Math.round(grossProfit),
        margin, per_km_profit: perKmProfit,
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/cost-analysis/per-customer ──────────────────────────────────
costAnalysisRouter.get("/cost-analysis/per-customer", async (req, res) => {
  try {
    const rates = { ...DEFAULT_RATES };
    const { date_from, date_to, limit = "20" } = req.query as Record<string, string>;

    const conditions = ["o.status = 'delivered'"];
    const params: (string | number)[] = [];
    let p = 1;
    if (date_from) { conditions.push(`o.created_at >= $${p++}`); params.push(date_from); }
    if (date_to)   { conditions.push(`o.created_at < $${p++}`);  params.push(date_to); }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(o.customer_name, '匿名')    AS customer_name,
        o.customer_phone,
        COUNT(*)::int                         AS trips,
        COALESCE(SUM(o.total_fee), 0)         AS revenue,
        COALESCE(AVG(o.total_fee), 0)         AS avg_fee,
        COALESCE(SUM(o.distance_km)
          FILTER (WHERE o.distance_km > 0), 0) AS total_km,
        COALESCE(AVG(o.distance_km)
          FILTER (WHERE o.distance_km > 0), 0) AS avg_km,
        COALESCE(SUM(o.surcharge_amount), 0)  AS total_surcharge,
        COALESCE(SUM(o.wait_minutes), 0)      AS total_wait_min,
        COUNT(*) FILTER (WHERE o.fee_status = 'unpaid')::int AS unpaid_orders,
        COALESCE(SUM(o.total_fee) FILTER (WHERE o.fee_status = 'unpaid'), 0) AS unpaid_amount
      FROM orders o
      WHERE ${conditions.join(" AND ")}
      GROUP BY COALESCE(o.customer_name, '匿名'), o.customer_phone
      ORDER BY revenue DESC
      LIMIT $${p++}
    `, [...params, Number(limit)]);

    const result = rows.map(r => {
      const revenue = Number(r.revenue);
      const trips   = Number(r.trips);
      const totalKm = Number(r.total_km);
      const avgKm   = Number(r.avg_km);
      const wait    = Number(r.total_wait_min);
      const surch   = Number(r.total_surcharge);

      const avgRev = trips > 0 ? revenue / trips : 0;
      const cost = tripCost(avgRev, avgKm, wait / Math.max(trips, 1), surch / Math.max(trips, 1), rates);
      const totalCost   = cost.totalCost * trips;
      const grossProfit = revenue - totalCost;
      const margin      = revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0;
      const perKm       = totalKm > 0 ? Math.round(grossProfit / totalKm) : null;

      return {
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        trips, revenue: Math.round(revenue),
        avg_fee: Math.round(Number(r.avg_fee)),
        total_km: Math.round(totalKm),
        total_cost: Math.round(totalCost),
        gross_profit: Math.round(grossProfit),
        margin, per_km_profit: perKm,
        unpaid_orders: Number(r.unpaid_orders),
        unpaid_amount: Math.round(Number(r.unpaid_amount)),
        fuel:   Math.round(cost.fuel * trips),
        toll:   Math.round(cost.toll * trips),
        labor:  Math.round(cost.labor * trips),
        depr:   Math.round(cost.depr * trips),
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/cost-analysis/summary ────────────────────────────────────────
costAnalysisRouter.get("/cost-analysis/summary", async (req, res) => {
  try {
    const rates = { ...DEFAULT_RATES };
    const { period = "month" } = req.query as Record<string, string>;

    const interval = period === "week"
      ? `DATE_TRUNC('week', NOW())`
      : period === "today"
      ? `DATE_TRUNC('day', NOW())`
      : `DATE_TRUNC('month', NOW())`;

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'delivered')::int             AS trips,
        COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0) AS revenue,
        COALESCE(SUM(distance_km)
          FILTER (WHERE status='delivered' AND distance_km > 0), 0)   AS total_km,
        COALESCE(SUM(surcharge_amount)
          FILTER (WHERE status='delivered'), 0)                       AS total_surcharge,
        COALESCE(SUM(wait_minutes)
          FILTER (WHERE status='delivered'), 0)                       AS total_wait_min
      FROM orders
      WHERE created_at >= ${interval}
    `);

    const r       = rows[0];
    const revenue = Number(r.revenue);
    const trips   = Number(r.trips);
    const km      = Number(r.total_km);
    const surch   = Number(r.total_surcharge);
    const wait    = Number(r.total_wait_min);
    const avgKm   = trips > 0 ? km / trips : 30;
    const avgRev  = trips > 0 ? revenue / trips : 0;

    const perTrip = tripCost(avgRev, avgKm, wait / Math.max(trips, 1), surch / Math.max(trips, 1), rates);
    const totalCost   = perTrip.totalCost * trips;
    const grossProfit = revenue - totalCost;

    res.json({
      period, trips, revenue, total_km: Math.round(km),
      cost: {
        fuel:         Math.round(perTrip.fuel * trips),
        toll:         Math.round(perTrip.toll * trips),
        depreciation: Math.round(perTrip.depr * trips),
        labor:        Math.round(perTrip.labor * trips),
        overhead:     Math.round(perTrip.overhead * trips),
        wait:         Math.round(wait * 5),
        surcharge:    Math.round(surch),
        total:        Math.round(totalCost),
      },
      gross_profit: Math.round(grossProfit),
      margin: revenue > 0 ? Math.round(grossProfit / revenue * 100) : 0,
      per_km_profit: km > 0 ? Math.round(grossProfit / km) : 0,
      per_trip_profit: trips > 0 ? Math.round(grossProfit / trips) : 0,
      rates,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
