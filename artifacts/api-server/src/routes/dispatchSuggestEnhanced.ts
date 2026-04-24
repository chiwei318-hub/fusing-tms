/**
 * dispatchSuggestEnhanced.ts
 * AI 智慧派車建議引擎
 *
 * POST /api/dispatch-suggest/auto    取得每條路線的最佳司機建議
 * POST /api/dispatch-suggest/apply   一次套用所有建議
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const dispatchSuggestEnhancedRouter = Router();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── POST /dispatch-suggest/auto ───────────────────────────────────────────────
dispatchSuggestEnhancedRouter.post("/dispatch-suggest/auto", async (req, res) => {
  try {
    const { route_item_ids } = req.body as { route_item_ids: number[] };
    if (!Array.isArray(route_item_ids) || route_item_ids.length === 0) {
      return res.status(400).json({ error: "需要 route_item_ids 陣列" });
    }

    const { rows: routeItems } = await pool.query(
      `SELECT dr.id, dr.route_label, dr.route_date, dr.assigned_driver_id,
              dr.pickup_lat, dr.pickup_lng,
              o.cargo_weight
       FROM dispatch_order_routes dr
       LEFT JOIN orders o ON o.id = dr.order_id
       WHERE dr.id = ANY($1)`,
      [route_item_ids],
    );

    const { rows: driverRows } = await pool.query(`
      SELECT d.id, d.name, d.vehicle_type, d.vehicle_plate, d.rating,
             CAST(dp.lat AS FLOAT) AS lat, CAST(dp.lng AS FLOAT) AS lng,
             COALESCE(today.cnt, 0)::int AS today_routes
      FROM drivers d
      LEFT JOIN driver_positions dp ON dp.driver_id = d.id
        AND dp.updated_at > NOW() - INTERVAL '30 minutes'
      LEFT JOIN (
        SELECT assigned_driver_id, COUNT(*) AS cnt
        FROM dispatch_order_routes
        WHERE route_date = CURRENT_DATE::text AND assigned_driver_id IS NOT NULL
        GROUP BY assigned_driver_id
      ) today ON today.assigned_driver_id = d.id
      WHERE d.status = 'available'
      ORDER BY today_routes ASC, d.name
    `);

    if (driverRows.length === 0) {
      return res.json({ suggestions: [], message: "目前無可用司機" });
    }

    const suggestions: any[] = [];
    const assignedCount = new Map<number, number>();

    for (const route of routeItems) {
      if (route.assigned_driver_id) continue;

      let best: { driver: any; score: number; reason: string } | null = null;

      for (const d of driverRows) {
        let score = 100;
        const reasons: string[] = [];

        const todayPenalty = (d.today_routes + (assignedCount.get(d.id) ?? 0)) * 10;
        score -= todayPenalty;
        if (todayPenalty > 0) reasons.push(`今日已派 ${d.today_routes} 條`);

        if (d.lat && d.lng && route.pickup_lat && route.pickup_lng) {
          const km = haversineKm(d.lat, d.lng, route.pickup_lat, route.pickup_lng);
          score += Math.max(0, 50 - km * 2);
          reasons.push(`距取貨點 ${km.toFixed(1)} km`);
        }

        if (d.rating) score += (d.rating - 3) * 5;

        if (!best || score > best.score) {
          best = { driver: d, score, reason: reasons.join("、") || "綜合評估" };
        }
      }

      if (best) {
        suggestions.push({
          route_item_id:          route.id,
          route_label:            route.route_label,
          suggested_driver_id:    best.driver.id,
          suggested_driver_name:  best.driver.name,
          score:                  Math.round(best.score),
          reason:                 best.reason,
        });
        assignedCount.set(best.driver.id, (assignedCount.get(best.driver.id) ?? 0) + 1);
      }
    }

    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /dispatch-suggest/apply ──────────────────────────────────────────────
dispatchSuggestEnhancedRouter.post("/dispatch-suggest/apply", async (req, res) => {
  try {
    const { suggestions } = req.body as { suggestions: any[] };
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ error: "需要 suggestions 陣列" });
    }

    let applied = 0;
    for (const s of suggestions) {
      await pool.query(
        `UPDATE dispatch_order_routes
         SET assigned_driver_id = $1, assigned_driver_name = $2, assigned_at = NOW()
         WHERE id = $3 AND assigned_driver_id IS NULL`,
        [s.suggested_driver_id, s.suggested_driver_name, s.route_item_id],
      );
      applied++;
    }

    await pool.query(`
      UPDATE dispatch_orders do_
      SET status = 'assigned'
      WHERE id IN (
        SELECT DISTINCT dispatch_order_id FROM dispatch_order_routes
        WHERE id = ANY($1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM dispatch_order_routes
        WHERE dispatch_order_id = do_.id AND assigned_driver_id IS NULL
      )
    `, [suggestions.map(s => s.route_item_id)]);

    res.json({ success: true, applied });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
