/**
 * 福興高 × 富詠 蝦皮北倉班表 Excel Import
 * Parses the schedule file containing route IDs, vehicle types, driver IDs, dock numbers,
 * and store delivery addresses (上貨/碼頭 + 下貨/門市地址).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as ExcelJS from "exceljs";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const fusingaoScheduleRouter = Router();

// ── Table setup ────────────────────────────────────────────────────────────────
export async function ensureScheduleTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shopee_route_schedules (
      id             SERIAL PRIMARY KEY,
      route_date     DATE,
      route_id       TEXT NOT NULL,
      route_type     TEXT,
      warehouse      TEXT,
      vehicle_type   TEXT,
      driver_id      TEXT,
      departure_time TEXT,
      dock_number    TEXT,
      sheet_name     TEXT,
      import_month   TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shopee_route_stops (
      id                   SERIAL PRIMARY KEY,
      schedule_id          INTEGER REFERENCES shopee_route_schedules(id) ON DELETE CASCADE,
      route_id             TEXT NOT NULL,
      stop_sequence        INTEGER,
      store_name           TEXT,
      store_address        TEXT,
      daily_delivery_type  TEXT,
      created_at           TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_schedule_route ON shopee_route_schedules(route_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_schedule_month ON shopee_route_schedules(import_month)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_stops_route ON shopee_route_stops(route_id)`);
}

// ── Excel parser ───────────────────────────────────────────────────────────────
interface RouteSchedule {
  route_id: string;
  vehicle_type: string;
  driver_id: string;
  departure_time: string;
  dock_number: string;
  route_date: string | null;
  sheet_name: string;
  route_type: string;
  warehouse: string;
  stops: { stop_sequence: number; store_name: string; store_address: string; daily_delivery_type: string }[];
}

function detectRouteType(sheetName: string): string {
  if (sheetName.includes("WH NDD") || sheetName.includes("WHNDD")) return "WHNDD";
  if (sheetName.includes("NDD")) return "NDD";
  if (sheetName.includes("流水線") || sheetName.includes("快速到貨")) return "店配車";
  if (sheetName.includes("主線") || sheetName.includes("主線")) return "主線";
  return "NDD";
}

function detectWarehouse(sheetName: string): string {
  if (sheetName.includes("北倉")) return "N-SOC";
  if (sheetName.includes("南倉")) return "S-SOC";
  if (sheetName.includes("WH")) return "N-WH";
  return "N-SOC";
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ((v as any).text) return String((v as any).text);
    if ((v as any).richText) return (v as any).richText.map((r: any) => r.text).join("");
    if (v instanceof Date) return v.toISOString().substring(0, 10);
    if ((v as any).formula !== undefined) {
      const result = (v as any).result;
      if (result === null || result === undefined) return "";
      if (result instanceof Date) return result.toISOString().substring(0, 10);
      return String(result);
    }
  }
  return String(v);
}

export async function parseScheduleExcel(buffer: Buffer): Promise<RouteSchedule[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const routes: RouteSchedule[] = [];

  for (const ws of wb.worksheets) {
    const name = ws.name;
    // Skip non-route sheets
    if (!name.includes("主線") && !name.includes("NDD") && !name.includes("流水線") && !name.includes("快速到貨")) continue;
    // Skip very small sheets
    if (ws.rowCount < 2) continue;

    const routeType = detectRouteType(name);
    const warehouse = detectWarehouse(name);

    // Find header row: look for row with 路線編號 in col 1 or 3
    let headerRow = 1;
    let routeIdCol = 1, vehicleTypeCol = 2, driverIdCol = 3, deptTimeCol = 4, dockCol = 5;
    let stopSeqCol = 6, storeNameCol = 7, storeAddrCol = 8, dailyDelivCol = 9;
    let dateCol = -1;

    ws.eachRow((row, rn) => {
      if (rn > 5) return;
      const c1 = cellText(row.getCell(1));
      const c3 = cellText(row.getCell(3));
      if (c1.includes("路線編號") || c3.includes("路線編號")) {
        headerRow = rn;
        if (c3.includes("路線編號")) {
          // Raw_ sheets have date in col1, blank in col2, then route data from col3
          dateCol = 1;
          routeIdCol = 3; vehicleTypeCol = 4; driverIdCol = 5;
          deptTimeCol = 6; dockCol = 7;
          stopSeqCol = 8; storeNameCol = 9; storeAddrCol = 10; dailyDelivCol = 11;
        }
      }
    });

    let currentRoute: RouteSchedule | null = null;

    ws.eachRow((row, rn) => {
      if (rn <= headerRow) return;

      const routeId = cellText(row.getCell(routeIdCol));
      const vehicleType = cellText(row.getCell(vehicleTypeCol));
      const driverId = cellText(row.getCell(driverIdCol));
      const deptTime = cellText(row.getCell(deptTimeCol));
      const dock = cellText(row.getCell(dockCol));
      const stopSeq = cellText(row.getCell(stopSeqCol));
      const storeName = cellText(row.getCell(storeNameCol));
      const storeAddr = cellText(row.getCell(storeAddrCol));
      const dailyDeliv = cellText(row.getCell(dailyDelivCol));
      const dateStr = dateCol > 0 ? cellText(row.getCell(dateCol)) : null;

      if (!storeName && !routeId) return; // empty row

      if (routeId && routeId !== "7/22開始" && routeId !== "8/11開始" && !routeId.startsWith("※")) {
        // New route header
        currentRoute = {
          route_id: routeId,
          vehicle_type: vehicleType,
          driver_id: driverId,
          departure_time: deptTime,
          dock_number: dock,
          route_date: dateStr ? (dateStr.length >= 10 ? dateStr.substring(0, 10) : null) : null,
          sheet_name: name,
          route_type: routeType,
          warehouse,
          stops: [],
        };
        routes.push(currentRoute);
      }

      if (currentRoute && storeName) {
        currentRoute.stops.push({
          stop_sequence: stopSeq ? parseInt(stopSeq) || currentRoute.stops.length + 1 : currentRoute.stops.length + 1,
          store_name: storeName,
          store_address: storeAddr,
          daily_delivery_type: dailyDeliv,
        });
      }
    });
  }

  // Deduplicate: keep first occurrence of each route_id
  const seen = new Set<string>();
  return routes.filter(r => {
    if (seen.has(r.route_id)) return false;
    seen.add(r.route_id);
    return true;
  });
}

// ── POST /fusingao/schedule/import ────────────────────────────────────────────
fusingaoScheduleRouter.post("/schedule/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "請上傳班表 Excel 檔案" });

    const routes = await parseScheduleExcel(req.file.buffer);
    if (routes.length === 0) return res.status(400).json({ ok: false, error: "未找到有效路線資料" });

    // Derive import month from first route date or today
    const firstDate = routes.find(r => r.route_date)?.route_date;
    const importMonth = firstDate ? firstDate.substring(0, 7) : new Date().toISOString().substring(0, 7);

    // Delete existing for this month
    await db.execute(sql`
      DELETE FROM shopee_route_stops WHERE schedule_id IN (
        SELECT id FROM shopee_route_schedules WHERE import_month = ${importMonth}
      )
    `);
    await db.execute(sql`DELETE FROM shopee_route_schedules WHERE import_month = ${importMonth}`);

    let inserted = 0;
    for (const r of routes) {
      const [sched] = await db.execute(sql`
        INSERT INTO shopee_route_schedules
          (route_date, route_id, route_type, warehouse, vehicle_type, driver_id, departure_time, dock_number, sheet_name, import_month)
        VALUES (
          ${r.route_date ?? null}, ${r.route_id}, ${r.route_type}, ${r.warehouse},
          ${r.vehicle_type || null}, ${r.driver_id || null}, ${r.departure_time || null},
          ${r.dock_number || null}, ${r.sheet_name}, ${importMonth}
        )
        RETURNING id
      `).then(x => x.rows as any[]);

      if (sched && r.stops.length > 0) {
        for (const stop of r.stops) {
          await db.execute(sql`
            INSERT INTO shopee_route_stops (schedule_id, route_id, stop_sequence, store_name, store_address, daily_delivery_type)
            VALUES (${sched.id}, ${r.route_id}, ${stop.stop_sequence}, ${stop.store_name || null}, ${stop.store_address || null}, ${stop.daily_delivery_type || null})
          `);
        }
      }
      inserted++;
    }

    res.json({ ok: true, imported: inserted, month: importMonth, totalStops: routes.reduce((s, r) => s + r.stops.length, 0) });
  } catch (err: any) {
    console.error("Schedule import error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fusingao/schedule/routes ─────────────────────────────────────────────
fusingaoScheduleRouter.get("/schedule/routes", async (req, res) => {
  try {
    const { month, search, route_type } = req.query as Record<string, string>;
    let where = "WHERE 1=1";
    if (month) where += ` AND s.import_month = '${month}'`;
    if (route_type) where += ` AND s.route_type = '${route_type}'`;
    if (search) where += ` AND (s.route_id ILIKE '%${search}%' OR s.dock_number ILIKE '%${search}%' OR s.driver_id ILIKE '%${search}%')`;

    const rows = await db.execute(sql.raw(`
      SELECT s.*, COUNT(st.id)::int AS stop_count
      FROM shopee_route_schedules s
      LEFT JOIN shopee_route_stops st ON st.schedule_id = s.id
      ${where}
      GROUP BY s.id
      ORDER BY s.route_type, s.route_id
      LIMIT 500
    `));
    const months = await db.execute(sql`SELECT DISTINCT import_month FROM shopee_route_schedules ORDER BY import_month DESC`);
    res.json({ ok: true, routes: rows.rows, months: months.rows.map((r: any) => r.import_month) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fusingao/schedule/routes/:id/stops ───────────────────────────────────
fusingaoScheduleRouter.get("/schedule/routes/:id/stops", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM shopee_route_stops WHERE schedule_id = ${Number(req.params.id)}
      ORDER BY stop_sequence
    `);
    res.json({ ok: true, stops: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fusingao/schedule/addresses ── store address lookup ──────────────────
fusingaoScheduleRouter.get("/schedule/addresses", async (req, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    let where = "WHERE store_address IS NOT NULL AND store_address != ''";
    if (search) where += ` AND (store_name ILIKE '%${search}%' OR store_address ILIKE '%${search}%')`;
    const rows = await db.execute(sql.raw(`
      SELECT DISTINCT store_name, store_address, daily_delivery_type
      FROM shopee_route_stops ${where}
      ORDER BY store_name
      LIMIT 300
    `));
    res.json({ ok: true, addresses: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
