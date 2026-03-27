/**
 * Dispatch Suggestion Engine
 * Scores available drivers for a given order and returns ranked suggestions.
 *
 * Scoring factors (max ~100 pts):
 *  +30  vehicle type matches order cargo type
 *  +20  driver region matches order region
 *  +15  driver is currently 'available' (not 'busy')
 *  +10  low current workload (0 active orders)
 *   +5  avg rating ≥ 4.5
 *  +15  returns high avg daily trips (productivity)
 *  -10  per active order in queue (penalty for busy drivers)
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const dispatchSuggestRouter = Router();

// Vehicle type compatibility map
const TYPE_COMPAT: Record<string, string[]> = {
  "一般貨物":   ["box_truck", "van", "pickup"],
  "冷藏貨物":   ["refrigerated"],
  "大型貨物":   ["flatbed", "semi", "box_truck"],
  "危險品":     ["specialized"],
  "小量包裹":   ["van", "motorcycle", "pickup"],
  "高價值物品": ["van", "box_truck"],
};

// ── GET /api/dispatch/suggest ─────────────────────────────────────────────
dispatchSuggestRouter.get("/dispatch/suggest", async (req, res) => {
  try {
    const { orderId, region, cargoType, vehicleType, limit = "10" } = req.query as Record<string, string>;

    // Fetch order details if orderId provided
    let orderRegion    = region    ?? null;
    let orderCargo     = cargoType ?? null;
    let orderVehicle   = vehicleType ?? null;

    if (orderId) {
      const { rows } = await pool.query(
        `SELECT region, cargo_description, vehicle_type FROM orders WHERE id = $1`,
        [Number(orderId)]
      );
      if (rows[0]) {
        orderRegion  = orderRegion  ?? rows[0].region;
        orderCargo   = orderCargo   ?? rows[0].cargo_description;
        orderVehicle = orderVehicle ?? rows[0].vehicle_type;
      }
    }

    // Fetch all available + some busy drivers with their stats
    const { rows: drivers } = await pool.query(`
      SELECT
        d.id, d.name, d.license_plate,
        d.vehicle_type,
        d.status, d.phone,
        COALESCE(d.service_areas, '')            AS service_areas,
        ROUND(COALESCE(AVG(r.stars), 0)::numeric, 1)           AS avg_rating,
        COUNT(r.id)::int                                        AS rating_count,
        COUNT(o.id) FILTER (
          WHERE o.status IN ('assigned','arrived','loading','in_transit')
        )::int                                                  AS active_orders,
        COUNT(o.id) FILTER (
          WHERE o.status = 'delivered'
          AND o.created_at >= NOW() - INTERVAL '7 days'
        )::int                                                  AS week_trips,
        MAX(o.completed_at) FILTER (
          WHERE o.status = 'delivered'
        )                                                       AS last_delivery,
        COALESCE(
          SUM(o.total_fee) FILTER (WHERE o.status='delivered'
            AND o.created_at >= DATE_TRUNC('month', NOW())), 0
        )                                                       AS month_revenue
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id
      LEFT JOIN driver_ratings r ON r.driver_id = d.id
      WHERE d.status != 'inactive'
      GROUP BY d.id, d.name, d.license_plate, d.vehicle_type, d.status, d.phone, d.service_areas
      ORDER BY d.status = 'available' DESC, active_orders ASC
    `);

    // Score each driver
    const scored = drivers.map(drv => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Status
      if (drv.status === "available") {
        score += 20;
        reasons.push("空閒中 +20");
      } else if (drv.status === "busy") {
        score += 5;
      }

      // 2. Vehicle type match
      if (orderVehicle && drv.vehicle_type) {
        const normalised = (drv.vehicle_type as string).toLowerCase();
        const target     = (orderVehicle as string).toLowerCase();
        if (normalised === target || normalised.includes(target) || target.includes(normalised)) {
          score += 30;
          reasons.push("車型符合 +30");
        }
      }
      if (orderCargo) {
        const compatible = TYPE_COMPAT[orderCargo];
        if (compatible?.includes(drv.vehicle_type)) {
          score += 15;
          reasons.push("貨物類型適合 +15");
        }
      }

      // 3. Service area / region match (text field, may be comma-separated)
      const serviceAreasText = String(drv.service_areas ?? "");
      if (orderRegion && serviceAreasText) {
        const areasArr = serviceAreasText.split(/[,，、\s]+/).filter(Boolean);
        const match = areasArr.some(a => a.includes(orderRegion!) || orderRegion!.includes(a))
          || serviceAreasText.includes(orderRegion!);
        if (match) { score += 20; reasons.push("服務區域符合 +20"); }
      }

      // 4. Workload penalty
      const active = Number(drv.active_orders);
      if (active === 0) { score += 10; reasons.push("無排隊單 +10"); }
      else { score -= active * 8; reasons.push(`${active}件待辦 -${active*8}`); }

      // 5. Rating
      const rating = Number(drv.avg_rating);
      if (rating >= 4.8) { score += 10; reasons.push("評分優秀 +10"); }
      else if (rating >= 4.5) { score += 6; reasons.push("評分良好 +6"); }
      else if (rating >= 4.0) { score += 3; }

      // 6. Productivity
      const weekTrips = Number(drv.week_trips);
      if (weekTrips >= 20) { score += 8; reasons.push("本週趟次多 +8"); }
      else if (weekTrips >= 10) { score += 4; }

      return {
        id:           drv.id,
        name:         drv.name,
        license_plate: drv.license_plate,
        vehicle_type: drv.vehicle_type,
        status:       drv.status,
        phone:        drv.phone,
        avg_rating:   rating,
        rating_count: Number(drv.rating_count),
        active_orders: active,
        week_trips:   weekTrips,
        month_revenue: Number(drv.month_revenue),
        last_delivery: drv.last_delivery,
        score:         Math.max(0, score),
        reasons,
        match_level:   score >= 55 ? "strong" : score >= 30 ? "moderate" : "weak",
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    res.json({
      orderId:     orderId ? Number(orderId) : null,
      orderRegion,
      orderCargo,
      orderVehicle,
      suggestions: scored.slice(0, Number(limit)),
      total:       scored.length,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/analytics/demand-forecast ────────────────────────────────────
dispatchSuggestRouter.get("/analytics/demand-forecast", async (_req, res) => {
  try {
    const [hourlyRes, dowRes, monthlyRes, routeRes] = await Promise.all([
      // Hourly pattern (last 90 days)
      pool.query(`
        SELECT
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int                       AS order_count,
          ROUND(AVG(total_fee)::numeric, 0)   AS avg_fee
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '90 days'
          AND status != 'cancelled'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `),

      // Day of week (0=Sunday)
      pool.query(`
        SELECT
          EXTRACT(DOW FROM created_at)::int   AS dow,
          TO_CHAR(created_at, 'Day')          AS dow_name,
          COUNT(*)::int                        AS order_count,
          ROUND(AVG(total_fee)::numeric, 0)   AS avg_fee,
          COUNT(*) FILTER (WHERE status='delivered')::int AS completed
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '90 days'
          AND status != 'cancelled'
        GROUP BY EXTRACT(DOW FROM created_at), TO_CHAR(created_at, 'Day')
        ORDER BY dow
      `),

      // Monthly trend (last 12 months)
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*)::int                                         AS order_count,
          COUNT(*) FILTER (WHERE status='delivered')::int       AS completed,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS revenue
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `),

      // Top routes (last 30 days)
      pool.query(`
        SELECT
          COALESCE(region, '未設定') AS route,
          COUNT(*)::int               AS order_count,
          COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0)::numeric AS revenue
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status != 'cancelled'
        GROUP BY COALESCE(region, '未設定')
        ORDER BY order_count DESC
        LIMIT 10
      `),
    ]);

    // Peak hour detection
    const hourly = hourlyRes.rows as { hour: number; order_count: number; avg_fee: number }[];
    const maxOrders = Math.max(...hourly.map(h => h.order_count), 1);
    const peakHours = hourly
      .filter(h => h.order_count >= maxOrders * 0.7)
      .map(h => h.hour);

    // Day of week processing
    const DOW_ZH = ["週日","週一","週二","週三","週四","週五","週六"];
    const dowData = (dowRes.rows as { dow: number; order_count: number; avg_fee: number; completed: number }[]).map(d => ({
      ...d,
      dow_zh: DOW_ZH[d.dow] ?? `DOW${d.dow}`,
    }));
    const maxDow = Math.max(...dowData.map(d => d.order_count), 1);
    const peakDays = dowData.filter(d => d.order_count >= maxDow * 0.7).map(d => d.dow_zh);

    res.json({
      hourly,
      peakHours,
      dayOfWeek: dowData,
      peakDays,
      monthly: monthlyRes.rows,
      topRoutes: routeRes.rows,
      insight: {
        peak_hours_label:  peakHours.length > 0 ? `${peakHours.join("、")}時` : "暫無資料",
        peak_days_label:   peakDays.join("、") || "暫無資料",
        busiest_route:     (routeRes.rows[0] as Record<string, unknown>)?.route ?? "—",
      },
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/analytics/fleet-recommendation ───────────────────────────────
dispatchSuggestRouter.get("/analytics/fleet-recommendation", async (_req, res) => {
  try {
    const [capacityRes, outsourceRes, coverageRes] = await Promise.all([
      // Current fleet capacity vs demand
      pool.query(`
        SELECT
          d.vehicle_type,
          COUNT(DISTINCT d.id)::int                    AS driver_count,
          COUNT(o.id) FILTER (
            WHERE o.created_at >= DATE_TRUNC('month', NOW())
              AND o.status != 'cancelled'
          )::int                                        AS month_orders,
          COUNT(o.id) FILTER (
            WHERE o.status IN ('assigned','arrived','loading','in_transit')
          )::int                                        AS active_now,
          ROUND(
            COUNT(o.id) FILTER (
              WHERE o.status = 'delivered'
                AND o.created_at >= DATE_TRUNC('week', NOW())
            )::numeric / GREATEST(COUNT(DISTINCT d.id)::numeric, 1), 1
          )                                             AS avg_weekly_trips_per_driver
        FROM drivers d
        LEFT JOIN orders o ON o.driver_id = d.id
        WHERE d.status != 'inactive'
        GROUP BY d.vehicle_type
        ORDER BY month_orders DESC
      `),

      // Outsource ratio
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE action_type='outsource_order' AND status='approved')::int AS outsourced,
          COUNT(*) FILTER (WHERE action_type='outsource_order')::int AS total_outsource_req,
          (SELECT COUNT(*) FROM orders
           WHERE created_at >= DATE_TRUNC('month', NOW())) AS month_total
        FROM approval_requests
        WHERE requested_at >= DATE_TRUNC('month', NOW())
      `),

      // Coverage gaps (orders where no driver assigned within 30 min)
      pool.query(`
        SELECT
          COALESCE(region, '未設定') AS region,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_now,
          COUNT(*) FILTER (
            WHERE status='cancelled'
            AND driver_id IS NULL
          )::int AS cancelled_no_driver
        FROM orders
        WHERE created_at >= DATE_TRUNC('month', NOW())
        GROUP BY COALESCE(region, '未設定')
        ORDER BY pending_now DESC
        LIMIT 10
      `),
    ]);

    const cap = capacityRes.rows as Record<string, unknown>[];
    const out = outsourceRes.rows[0] as Record<string, unknown>;
    const outsourcePct = out
      ? Math.round(Number(out.outsourced) / Math.max(Number(out.month_total), 1) * 100)
      : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    cap.forEach(c => {
      const util = Number(c.avg_weekly_trips_per_driver) ?? 0;
      if (util > 15) recommendations.push(`${c.vehicle_type} 司機需求旺盛（週均 ${util} 趟），建議增招`);
      if (util < 3 && Number(c.driver_count) > 2) recommendations.push(`${c.vehicle_type} 利用率偏低，可考慮縮減或轉型`);
    });
    if (outsourcePct > 20) recommendations.push(`本月外包率 ${outsourcePct}%，偏高，建議補充自有車隊`);
    else if (outsourcePct < 5) recommendations.push(`外包率 ${outsourcePct}%，彈性空間充足`);

    res.json({
      fleetCapacity: cap,
      outsourceRatio: outsourcePct,
      coverageGaps: coverageRes.rows,
      recommendations,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
