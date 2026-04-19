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
 * GET /api/get-task
 * ATOMS 司機 App 輪詢端點：回傳被指派給該司機的最新一筆蝦皮派車任務
 *
 * Query params:
 *   atoms_account - 旗下司機的 ATOMS 帳號（優先，用 fleet_drivers.atoms_account 篩選）
 *   driver_id     - 一般司機 ID（選填，兼容舊格式）
 *   order_id      - 直接查詢指定訂單（選填）
 *
 * 回傳 ATOMS App 直接可用的扁平結構
 */
jobsRouter.get("/get-task", async (req, res) => {
  try {
    const { driver_id, order_id, atoms_account } = req.query as Record<string, string>;

    // ── 優先用 atoms_account 查旗下司機指派的蝦皮路線 ──────────────────
    if (atoms_account) {
      // 找到這個 atoms_account 對應的 fleet_driver
      const driverRes = await pool.query(
        `SELECT id, name, phone FROM fleet_drivers WHERE atoms_account = $1 AND is_active = true LIMIT 1`,
        [atoms_account]
      );
      if (driverRes.rows.length === 0) {
        return res.json({
          order_id: null, customer_name: null, address: null,
          temp_type: null, contact_phone: null, lat: null, lng: null,
          status: "找不到司機帳號", note: null,
        });
      }
      const fleetDriver = driverRes.rows[0] as any;

      // 找到該司機被指派、尚未完成的蝦皮路線
      const taskRes = await pool.query(`
        SELECT
          o.id              AS order_id,
          o.route_id,
          o.station_count,
          o.dispatch_dock,
          o.route_prefix,
          o.notes,
          o.status,
          o.fleet_grabbed_at,
          o.is_cold_chain,
          o.fusingao_fleet_id,
          pr.service_type
        FROM orders o
        LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
        WHERE o.fleet_driver_id = $1
          AND o.status NOT IN ('cancelled', 'delivered')
          AND o.fleet_completed_at IS NULL
        ORDER BY o.fleet_grabbed_at DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      `, [fleetDriver.id]);

      if (taskRes.rows.length === 0) {
        return res.json({
          order_id: null, customer_name: null, address: null,
          temp_type: "常溫", contact_phone: null, lat: null, lng: null,
          status: "無待派任務", note: null,
        });
      }

      const r = taskRes.rows[0] as any;
      const stationDesc = r.station_count ? `共 ${r.station_count} 站` : "";
      const dockDesc    = r.dispatch_dock ? `碼頭：${r.dispatch_dock}` : "";
      const note = [
        r.route_id   ? `路線：${r.route_id}` : "",
        dockDesc,
        stationDesc,
        r.notes ?? "",
      ].filter(Boolean).join("｜");

      return res.json({
        order_id:      r.order_id,
        customer_name: r.service_type ?? "蝦皮電商配送",
        address:       r.route_id ?? "",
        temp_type:     r.is_cold_chain ? "冷藏 2-8°C" : "常溫",
        contact_phone: fleetDriver.phone ?? "",
        lat:           null,
        lng:           null,
        status:        r.status ?? "pending",
        note,
        // 額外欄位（ATOMS 可選用）
        route_id:      r.route_id,
        station_count: r.station_count,
        dock:          r.dispatch_dock,
        driver_name:   fleetDriver.name,
        driver_phone:  fleetDriver.phone,
      });
    }

    // ── 舊格式：一般訂單 driver_id / order_id 查詢 ────────────────────
    const conditions: string[] = ["o.status NOT IN ('cancelled', 'delivered')"];
    const params: unknown[] = [];

    if (order_id) {
      params.push(order_id);
      conditions.push(`o.id = $${params.length}`);
    } else if (driver_id) {
      params.push(parseInt(driver_id, 10));
      conditions.push(`o.driver_id = $${params.length}`);
    } else {
      conditions.push(`o.status IN ('pending', 'assigned', 'in_transit')`);
    }

    const result = await pool.query(`
      SELECT
        o.id                  AS order_id,
        o.customer_name,
        o.delivery_address    AS address,
        o.is_cold_chain,
        o.cargo_description,
        o.route_id,
        o.station_count,
        o.dispatch_dock,
        o.status,
        o.notes,
        o.pickup_time,
        d.phone               AS contact_phone
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY o.created_at DESC
      LIMIT 1
    `, params);

    if (result.rows.length === 0) {
      return res.json({
        order_id: null, customer_name: null, address: null,
        temp_type: null, contact_phone: null, lat: null, lng: null,
        status: "無待派任務", note: null,
      });
    }

    const r = result.rows[0] as any;
    const tempTypeMap: Record<string, string> = { true: "冷藏 2-8°C", false: "常溫" };

    // 如果是蝦皮路線（有 route_id），組合 note 格式
    let note = r.notes ?? r.cargo_description ?? "";
    if (r.route_id) {
      const parts = [
        `路線：${r.route_id}`,
        r.dispatch_dock ? `碼頭：${r.dispatch_dock}` : "",
        r.station_count ? `共 ${r.station_count} 站` : "",
      ].filter(Boolean);
      note = parts.join("｜") + (note ? "\n" + note : "");
    }

    res.json({
      order_id:      r.order_id,
      customer_name: r.customer_name ?? "",
      address:       r.route_id ?? r.address ?? "",
      temp_type:     tempTypeMap[String(r.is_cold_chain)] ?? "常溫",
      contact_phone: r.contact_phone ?? "",
      lat:           null,
      lng:           null,
      status:        r.status ?? "",
      note,
    });
  } catch (err) {
    console.error("[get-task] error:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/complete-task
 * ATOMS 司機 App 回報任務完成
 * Body: { atoms_account: string, order_id: number } 或 { atoms_account: string }（自動用最近任務）
 */
jobsRouter.post("/complete-task", async (req, res) => {
  try {
    const { atoms_account, order_id } = req.body as { atoms_account?: string; order_id?: number };
    if (!atoms_account) return res.status(400).json({ ok: false, error: "atoms_account 為必填" });

    // Find fleet driver by atoms_account
    const driverRes = await pool.query(
      `SELECT id, name FROM fleet_drivers WHERE atoms_account = $1 AND is_active = true LIMIT 1`,
      [atoms_account]
    );
    if (driverRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "找不到司機帳號" });
    }
    const driver = driverRes.rows[0] as any;

    // Find order: by order_id or most recent assigned unfinished
    let orderId = order_id;
    if (!orderId) {
      const latest = await pool.query(`
        SELECT id FROM orders
        WHERE fleet_driver_id = $1 AND fleet_completed_at IS NULL AND status NOT IN ('cancelled','delivered')
        ORDER BY fleet_grabbed_at DESC NULLS LAST, created_at DESC LIMIT 1
      `, [driver.id]);
      if (latest.rows.length === 0) {
        return res.json({ ok: false, error: "找不到待完成任務" });
      }
      orderId = (latest.rows[0] as any).id;
    }

    // Mark complete
    await pool.query(`
      UPDATE orders SET fleet_completed_at = NOW(), status = 'delivered', updated_at = NOW()
      WHERE id = $1 AND fleet_driver_id = $2
    `, [orderId, driver.id]);

    res.json({ ok: true, order_id: orderId, driver_name: driver.name, completed_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/get-task/sample
 * 固定回傳示範任務（格式與 FastAPI 版本完全相同）
 */
jobsRouter.get("/get-task/sample", (_req, res) => {
  res.json({
    order_id:      "FT-20260405-001",
    customer_name: "富詠冷鏈物流",
    address:       "桃園市平鎮區新光路三段150-3號",
    temp_type:     "冷凍 -18°C",
    contact_phone: "0912-345-678",
    lat:           24.9283,
    lng:           121.2165,
    status:        "待配送",
    note:          "需在 14:00 前送達，卸貨區在後門。",
  });
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
