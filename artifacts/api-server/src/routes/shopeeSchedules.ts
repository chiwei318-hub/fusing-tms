/**
 * shopeeSchedules.ts — 蝦皮北倉班表管理
 *
 * GET  /api/shopee-schedules          列出路線
 * GET  /api/shopee-schedules/weeks    取得所有已匯入週別
 * GET  /api/shopee-schedules/:id/stops 展開站點
 * POST /api/shopee-schedules/import   觸發 Excel 匯入
 * DELETE /api/shopee-schedules/week   刪除指定週別
 *
 * Tables: shopee_week_routes, shopee_week_route_stops
 * (不與舊 shopee_route_plans / shopee_route_stops 衝突)
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import * as path from "path";

export const shopeeSchedulesRouter = Router();

// ── 建表 ────────────────────────────────────────────────────────────────────
export async function ensureShopeeScheduleTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_week_routes (
      id              SERIAL PRIMARY KEY,
      week_label      TEXT NOT NULL,
      route_no        TEXT NOT NULL,
      route_type      TEXT,
      vehicle_type    TEXT,
      shopee_driver_id TEXT,
      departure_time  TEXT,
      dock_no         TEXT,
      stop_count      INTEGER DEFAULT 0,
      excel_date      FLOAT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_week_route_stops (
      id            SERIAL PRIMARY KEY,
      week_route_id INTEGER NOT NULL REFERENCES shopee_week_routes(id) ON DELETE CASCADE,
      stop_order    INTEGER NOT NULL,
      store_name    TEXT,
      store_address TEXT,
      is_ndd        BOOLEAN NOT NULL DEFAULT false,
      ndd_type      TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_swr_week   ON shopee_week_routes(week_label);
    CREATE INDEX IF NOT EXISTS idx_swr_driver ON shopee_week_routes(shopee_driver_id);
    CREATE INDEX IF NOT EXISTS idx_swrs_wrid  ON shopee_week_route_stops(week_route_id);
  `).catch(() => {});
  console.log("[ShopeeSchedule] tables ensured");
}

// ── 解析 Excel 班表 ─────────────────────────────────────────────────────────
export async function importShopeeScheduleFromExcel(excelPath: string) {
  let xlsx: any;
  try { xlsx = require("xlsx"); } catch { throw new Error("xlsx 模組未安裝"); }

  const wb = xlsx.readFile(excelPath);
  const rawSheets = wb.SheetNames.filter((n: string) => n.startsWith("Raw_"));

  function extractWeek(sheetName: string): string {
    const m = sheetName.match(/路線(\d+[-~至]\d+)/);
    if (m) return m[1];
    const m2 = sheetName.match(/表(\d+[^\s]+)/);
    if (m2) return m2[1];
    return sheetName.replace("Raw_北倉", "").replace("路線規畫表", "").trim();
  }

  function extractRouteType(sheetName: string): string {
    if (sheetName.includes("WH NDD")) return "WH NDD";
    if (sheetName.includes("快速到貨")) return "快速到貨";
    if (sheetName.includes("流水線")) return "流水線";
    if (sheetName.includes("NDD")) return "NDD";
    return "一般";
  }

  const weekMap = new Map<string, { routeType: string; sheetName: string }[]>();
  for (const name of rawSheets) {
    const week = extractWeek(name);
    if (!weekMap.has(week)) weekMap.set(week, []);
    weekMap.get(week)!.push({ routeType: extractRouteType(name), sheetName: name });
  }

  let totalRoutes = 0; let totalStops = 0;

  for (const [week, sheets] of weekMap) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM shopee_week_routes WHERE week_label = $1`, [week]
    );
    if (existing.length > 0) {
      const ids = existing.map((r: any) => r.id);
      await pool.query(`DELETE FROM shopee_week_route_stops WHERE week_route_id = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM shopee_week_routes WHERE week_label = $1`, [week]);
    }

    for (const { routeType, sheetName } of sheets) {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

      let cur: { route_no: string; vehicle_type: string; driver: string; time: string; dock: string; date: number; stops: any[] } | null = null;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        // Raw_ sheets format: col0=date, col1=empty, col2=路線號, col3=車型, col4=司機, col5=時間, col6=碼頭, col7=順序, col8=門市, col9=地址, col10=日配
        const dateSerial = Number(r[0]) || 0;
        const routeNo   = String(r[2]).trim();
        const vType     = String(r[3]).trim();
        const driverId  = String(r[4]).trim();
        const depTime   = String(r[5]).trim();
        const dockNo    = String(r[6]).trim();
        const stopOrd   = Number(r[7]) || 0;
        const storeName = String(r[8]).trim();
        const storeAddr = String(r[9]).trim();
        const nddType   = String(r[10]).trim();

        if (routeNo && /^[A-Za-z0-9]/.test(routeNo)) {
          if (cur) {
            await saveRoute(cur, week, routeType);
            totalRoutes++;
            totalStops += cur.stops.length;
          }
          cur = { route_no: routeNo, vehicle_type: vType, driver: driverId, time: depTime, dock: dockNo, date: dateSerial, stops: [] };
          if (storeName) cur.stops.push({ order: stopOrd, name: storeName, addr: storeAddr, ndd: !!nddType, nddType });
        } else if (storeName && cur) {
          cur.stops.push({ order: stopOrd, name: storeName, addr: storeAddr, ndd: !!nddType, nddType });
        }
      }
      if (cur) {
        await saveRoute(cur, week, routeType);
        totalRoutes++;
        totalStops += cur.stops.length;
      }
    }
  }
  console.log(`[ShopeeSchedule] 匯入完成 — 路線: ${totalRoutes}, 站點: ${totalStops}`);
  return { totalRoutes, totalStops, weeks: weekMap.size };
}

async function saveRoute(
  r: { route_no: string; vehicle_type: string; driver: string; time: string; dock: string; date: number; stops: any[] },
  week: string, routeType: string
) {
  const { rows } = await pool.query(
    `INSERT INTO shopee_week_routes
       (week_label, route_no, route_type, vehicle_type, shopee_driver_id,
        departure_time, dock_no, stop_count, excel_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [week, r.route_no, routeType, r.vehicle_type || null,
     r.driver || null, r.time || null, String(r.dock) || null,
     r.stops.length, r.date || null]
  );
  const wrid = rows[0].id;
  for (const s of r.stops) {
    await pool.query(
      `INSERT INTO shopee_week_route_stops (week_route_id, stop_order, store_name, store_address, is_ndd, ndd_type)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [wrid, s.order, s.name || null, s.addr || null, !!s.ndd, s.nddType || null]
    );
  }
}

// ── GET /api/shopee-schedules/weeks ─────────────────────────────────────────
shopeeSchedulesRouter.get("/shopee-schedules/weeks", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT week_label, COUNT(*) AS route_count,
            SUM(stop_count) AS total_stops,
            MAX(created_at) AS imported_at
     FROM shopee_week_routes
     GROUP BY week_label
     ORDER BY week_label DESC`
  );
  res.json({ ok: true, weeks: rows });
});

// ── GET /api/shopee-schedules ────────────────────────────────────────────────
shopeeSchedulesRouter.get("/shopee-schedules", async (req, res) => {
  const { week, driver, type } = req.query as Record<string, string>;
  const conds: string[] = [];
  const vals: any[] = [];

  if (week)   { vals.push(week);         conds.push(`rp.week_label = $${vals.length}`); }
  if (driver) { vals.push(`%${driver}%`); conds.push(`rp.shopee_driver_id ILIKE $${vals.length}`); }
  if (type)   { vals.push(type);          conds.push(`rp.route_type = $${vals.length}`); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT rp.*, sd.name AS driver_name, sd.phone AS driver_phone
     FROM shopee_week_routes rp
     LEFT JOIN shopee_drivers sd ON sd.shopee_id = rp.shopee_driver_id
     ${where}
     ORDER BY rp.departure_time NULLS LAST, rp.route_no
     LIMIT 500`,
    vals
  );
  res.json({ ok: true, routes: rows, total: rows.length });
});

// ── GET /api/shopee-schedules/:id/stops ──────────────────────────────────────
shopeeSchedulesRouter.get("/shopee-schedules/:id/stops", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM shopee_week_route_stops WHERE week_route_id=$1 ORDER BY stop_order`,
    [Number(req.params.id)]
  );
  res.json({ ok: true, stops: rows });
});

// ── POST /api/shopee-schedules/import ────────────────────────────────────────
shopeeSchedulesRouter.post("/shopee-schedules/import", async (_req, res) => {
  const excelPath = path.resolve(__dirname, "../../../attached_assets/福星高x富詠_-_蝦皮北倉班表_1776495896584.xlsx");
  try {
    const result = await importShopeeScheduleFromExcel(excelPath);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/shopee-schedules/week ────────────────────────────────────────
shopeeSchedulesRouter.delete("/shopee-schedules/week", async (req, res) => {
  const { week } = req.query as Record<string, string>;
  if (!week) return res.status(400).json({ error: "week 為必填" });
  const { rows } = await pool.query(`SELECT id FROM shopee_week_routes WHERE week_label=$1`, [week]);
  const ids = rows.map((r: any) => r.id);
  if (ids.length) {
    await pool.query(`DELETE FROM shopee_week_route_stops WHERE week_route_id=ANY($1)`, [ids]);
    await pool.query(`DELETE FROM shopee_week_routes WHERE week_label=$1`, [week]);
  }
  res.json({ ok: true, deleted: ids.length });
});
