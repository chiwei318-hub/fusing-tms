/**
 * Google Sheets 班表變動監控器
 * 每 30 分鐘抓取 Google Sheets CSV，與 dispatch_order_routes 比對
 * 若偵測到司機異動 → 立即推播受影響司機（LINE + Atoms APP）
 */
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  toExportCsvUrl,
  parseScheduleCsv,
  computeDiff,
  DiffRoute,
} from "../routes/fusingaoAutoDispatch";
import { pushScheduleChange } from "./scheduledNotifications";

const WATCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ── In-memory hash to avoid duplicate pushes ───────────────────────────────────
// key = `${configId}:${date}`, value = hash of route→driver mapping
const lastSeenHash = new Map<string, string>();

function hashRoutes(rows: Array<{ route_no: string; driver_id: string }>): string {
  return rows
    .map(r => `${r.route_no}:${r.driver_id}`)
    .sort()
    .join("|");
}

// ── Find fleet_driver IDs from route labels / employee IDs ─────────────────────

async function resolveDriverIds(
  changedRoutes: DiffRoute[],
  date: string,
): Promise<number[]> {
  const ids = new Set<number>();

  // 1. Routes already in dispatch_order_routes — use assigned_driver_id directly
  const routeLabels = changedRoutes.map(r => r.route_no);
  if (routeLabels.length > 0) {
    const { rows } = await pool.query(
      `SELECT DISTINCT assigned_driver_id
       FROM dispatch_order_routes
       WHERE route_date = $1
         AND route_label = ANY($2::text[])
         AND assigned_driver_id IS NOT NULL`,
      [date, routeLabels],
    );
    for (const row of rows as any[]) ids.add(row.assigned_driver_id);
  }

  // 2. New routes — look up by employee_id from sheet
  const empIds = changedRoutes
    .filter(r => r.kind === "new" || r.kind === "driver_changed")
    .map(r => r.new_driver_id)
    .filter(Boolean);
  if (empIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id FROM fleet_drivers
       WHERE employee_id = ANY($1::text[]) AND is_active = TRUE`,
      [empIds],
    );
    for (const row of rows as any[]) ids.add(row.id);
  }

  return [...ids];
}

// ── Core check for a single config on a single date ───────────────────────────

async function checkConfigForDate(configId: number, cfg: any, date: string): Promise<void> {
  const csvUrl = toExportCsvUrl(cfg.sheet_url);
  let text: string;
  try {
    const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[SheetWatcher] HTTP ${resp.status} for config ${configId} — skipped`);
      return;
    }
    text = await resp.text();
    if (text.trim().startsWith("<!DOCTYPE")) {
      console.warn(`[SheetWatcher] config ${configId} 試算表未公開，跳過`);
      return;
    }
  } catch (e: any) {
    console.warn(`[SheetWatcher] fetch 失敗 config=${configId}: ${e.message}`);
    return;
  }

  const allRows = parseScheduleCsv(text);
  const dateRows = allRows.filter(r => r.trip_date === date);
  if (dateRows.length === 0) return;

  // Hash check — skip if content hasn't changed
  const currentHash = hashRoutes(dateRows.map(r => ({ route_no: r.route_no, driver_id: r.driver_id })));
  const cacheKey    = `${configId}:${date}`;
  if (lastSeenHash.get(cacheKey) === currentHash) return;
  lastSeenHash.set(cacheKey, currentHash);

  // Compute diff against DB
  const diff = await computeDiff(configId, dateRows, date);
  const changedRoutes = [
    ...diff.driver_changed,
    ...diff.new.filter(r => r.new_driver_id),
  ];

  if (changedRoutes.length === 0) return;

  console.log(
    `[SheetWatcher] ⚡ 偵測到 ${changedRoutes.length} 條路線異動（config=${configId} date=${date}）`,
  );

  const driverIds = await resolveDriverIds(changedRoutes, date);
  if (driverIds.length === 0) {
    console.log(`[SheetWatcher] 無法解析異動司機 ID，跳過推播`);
    return;
  }

  const reason = diff.driver_changed.length > 0
    ? `${diff.driver_changed.length} 條路線異動、${diff.new.length} 條新增路線`
    : `${diff.new.length} 條新增路線`;

  await pushScheduleChange(driverIds, date, reason);
  console.log(`[SheetWatcher] ✓ 已推播 ${driverIds.length} 位司機（${reason}）`);
}

// ── Run one full check cycle ───────────────────────────────────────────────────

async function runWatchCycle(): Promise<void> {
  const now = new Date();
  const todayTW    = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const tomorrowTW = new Date(now.getTime() + 86400000)
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

  try {
    const configs = await db.execute(sql`
      SELECT id, config_name, sheet_url
      FROM fusingao_auto_dispatch_configs
      WHERE is_active = TRUE AND sheet_url IS NOT NULL
    `);

    if (!(configs.rows as any[]).length) return;

    for (const cfg of configs.rows as any[]) {
      await checkConfigForDate(cfg.id, cfg, todayTW);
      await checkConfigForDate(cfg.id, cfg, tomorrowTW);
    }
  } catch (e: any) {
    console.error("[SheetWatcher] cycle error:", e.message);
  }
}

// ── Exported: manual trigger ───────────────────────────────────────────────────

export async function triggerSheetCheck(): Promise<{ checked: number }> {
  const configs = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM fusingao_auto_dispatch_configs WHERE is_active = TRUE
  `);
  const cnt = Number((configs.rows as any[])[0]?.cnt ?? 0);
  // Clear hash cache so next run re-checks everything
  lastSeenHash.clear();
  await runWatchCycle();
  return { checked: cnt };
}

// ── Start the watcher ──────────────────────────────────────────────────────────

export function startSheetChangeWatcher(): void {
  // Initial check after 2 minutes (avoid hammering on startup)
  setTimeout(async () => {
    await runWatchCycle();
    setInterval(runWatchCycle, WATCH_INTERVAL_MS);
  }, 2 * 60 * 1000);

  console.log(`[SheetWatcher] 班表變動監控啟動（每 30 分鐘檢查今日 + 明日）`);
}
