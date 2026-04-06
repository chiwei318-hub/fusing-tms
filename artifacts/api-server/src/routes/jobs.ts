import { Router } from "express";
import { pool } from "@workspace/db";

export const jobsRouter = Router();

/**
 * GET /api/jobs
 * 回傳司機任務列表（可供外部系統或 LINE 機器人串接）
 *
 * Query params:
 *   driver_id  - 指定司機 ID（選填）
 *   status     - 過濾狀態：pending / assigned / in_transit / delivered（選填）
 *   limit      - 筆數上限，預設 20
 *
 * 未帶任何參數時回傳最近 20 筆進行中訂單（示範用）
 */
jobsRouter.get("/jobs", async (req, res) => {
  try {
    const { driver_id, status, limit = "20" } = req.query as Record<string, string>;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const conditions: string[] = ["o.status != 'cancelled'"];
    const params: unknown[] = [];

    if (driver_id) {
      params.push(parseInt(driver_id, 10));
      conditions.push(`o.driver_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    } else {
      conditions.push(`o.status IN ('pending', 'assigned', 'in_transit')`);
    }

    params.push(limitNum);

    const result = await pool.query(`
      SELECT
        o.id                  AS order_id,
        o.status,
        o.customer_name       AS customer,
        o.pickup_address      AS pickup,
        o.delivery_address    AS delivery,
        o.cargo_description   AS cargo,
        o.total_fee,
        o.suggested_price,
        o.is_cold_chain,
        o.required_vehicle_type AS vehicle_type,
        o.pickup_time,
        o.created_at,
        d.name                AS driver_name,
        d.phone               AS driver_phone,
        d.line_user_id        AS driver_line_uid
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY o.created_at DESC
      LIMIT $${params.length}
    `, params);

    const jobs = (result.rows as any[]).map(r => ({
      order_id:     r.order_id,
      status:       r.status,
      customer:     r.customer,
      pickup:       r.pickup,
      delivery:     r.delivery,
      cargo:        r.cargo,
      fee:          r.total_fee ?? r.suggested_price ?? null,
      is_cold_chain: r.is_cold_chain,
      vehicle_type: r.vehicle_type,
      pickup_time:  r.pickup_time,
      created_at:   r.created_at,
      driver: r.driver_name ? {
        name:     r.driver_name,
        phone:    r.driver_phone,
        line_uid: r.driver_line_uid,
      } : null,
    }));

    res.json({
      ok:    true,
      total: jobs.length,
      jobs,
    });
  } catch (err) {
    console.error("[jobs] error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/jobs/sample
 * 固定回傳測試用示範資料（不需資料庫，方便快速驗證串接）
 */
jobsRouter.get("/jobs/sample", (_req, res) => {
  res.json({
    ok:    true,
    total: 3,
    jobs: [
      {
        order_id:     "FL1001",
        status:       "pending",
        customer:     "富詠冷鏈",
        pickup:       "桃園市平鎮區中豐路100號",
        delivery:     "台北市信義區市府路45號",
        cargo:        "冷藏食品 × 10箱",
        fee:          2800,
        is_cold_chain: true,
        vehicle_type: "小貨車",
        pickup_time:  new Date(Date.now() + 2 * 3600_000).toISOString(),
        created_at:   new Date().toISOString(),
        driver:       null,
      },
      {
        order_id:     "FL1002",
        status:       "assigned",
        customer:     "統一超商物流",
        pickup:       "新北市中和區中正路700號",
        delivery:     "桃園市龜山區文化一路100號",
        cargo:        "一般貨物 × 5件",
        fee:          1500,
        is_cold_chain: false,
        vehicle_type: "機車",
        pickup_time:  new Date(Date.now() + 1 * 3600_000).toISOString(),
        created_at:   new Date(Date.now() - 3600_000).toISOString(),
        driver: {
          name:     "陳小愛",
          phone:    "0912345678",
          line_uid: "Uabcdef1234567890abcdef1234567890",
        },
      },
      {
        order_id:     "FL1003",
        status:       "in_transit",
        customer:     "全家便利商店",
        pickup:       "台中市西屯區台灣大道三段99號",
        delivery:     "台中市北屯區文心路四段200號",
        cargo:        "生鮮蔬果 × 20箱",
        fee:          3200,
        is_cold_chain: true,
        vehicle_type: "小貨車",
        pickup_time:  new Date(Date.now() - 30 * 60_000).toISOString(),
        created_at:   new Date(Date.now() - 2 * 3600_000).toISOString(),
        driver: {
          name:     "麒巍",
          phone:    "0987654321",
          line_uid: "U1234567890abcdef1234567890abcdef",
        },
      },
    ],
  });
});
