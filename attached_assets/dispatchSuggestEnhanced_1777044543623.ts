/**
 * dispatchSuggestEnhanced.ts
 * 路徑：artifacts/api-server/src/routes/dispatchSuggestEnhanced.ts
 *
 * AI 智慧派車建議引擎
 *
 * POST /api/dispatch-suggest/auto
 *   Input:  { route_item_ids: number[] }  ← 要自動派車的路線明細 ID 陣列
 *   Output: [{ route_item_id, suggested_driver_id, suggested_driver_name, score, reason }]
 *
 * 評分邏輯（可擴充）：
 *   1. 司機當天已派車數量（越少分數越高）
 *   2. 司機與取貨地點的距離（越近分數越高，需要 GPS）
 *   3. 車型匹配（貨物重量 vs 車輛載重）
 *   4. 司機評分（若有）
 */

import { Router, Request, Response } from "express";
import { Pool } from "pg";

interface DriverCandidate {
  id: number;
  name: string;
  vehicle_type: string;
  vehicle_plate: string;
  lat?: number;
  lng?: number;
  today_routes: number; // 今天已派幾條路線
  rating?: number;
}

interface SuggestionResult {
  route_item_id: number;
  route_label: string;
  suggested_driver_id: number;
  suggested_driver_name: string;
  score: number;
  reason: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createDispatchSuggestRouter(pool: Pool) {
  const router = Router();

  // ── POST /api/dispatch-suggest/auto ─────────────────────
  router.post("/auto", async (req: Request, res: Response) => {
    const { route_item_ids } = req.body as { route_item_ids: number[] };

    if (!Array.isArray(route_item_ids) || route_item_ids.length === 0) {
      return res.status(400).json({ error: "需要 route_item_ids 陣列" });
    }

    // 1. 取得路線明細（含取貨座標）
    const { rows: routeItems } = await pool.query(
      `SELECT
        dr.id,
        dr.route_label,
        dr.route_date,
        dr.assigned_driver_id,
        o.pickup_lat,
        o.pickup_lng,
        o.cargo_weight
       FROM dispatch_order_routes dr
       LEFT JOIN orders o ON o.id = dr.order_id
       WHERE dr.id = ANY($1)`,
      [route_item_ids]
    );

    // 2. 取得可用司機清單（含今日派車數 + GPS 位置）
    const { rows: driverRows } = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.vehicle_type,
        d.vehicle_plate,
        d.rating,
        CAST(dp.lat AS FLOAT) AS lat,
        CAST(dp.lng AS FLOAT) AS lng,
        COALESCE(today.cnt, 0)::int AS today_routes
      FROM drivers d
      LEFT JOIN driver_positions dp ON dp.driver_id = d.id
        AND dp.updated_at > NOW() - INTERVAL '30 minutes'
      LEFT JOIN (
        SELECT assigned_driver_id, COUNT(*) AS cnt
        FROM dispatch_order_routes
        WHERE route_date = CURRENT_DATE::text
          AND assigned_driver_id IS NOT NULL
        GROUP BY assigned_driver_id
      ) today ON today.assigned_driver_id = d.id
      WHERE d.status = 'available'
      ORDER BY today_routes ASC, d.name
    `);

    if (driverRows.length === 0) {
      return res.json({ suggestions: [], message: "目前無可用司機" });
    }

    // 3. 對每條路線評分，選出最佳司機
    const suggestions: SuggestionResult[] = [];
    const assignedCount = new Map<number, number>(); // 本次批次中已被分配的次數

    for (const route of routeItems) {
      if (route.assigned_driver_id) continue; // 已指派，跳過

      let best: { driver: DriverCandidate; score: number; reason: string } | null = null;

      for (const d of driverRows as DriverCandidate[]) {
        let score = 100;
        const reasons: string[] = [];

        // 扣分：今日已派車數
        const todayPenalty = (d.today_routes + (assignedCount.get(d.id) ?? 0)) * 10;
        score -= todayPenalty;
        if (todayPenalty > 0) reasons.push(`今日已派 ${d.today_routes} 條`);

        // 加分：距離近（若有 GPS）
        if (d.lat && d.lng && route.pickup_lat && route.pickup_lng) {
          const km = haversineKm(d.lat, d.lng, route.pickup_lat, route.pickup_lng);
          const distScore = Math.max(0, 50 - km * 2); // 25km 內加分
          score += distScore;
          reasons.push(`距取貨點 ${km.toFixed(1)} km`);
        }

        // 加分：司機評分
        if (d.rating) {
          score += (d.rating - 3) * 5; // 3 分為基準，5 分 +10
        }

        if (!best || score > best.score) {
          best = { driver: d, score, reason: reasons.join("、") || "綜合評估" };
        }
      }

      if (best) {
        suggestions.push({
          route_item_id: route.id,
          route_label: route.route_label,
          suggested_driver_id: best.driver.id,
          suggested_driver_name: best.driver.name,
          score: Math.round(best.score),
          reason: best.reason,
        });
        // 記錄本次批次分配
        assignedCount.set(
          best.driver.id,
          (assignedCount.get(best.driver.id) ?? 0) + 1
        );
      }
    }

    res.json({ suggestions });
  });

  // ── POST /api/dispatch-suggest/apply ────────────────────
  // 將 AI 建議一次全部套用
  router.post("/apply", async (req: Request, res: Response) => {
    const { suggestions } = req.body as { suggestions: SuggestionResult[] };

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ error: "需要 suggestions 陣列" });
    }

    let applied = 0;
    for (const s of suggestions) {
      await pool.query(
        `UPDATE dispatch_order_routes
         SET assigned_driver_id   = $1,
             assigned_driver_name = $2,
             assigned_at          = NOW()
         WHERE id = $3 AND assigned_driver_id IS NULL`,
        [s.suggested_driver_id, s.suggested_driver_name, s.route_item_id]
      );
      applied++;
    }

    // 更新派車單狀態
    await pool.query(`
      UPDATE dispatch_orders do_
      SET status = 'assigned'
      WHERE id IN (
        SELECT DISTINCT dispatch_order_id FROM dispatch_order_routes
        WHERE id = ANY($1)
      )
      AND NOT EXISTS (
        SELECT 1 FROM dispatch_order_routes
        WHERE dispatch_order_id = do_.id
          AND assigned_driver_id IS NULL
      )
    `, [suggestions.map(s => s.route_item_id)]);

    res.json({ success: true, applied });
  });

  return router;
}
