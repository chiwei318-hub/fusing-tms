/**
 * 福興高 × 富詠 每日班表自動派車
 *
 * 流程：
 *   1. 定時從 Google Sheets 拉取班表 CSV（每分鐘檢查，依 schedule_hour_tw 整點觸發）
 *   2. 解析路線列（日期 / 路線號 / 司機工號 / 車隊）
 *   3. 依車隊分組 → 建立 dispatch_orders（若同日已建立則跳過）
 *   4. 每條路線 → 建立 dispatch_order_routes
 *   5. 以蝦皮工號 match fleet_drivers.employee_id → 自動指派 assigned_driver_id
 *   6. 寫入執行紀錄 fusingao_auto_dispatch_logs
 *
 * Google Sheets 欄位（標題列彈性配對，不分大小寫）：
 *   出車日期 | 路線號碼 | 司機工號 | 車隊名稱 | 車型（選填）
 *   同時相容 fusingao_billing_trips 格式（含金額欄則忽略）
 */

import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

export const fusingaoAutoDispatchRouter = Router();

// ── Taiwan timezone helper ─────────────────────────────────────────────────────
function nowTW(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
}
function todayTW(): string {
  const d = nowTW();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Table Setup ────────────────────────────────────────────────────────────────
export async function ensureAutoDispatchTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_auto_dispatch_configs (
      id               SERIAL PRIMARY KEY,
      config_name      TEXT NOT NULL DEFAULT '蝦皮班表自動派車',
      sheet_url        TEXT NOT NULL,
      schedule_hour_tw INTEGER NOT NULL DEFAULT 6,
      date_offset_days INTEGER NOT NULL DEFAULT 0,
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at      TIMESTAMP,
      last_run_date    TEXT,
      last_run_status  TEXT,
      last_run_count   INTEGER DEFAULT 0,
      last_run_assigned INTEGER DEFAULT 0,
      last_run_error   TEXT,
      notes            TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_auto_dispatch_logs (
      id                    SERIAL PRIMARY KEY,
      config_id             INTEGER REFERENCES fusingao_auto_dispatch_configs(id) ON DELETE CASCADE,
      target_date           TEXT NOT NULL,
      dispatch_orders_created INTEGER DEFAULT 0,
      routes_created        INTEGER DEFAULT 0,
      routes_assigned       INTEGER DEFAULT 0,
      routes_skipped        INTEGER DEFAULT 0,
      status                TEXT NOT NULL DEFAULT 'ok',
      error                 TEXT,
      detail                JSONB,
      created_at            TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("[AutoDispatch] tables ensured");
}

// ── Google Sheets CSV fetcher ──────────────────────────────────────────────────
function toExportCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const gidM = raw.match(/gid=(\d+)/);
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gidM ? gidM[1] : "0"}`;
}

// ── Flexible CSV parser ────────────────────────────────────────────────────────
interface ScheduleRow {
  trip_date: string;
  route_no: string;
  driver_id: string;
  fleet_name: string;
  vehicle_type: string;
}

function colIdx(header: string[], keywords: string[]): number {
  for (const kw of keywords) {
    const i = header.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function parseScheduleCsv(text: string): ScheduleRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const raw = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const iDate    = colIdx(raw, ["出車日期", "日期", "trip_date", "date"]);
  const iRoute   = colIdx(raw, ["路線號碼", "路線號", "路線", "route_no", "route"]);
  const iDriver  = colIdx(raw, ["司機工號", "工號", "司機", "driver_id", "shopee_id", "shopee"]);
  const iFleet   = colIdx(raw, ["車隊名稱", "車隊", "fleet_name", "fleet"]);
  const iVehicle = colIdx(raw, ["車型", "vehicle_type", "vehicle"]);

  const rows: ScheduleRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const trip_date  = iDate   >= 0 ? cols[iDate]   ?? "" : "";
    const route_no   = iRoute  >= 0 ? cols[iRoute]  ?? "" : "";
    const driver_id  = iDriver >= 0 ? cols[iDriver] ?? "" : "";
    const fleet_name = iFleet  >= 0 ? cols[iFleet]  ?? "" : "";
    if (!route_no || !trip_date) continue;
    rows.push({
      trip_date:    trip_date.substring(0, 10),
      route_no,
      driver_id,
      fleet_name,
      vehicle_type: iVehicle >= 0 ? (cols[iVehicle] ?? "") : "",
    });
  }
  return rows;
}

// ── Core dispatch function ─────────────────────────────────────────────────────
export async function runAutoDispatch(
  configId: number,
  targetDate?: string
): Promise<{ ordersCreated: number; routesCreated: number; routesAssigned: number; routesSkipped: number; detail: any[] }> {

  const cfgResult = await db.execute(sql`SELECT * FROM fusingao_auto_dispatch_configs WHERE id = ${configId}`);
  const cfg = (cfgResult.rows as any[])[0];
  if (!cfg) throw new Error(`Config ${configId} not found`);

  const date = targetDate ?? (() => {
    const d = nowTW();
    d.setDate(d.getDate() + (cfg.date_offset_days ?? 0));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Fetch CSV
  const csvUrl = toExportCsvUrl(cfg.sheet_url);
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching sheet`);
  const text = await resp.text();
  if (text.trim().startsWith("<!DOCTYPE")) throw new Error("無法讀取試算表，請確認已設為「知道連結的人可查看」");

  // Parse + filter by date
  const allRows = parseScheduleCsv(text);
  const dateRows = allRows.filter(r => r.trip_date === date);
  if (dateRows.length === 0) {
    return { ordersCreated: 0, routesCreated: 0, routesAssigned: 0, routesSkipped: 0, detail: [{ date, note: "當日無班表資料" }] };
  }

  // Group by fleet_name
  const byFleet = new Map<string, ScheduleRow[]>();
  for (const r of dateRows) {
    const key = r.fleet_name || "未指定車隊";
    if (!byFleet.has(key)) byFleet.set(key, []);
    byFleet.get(key)!.push(r);
  }

  let ordersCreated = 0, routesCreated = 0, routesAssigned = 0, routesSkipped = 0;
  const detail: any[] = [];

  for (const [fleetName, rows] of byFleet) {
    // Find matching fleet in fusingao_fleets
    const fleetRes = await pool.query(
      `SELECT id, fleet_name FROM fusingao_fleets WHERE fleet_name ILIKE $1 LIMIT 1`,
      [`%${fleetName}%`]
    );
    const fleet = fleetRes.rows[0] as any;
    if (!fleet) {
      detail.push({ fleet: fleetName, status: "skip", reason: "找不到對應車隊" });
      routesSkipped += rows.length;
      continue;
    }

    // Check if dispatch_order already exists for this fleet + date
    const existing = await pool.query(
      `SELECT id FROM dispatch_orders WHERE fleet_id=$1 AND week_start=$2 AND title LIKE '%自動%' LIMIT 1`,
      [fleet.id, date]
    );

    let dispatchOrderId: number;
    if (existing.rows.length > 0) {
      dispatchOrderId = (existing.rows[0] as any).id;
      detail.push({ fleet: fleetName, status: "reuse", dispatch_order_id: dispatchOrderId, date });
    } else {
      const ins = await pool.query(
        `INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, status, notes)
         VALUES ($1,$2,$3,$4,$4,'sent','自動班表同步') RETURNING id`,
        [fleet.id, fleet.fleet_name, `${date} 自動派車`, date]
      );
      dispatchOrderId = (ins.rows[0] as any).id;
      ordersCreated++;
      detail.push({ fleet: fleetName, status: "created", dispatch_order_id: dispatchOrderId, date });
    }

    // Create routes + assign drivers
    for (const row of rows) {
      // Check if route already in this dispatch order
      const dupCheck = await pool.query(
        `SELECT id FROM dispatch_order_routes WHERE dispatch_order_id=$1 AND route_label=$2 AND route_date=$3 LIMIT 1`,
        [dispatchOrderId, row.route_no, row.trip_date]
      );
      if (dupCheck.rows.length > 0) {
        routesSkipped++;
        continue;
      }

      // Insert route
      const routeIns = await pool.query(
        `INSERT INTO dispatch_order_routes (dispatch_order_id, route_label, route_date, prefix)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [dispatchOrderId, row.route_no, row.trip_date, row.route_no.replace(/\d.*/, "")]
      );
      const routeItemId = (routeIns.rows[0] as any).id;
      routesCreated++;

      // Auto-assign driver by employee_id (蝦皮工號)
      if (row.driver_id) {
        const driverRes = await pool.query(
          `SELECT id, name FROM fleet_drivers WHERE fleet_id=$1 AND employee_id=$2 AND is_active=true LIMIT 1`,
          [fleet.id, row.driver_id]
        );
        const driver = driverRes.rows[0] as any;
        if (driver) {
          await pool.query(
            `UPDATE dispatch_order_routes SET assigned_driver_id=$1, assigned_driver_name=$2, assigned_at=NOW() WHERE id=$3`,
            [driver.id, driver.name, routeItemId]
          );
          routesAssigned++;
        }
      }
    }
  }

  // Update config status
  await db.execute(sql`
    UPDATE fusingao_auto_dispatch_configs SET
      last_run_at = NOW(),
      last_run_date = ${date},
      last_run_status = 'success',
      last_run_count = ${routesCreated},
      last_run_assigned = ${routesAssigned},
      last_run_error = NULL
    WHERE id = ${configId}
  `);

  // Write log
  await db.execute(sql`
    INSERT INTO fusingao_auto_dispatch_logs
      (config_id, target_date, dispatch_orders_created, routes_created, routes_assigned, routes_skipped, status, detail)
    VALUES
      (${configId}, ${date}, ${ordersCreated}, ${routesCreated}, ${routesAssigned}, ${routesSkipped}, 'ok', ${JSON.stringify(detail)})
  `);

  return { ordersCreated, routesCreated, routesAssigned, routesSkipped, detail };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoDispatchScheduler() {
  if (_timer) return;
  _timer = setInterval(async () => {
    try {
      const tw = nowTW();
      const currentHour = tw.getHours();
      const today = todayTW();

      const configs = await db.execute(sql`
        SELECT * FROM fusingao_auto_dispatch_configs
        WHERE is_active = TRUE
          AND schedule_hour_tw = ${currentHour}
          AND (last_run_date IS NULL OR last_run_date <> ${today})
      `);

      for (const cfg of configs.rows as any[]) {
        try {
          console.log(`[AutoDispatch] 開始執行：${cfg.config_name}（日期：${today}）`);
          await runAutoDispatch(cfg.id);
          console.log(`[AutoDispatch] 完成：${cfg.config_name}`);
        } catch (e: any) {
          console.error(`[AutoDispatch] 失敗：${cfg.config_name}`, e.message);
          await db.execute(sql`
            UPDATE fusingao_auto_dispatch_configs SET
              last_run_at = NOW(), last_run_date = ${today},
              last_run_status = 'error', last_run_error = ${e.message}
            WHERE id = ${cfg.id}
          `);
          await db.execute(sql`
            INSERT INTO fusingao_auto_dispatch_logs
              (config_id, target_date, status, error)
            VALUES (${cfg.id}, ${today}, 'error', ${e.message})
          `);
        }
      }
    } catch (e: any) {
      console.error("[AutoDispatch] scheduler error:", e.message);
    }
  }, 60 * 1000);
  console.log("[AutoDispatch] scheduler started, 每分鐘檢查，依設定整點觸發");
}

// ── API Routes ─────────────────────────────────────────────────────────────────

// GET /fusingao/auto-dispatch/configs
fusingaoAutoDispatchRouter.get("/auto-dispatch/configs", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM fusingao_auto_dispatch_configs ORDER BY created_at DESC`);
    res.json({ ok: true, configs: rows.rows });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /fusingao/auto-dispatch/configs
fusingaoAutoDispatchRouter.post("/auto-dispatch/configs", async (req, res) => {
  try {
    const { config_name = "蝦皮班表自動派車", sheet_url, schedule_hour_tw = 6, date_offset_days = 0, notes } = req.body;
    if (!sheet_url) return res.status(400).json({ ok: false, error: "sheet_url 必填" });
    const row = await db.execute(sql`
      INSERT INTO fusingao_auto_dispatch_configs
        (config_name, sheet_url, schedule_hour_tw, date_offset_days, notes)
      VALUES (${config_name}, ${sheet_url}, ${Number(schedule_hour_tw)}, ${Number(date_offset_days)}, ${notes ?? null})
      RETURNING *
    `);
    res.json({ ok: true, config: (row.rows as any[])[0] });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// PATCH /fusingao/auto-dispatch/configs/:id
fusingaoAutoDispatchRouter.patch("/auto-dispatch/configs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { config_name, sheet_url, schedule_hour_tw, date_offset_days, is_active, notes } = req.body;
    await db.execute(sql`
      UPDATE fusingao_auto_dispatch_configs SET
        config_name      = COALESCE(${config_name      ?? null}, config_name),
        sheet_url        = COALESCE(${sheet_url        ?? null}, sheet_url),
        schedule_hour_tw = COALESCE(${schedule_hour_tw != null ? Number(schedule_hour_tw) : null}, schedule_hour_tw),
        date_offset_days = COALESCE(${date_offset_days != null ? Number(date_offset_days) : null}, date_offset_days),
        is_active        = COALESCE(${is_active        != null ? Boolean(is_active)       : null}, is_active),
        notes            = COALESCE(${notes            ?? null}, notes)
      WHERE id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /fusingao/auto-dispatch/configs/:id
fusingaoAutoDispatchRouter.delete("/auto-dispatch/configs/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM fusingao_auto_dispatch_configs WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /fusingao/auto-dispatch/configs/:id/run — manual trigger
fusingaoAutoDispatchRouter.post("/auto-dispatch/configs/:id/run", async (req, res) => {
  try {
    const { date } = req.body;
    const result = await runAutoDispatch(Number(req.params.id), date || undefined);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /fusingao/auto-dispatch/logs — recent execution logs
fusingaoAutoDispatchRouter.get("/auto-dispatch/logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const rows = await db.execute(sql`
      SELECT l.*, c.config_name
      FROM fusingao_auto_dispatch_logs l
      LEFT JOIN fusingao_auto_dispatch_configs c ON c.id = l.config_id
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `);
    res.json({ ok: true, logs: rows.rows });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /fusingao/auto-dispatch/preview — preview what would be dispatched for a date
fusingaoAutoDispatchRouter.get("/auto-dispatch/preview", async (req, res) => {
  try {
    const { config_id, date } = req.query as Record<string, string>;
    if (!config_id) return res.status(400).json({ ok: false, error: "config_id 必填" });
    const cfgResult = await db.execute(sql`SELECT * FROM fusingao_auto_dispatch_configs WHERE id = ${Number(config_id)}`);
    const cfg = (cfgResult.rows as any[])[0];
    if (!cfg) return res.status(404).json({ ok: false, error: "Config not found" });
    const targetDate = date || todayTW();
    const csvUrl = toExportCsvUrl(cfg.sheet_url);
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.trim().startsWith("<!DOCTYPE")) throw new Error("無法讀取試算表");
    const allRows = parseScheduleCsv(text);
    const dateRows = allRows.filter(r => r.trip_date === targetDate);
    const byFleet: Record<string, typeof dateRows> = {};
    for (const r of dateRows) {
      const k = r.fleet_name || "未指定車隊";
      (byFleet[k] = byFleet[k] ?? []).push(r);
    }
    res.json({ ok: true, date: targetDate, total: dateRows.length, by_fleet: byFleet });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});
