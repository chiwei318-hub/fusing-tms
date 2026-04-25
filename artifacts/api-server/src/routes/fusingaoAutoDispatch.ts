/**
 * 福興高 × 富詠 每日班表自動派車 + 變動偵測
 *
 * 流程：
 *   同步今日班表（Google Sheets CSV）
 *   ↓ 與現有 dispatch_order_routes 比對差異
 *   ↓ 路線沒改 → 延用原司機（unchanged）
 *   ↓ 路線有改 → 更新指派，標記 needs_reassignment（driver_changed / new / removed）
 *   ↓ APP 推播通知異動司機
 *
 * 欄位彈性配對（標題列，不分大小寫）：
 *   出車日期 | 路線號碼 | 司機工號 | 車隊名稱 | 車型（選填）
 */

import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

export const fusingaoAutoDispatchRouter = Router();

// ── Taiwan timezone ────────────────────────────────────────────────────────────
function nowTW(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
}
function todayTW(): string {
  const d = nowTW();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Table setup ────────────────────────────────────────────────────────────────
export async function ensureAutoDispatchTables() {
  // Core configs table
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
      last_snapshot    JSONB,
      notes            TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add last_snapshot if table already existed
  await db.execute(sql`ALTER TABLE fusingao_auto_dispatch_configs ADD COLUMN IF NOT EXISTS last_snapshot JSONB`);

  // Execution logs
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_auto_dispatch_logs (
      id                      SERIAL PRIMARY KEY,
      config_id               INTEGER REFERENCES fusingao_auto_dispatch_configs(id) ON DELETE CASCADE,
      target_date             TEXT NOT NULL,
      dispatch_orders_created INTEGER DEFAULT 0,
      routes_created          INTEGER DEFAULT 0,
      routes_assigned         INTEGER DEFAULT 0,
      routes_skipped          INTEGER DEFAULT 0,
      routes_changed          INTEGER DEFAULT 0,
      routes_removed          INTEGER DEFAULT 0,
      status                  TEXT NOT NULL DEFAULT 'ok',
      error                   TEXT,
      detail                  JSONB,
      created_at              TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE fusingao_auto_dispatch_logs ADD COLUMN IF NOT EXISTS routes_changed INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE fusingao_auto_dispatch_logs ADD COLUMN IF NOT EXISTS routes_removed INTEGER DEFAULT 0`);

  // Change-tracking columns on dispatch_order_routes
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS needs_reassignment BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS change_reason TEXT`);

  console.log("[AutoDispatch] tables ensured");
}

// ── CSV helpers ────────────────────────────────────────────────────────────────
function toExportCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const gidM = raw.match(/gid=(\d+)/);
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gidM ? gidM[1] : "0"}`;
}

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
    const trip_date  = iDate   >= 0 ? (cols[iDate]   ?? "") : "";
    const route_no   = iRoute  >= 0 ? (cols[iRoute]  ?? "") : "";
    const driver_id  = iDriver >= 0 ? (cols[iDriver] ?? "") : "";
    const fleet_name = iFleet  >= 0 ? (cols[iFleet]  ?? "") : "";
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

// ── Snapshot format ────────────────────────────────────────────────────────────
// Stored in fusingao_auto_dispatch_configs.last_snapshot:
//   { "2025-04-25": { "KH-001": { driver_id, vehicle_type } } }
type RouteSnapshot = Record<string, { driver_id: string; vehicle_type: string }>;
type DateSnapshot  = Record<string, RouteSnapshot>; // date → RouteSnapshot

// ── Diff classification ────────────────────────────────────────────────────────
export type DiffKind = "unchanged" | "driver_changed" | "new" | "removed";

export interface DiffRoute {
  route_no: string;
  fleet_name: string;
  kind: DiffKind;
  old_driver_id?: string;
  new_driver_id?: string;
  vehicle_type?: string;
  existing_route_id?: number;
  existing_driver_name?: string;
}

export interface DiffResult {
  date: string;
  unchanged: DiffRoute[];
  driver_changed: DiffRoute[];
  new: DiffRoute[];
  removed: DiffRoute[];
  total_sheet: number;
}

/**
 * Compare incoming sheet rows for a date against:
 *   (a) existing dispatch_order_routes in DB  ← primary truth
 *   (b) last_snapshot in config               ← fallback when no routes exist yet
 */
async function computeDiff(
  configId: number,
  dateRows: ScheduleRow[],
  date: string
): Promise<DiffResult> {
  // Fetch existing routes from DB for this date (from auto-dispatched orders only)
  const existingRes = await pool.query(
    `SELECT r.id, r.route_label, r.assigned_driver_name,
            fd.employee_id AS driver_emp_id,
            f.fleet_name
     FROM dispatch_order_routes r
     JOIN dispatch_orders o ON o.id = r.dispatch_order_id
     JOIN fusingao_fleets f ON f.id = o.fleet_id
     LEFT JOIN fleet_drivers fd ON fd.id = r.assigned_driver_id
     WHERE r.route_date = $1
       AND o.title LIKE '%自動%'
     ORDER BY r.route_label`,
    [date]
  );

  // Map: route_label → existing DB record
  const existingMap = new Map<string, any>();
  for (const row of existingRes.rows as any[]) {
    existingMap.set(row.route_label, row);
  }

  // Fetch last_snapshot as fallback (only used when existingMap is empty)
  const cfgRes = await db.execute(sql`SELECT last_snapshot FROM fusingao_auto_dispatch_configs WHERE id = ${configId}`);
  const lastSnap: DateSnapshot = (cfgRes.rows as any[])[0]?.last_snapshot ?? {};
  const snapForDate: RouteSnapshot = lastSnap[date] ?? {};

  const unchanged: DiffRoute[] = [];
  const driver_changed: DiffRoute[] = [];
  const newRoutes: DiffRoute[] = [];

  const seenRouteNos = new Set<string>();

  for (const row of dateRows) {
    seenRouteNos.add(row.route_no);
    const existing = existingMap.get(row.route_no);
    const snapEntry = snapForDate[row.route_no];

    if (existing) {
      // Route already in DB
      const dbDriverEmpId = existing.driver_emp_id ?? "";
      if (!row.driver_id || dbDriverEmpId === row.driver_id) {
        unchanged.push({
          route_no: row.route_no,
          fleet_name: existing.fleet_name ?? row.fleet_name,
          kind: "unchanged",
          new_driver_id: row.driver_id,
          vehicle_type: row.vehicle_type,
          existing_route_id: existing.id,
          existing_driver_name: existing.assigned_driver_name,
        });
      } else {
        driver_changed.push({
          route_no: row.route_no,
          fleet_name: existing.fleet_name ?? row.fleet_name,
          kind: "driver_changed",
          old_driver_id: dbDriverEmpId,
          new_driver_id: row.driver_id,
          vehicle_type: row.vehicle_type,
          existing_route_id: existing.id,
          existing_driver_name: existing.assigned_driver_name,
        });
      }
    } else if (snapEntry) {
      // Not in DB yet but we have a snapshot — treat as known
      if (snapEntry.driver_id === row.driver_id) {
        unchanged.push({ route_no: row.route_no, fleet_name: row.fleet_name, kind: "unchanged", new_driver_id: row.driver_id, vehicle_type: row.vehicle_type });
      } else {
        driver_changed.push({ route_no: row.route_no, fleet_name: row.fleet_name, kind: "driver_changed", old_driver_id: snapEntry.driver_id, new_driver_id: row.driver_id, vehicle_type: row.vehicle_type });
      }
    } else {
      // Brand new
      newRoutes.push({ route_no: row.route_no, fleet_name: row.fleet_name, kind: "new", new_driver_id: row.driver_id, vehicle_type: row.vehicle_type });
    }
  }

  // Routes in DB but missing from sheet → removed
  const removed: DiffRoute[] = [];
  for (const [routeLabel, existing] of existingMap) {
    if (!seenRouteNos.has(routeLabel)) {
      removed.push({
        route_no: routeLabel,
        fleet_name: existing.fleet_name,
        kind: "removed",
        old_driver_id: existing.driver_emp_id,
        existing_route_id: existing.id,
        existing_driver_name: existing.assigned_driver_name,
      });
    }
  }

  return {
    date,
    unchanged,
    driver_changed,
    new: newRoutes,
    removed,
    total_sheet: dateRows.length,
  };
}

// ── Core dispatch function (change-aware) ──────────────────────────────────────
export async function runAutoDispatch(
  configId: number,
  targetDate?: string
): Promise<{
  ordersCreated: number;
  routesCreated: number;
  routesAssigned: number;
  routesSkipped: number;
  routesChanged: number;
  routesRemoved: number;
  diff: DiffResult | null;
  detail: any[];
}> {
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

  const allRows = parseScheduleCsv(text);
  const dateRows = allRows.filter(r => r.trip_date === date);

  if (dateRows.length === 0) {
    return { ordersCreated: 0, routesCreated: 0, routesAssigned: 0, routesSkipped: 0, routesChanged: 0, routesRemoved: 0, diff: null, detail: [{ date, note: "當日無班表資料" }] };
  }

  // Compute diff
  const diff = await computeDiff(configId, dateRows, date);

  let ordersCreated = 0, routesCreated = 0, routesAssigned = 0, routesSkipped = 0;
  let routesChanged = 0, routesRemoved = 0;
  const detail: any[] = [];

  // Build new snapshot
  const newSnap: RouteSnapshot = {};
  for (const row of dateRows) {
    newSnap[row.route_no] = { driver_id: row.driver_id, vehicle_type: row.vehicle_type };
  }

  // Group by fleet_name
  const byFleet = new Map<string, ScheduleRow[]>();
  for (const r of dateRows) {
    const key = r.fleet_name || "未指定車隊";
    if (!byFleet.has(key)) byFleet.set(key, []);
    byFleet.get(key)!.push(r);
  }

  for (const [fleetName, rows] of byFleet) {
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

    // Get or create dispatch_order
    const existingOrder = await pool.query(
      `SELECT id FROM dispatch_orders WHERE fleet_id=$1 AND week_start=$2 AND title LIKE '%自動%' LIMIT 1`,
      [fleet.id, date]
    );
    let dispatchOrderId: number;
    if (existingOrder.rows.length > 0) {
      dispatchOrderId = (existingOrder.rows[0] as any).id;
    } else {
      const ins = await pool.query(
        `INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, status, notes)
         VALUES ($1,$2,$3,$4,$4,'sent','自動班表同步') RETURNING id`,
        [fleet.id, fleet.fleet_name, `${date} 自動派車`, date]
      );
      dispatchOrderId = (ins.rows[0] as any).id;
      ordersCreated++;
    }

    for (const row of rows) {
      const diffEntry =
        diff.unchanged.find(d => d.route_no === row.route_no) ??
        diff.driver_changed.find(d => d.route_no === row.route_no) ??
        diff.new.find(d => d.route_no === row.route_no);

      if (!diffEntry) { routesSkipped++; continue; }

      if (diffEntry.kind === "unchanged" && diffEntry.existing_route_id) {
        // Route in DB with correct driver → nothing to do
        routesSkipped++;
        continue;
      }

      if (diffEntry.kind === "driver_changed" && diffEntry.existing_route_id) {
        // Driver changed → update assignment + flag
        const driverRes = await pool.query(
          `SELECT id, name FROM fleet_drivers WHERE fleet_id=$1 AND employee_id=$2 AND is_active=true LIMIT 1`,
          [fleet.id, row.driver_id]
        );
        const driver = driverRes.rows[0] as any;
        if (driver) {
          await pool.query(
            `UPDATE dispatch_order_routes
             SET assigned_driver_id=$1, assigned_driver_name=$2, assigned_at=NOW(),
                 needs_reassignment=TRUE, change_reason='driver_changed'
             WHERE id=$3`,
            [driver.id, driver.name, diffEntry.existing_route_id]
          );
          routesAssigned++;
        } else {
          await pool.query(
            `UPDATE dispatch_order_routes
             SET needs_reassignment=TRUE, change_reason='driver_not_found'
             WHERE id=$1`,
            [diffEntry.existing_route_id]
          );
        }
        routesChanged++;
        continue;
      }

      // New route — check not already inserted
      const dupCheck = await pool.query(
        `SELECT id FROM dispatch_order_routes WHERE dispatch_order_id=$1 AND route_label=$2 AND route_date=$3 LIMIT 1`,
        [dispatchOrderId, row.route_no, row.trip_date]
      );
      if (dupCheck.rows.length > 0) { routesSkipped++; continue; }

      const routeIns = await pool.query(
        `INSERT INTO dispatch_order_routes
           (dispatch_order_id, route_label, route_date, prefix, needs_reassignment, change_reason)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [dispatchOrderId, row.route_no, row.trip_date,
         row.route_no.replace(/\d.*/, ""),
         !row.driver_id,
         row.driver_id ? null : "no_driver_id"]
      );
      const routeItemId = (routeIns.rows[0] as any).id;
      routesCreated++;

      if (row.driver_id) {
        const driverRes = await pool.query(
          `SELECT id, name FROM fleet_drivers WHERE fleet_id=$1 AND employee_id=$2 AND is_active=true LIMIT 1`,
          [fleet.id, row.driver_id]
        );
        const driver = driverRes.rows[0] as any;
        if (driver) {
          await pool.query(
            `UPDATE dispatch_order_routes
             SET assigned_driver_id=$1, assigned_driver_name=$2, assigned_at=NOW(), needs_reassignment=FALSE
             WHERE id=$3`,
            [driver.id, driver.name, routeItemId]
          );
          routesAssigned++;
        } else {
          await pool.query(
            `UPDATE dispatch_order_routes SET needs_reassignment=TRUE, change_reason='driver_not_found' WHERE id=$1`,
            [routeItemId]
          );
        }
      }
    }
  }

  // Handle removed routes
  for (const removed of diff.removed) {
    if (removed.existing_route_id) {
      await pool.query(
        `UPDATE dispatch_order_routes
         SET needs_reassignment=TRUE, change_reason='removed_from_sheet'
         WHERE id=$1`,
        [removed.existing_route_id]
      );
      routesRemoved++;
    }
  }

  // Save updated snapshot
  const currentSnap: DateSnapshot = cfg.last_snapshot ?? {};
  currentSnap[date] = newSnap;
  // Keep only last 7 days in snapshot
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  for (const d of Object.keys(currentSnap)) {
    if (new Date(d) < cutoff) delete currentSnap[d];
  }

  await db.execute(sql`
    UPDATE fusingao_auto_dispatch_configs SET
      last_run_at       = NOW(),
      last_run_date     = ${date},
      last_run_status   = 'success',
      last_run_count    = ${routesCreated + routesChanged},
      last_run_assigned = ${routesAssigned},
      last_run_error    = NULL,
      last_snapshot     = ${JSON.stringify(currentSnap)}
    WHERE id = ${configId}
  `);

  await db.execute(sql`
    INSERT INTO fusingao_auto_dispatch_logs
      (config_id, target_date, dispatch_orders_created, routes_created, routes_assigned,
       routes_skipped, routes_changed, routes_removed, status, detail)
    VALUES
      (${configId}, ${date}, ${ordersCreated}, ${routesCreated}, ${routesAssigned},
       ${routesSkipped}, ${routesChanged}, ${routesRemoved}, 'ok', ${JSON.stringify({ diff_summary: {
         unchanged: diff.unchanged.length,
         driver_changed: diff.driver_changed.length,
         new: diff.new.length,
         removed: diff.removed.length,
       }, detail })})
  `);

  return { ordersCreated, routesCreated, routesAssigned, routesSkipped, routesChanged, routesRemoved, diff, detail };
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
          console.log(`[AutoDispatch] 執行：${cfg.config_name}（${today}）`);
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

// POST /fusingao/auto-dispatch/configs/:id/run
fusingaoAutoDispatchRouter.post("/auto-dispatch/configs/:id/run", async (req, res) => {
  try {
    const { date } = req.body;
    const result = await runAutoDispatch(Number(req.params.id), date || undefined);
    res.json({ ok: true, ...result });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /fusingao/auto-dispatch/logs
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

// GET /fusingao/auto-dispatch/preview?config_id=&date=  (diff-aware)
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

    // Compute diff
    const diff = await computeDiff(Number(config_id), dateRows, targetDate);

    // Also build flat by_fleet for backward compat
    const byFleet: Record<string, any[]> = {};
    for (const r of dateRows) {
      const k = r.fleet_name || "未指定車隊";
      (byFleet[k] = byFleet[k] ?? []).push(r);
    }

    res.json({ ok: true, date: targetDate, total: dateRows.length, by_fleet: byFleet, diff });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /fusingao/auto-dispatch/pending — routes marked needs_reassignment for today
fusingaoAutoDispatchRouter.get("/auto-dispatch/pending", async (req, res) => {
  try {
    const date = (req.query.date as string) || todayTW();
    const rows = await pool.query(
      `SELECT r.id, r.route_label, r.route_date, r.change_reason,
              r.assigned_driver_id, r.assigned_driver_name,
              o.fleet_name, o.id AS dispatch_order_id,
              fd.employee_id, fd.line_id
       FROM dispatch_order_routes r
       JOIN dispatch_orders o ON o.id = r.dispatch_order_id
       LEFT JOIN fleet_drivers fd ON fd.id = r.assigned_driver_id
       WHERE r.route_date = $1 AND r.needs_reassignment = TRUE
       ORDER BY r.change_reason, r.route_label`,
      [date]
    );
    res.json({ ok: true, date, routes: rows.rows });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /fusingao/auto-dispatch/notify — LINE push to assigned drivers
fusingaoAutoDispatchRouter.post("/auto-dispatch/notify", async (req, res) => {
  try {
    const { date, changed_only = false } = req.body as { date?: string; changed_only?: boolean };
    const targetDate = date || todayTW();
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

    const whereExtra = changed_only ? `AND r.needs_reassignment = TRUE` : "";
    const routesRes = await pool.query(
      `SELECT r.route_label, r.route_date, r.change_reason, r.needs_reassignment,
              fd.name AS driver_name, fd.line_id, f.fleet_name
       FROM dispatch_order_routes r
       JOIN dispatch_orders o ON o.id = r.dispatch_order_id
       JOIN fleet_drivers fd  ON fd.id = r.assigned_driver_id
       JOIN fusingao_fleets f ON f.id  = o.fleet_id
       WHERE r.route_date = $1
         AND fd.line_id IS NOT NULL AND fd.line_id <> ''
         ${whereExtra}
       ORDER BY fd.id, r.route_label`,
      [targetDate]
    );

    // Group by driver
    const byDriver = new Map<string, { name: string; fleet: string; routes: { label: string; changed: boolean; reason: string | null }[] }>();
    for (const row of routesRes.rows as any[]) {
      if (!byDriver.has(row.line_id)) {
        byDriver.set(row.line_id, { name: row.driver_name, fleet: row.fleet_name, routes: [] });
      }
      byDriver.get(row.line_id)!.routes.push({
        label: row.route_label,
        changed: !!row.needs_reassignment,
        reason: row.change_reason,
      });
    }

    if (byDriver.size === 0) {
      return res.json({ ok: true, sent: 0, skipped: 0, reason: changed_only ? "無異動路線的司機" : "無可推播的司機（未設定 LINE ID）" });
    }

    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const [lineId, info] of byDriver) {
      const routeLines = info.routes.map(r => {
        const tag = r.changed ? (r.reason === "removed_from_sheet" ? "⚠️ 已移除" : "🔄 更新") : "✅";
        return `  ${tag} ${r.label}`;
      }).join("\n");

      const msgText = changed_only
        ? `🔔【富詠班表變動通知】\n日期：${targetDate}\n\n您的路線有異動：\n${routeLines}\n\n請留意出車安排，謝謝！`
        : `📋【富詠派車通知】\n日期：${targetDate}\n車隊：${info.fleet}\n\n您今日的路線：\n${routeLines}\n\n請準時出車，謝謝！`;

      if (!token) {
        console.log(`[AutoDispatch][Notify] 模擬推播 → ${info.name}:`, info.routes.map(r => r.label).join(", "));
        sent++;
        continue;
      }

      try {
        const r = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineId, messages: [{ type: "text", text: msgText }] }),
        });
        if (r.ok) { sent++; }
        else { const err = await r.text(); errors.push(`${info.name}: ${err}`); failed++; }
      } catch (e: any) { errors.push(`${info.name}: ${e.message}`); failed++; }
    }

    await db.execute(sql`
      INSERT INTO fusingao_auto_dispatch_logs
        (config_id, target_date, dispatch_orders_created, routes_created, routes_assigned,
         routes_skipped, status, detail)
      VALUES
        (NULL, ${targetDate}, 0, 0, ${sent}, ${failed},
         ${failed > 0 ? "partial" : "ok"},
         ${JSON.stringify({ action: "notify", changed_only, sent, failed, errors })})
    `);

    res.json({ ok: true, sent, failed, drivers: byDriver.size, errors: errors.slice(0, 5) });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});
