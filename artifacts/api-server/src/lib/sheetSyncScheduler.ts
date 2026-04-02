/**
 * sheetSyncScheduler.ts
 * 每分鐘檢查哪些 sheet_sync_configs 到了同步時間，自動拉取並匯入路線。
 */

import { pool } from "@workspace/db";
import { parseRoutesCsv, type ParsedRoute } from "../routes/routeImport";
import { applyAutoRoutingToOrder } from "../routes/autoRouting";

// ── Helper: normalise Google Sheets URL → CSV export URL ──────────────────
function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── Core sync logic (shared between scheduler and manual /run) ─────────────
export async function runSheetSync(
  cfg: {
    id: number;
    name: string;
    customer_name: string;
    pickup_address: string;
    cargo_description: string;
  },
  csvUrl: string
): Promise<{
  inserted: number;
  duplicates: number;
  errors: number;
  warnings: number;
  detail: object;
}> {
  // 1. Fetch CSV
  const fetchRes = await fetch(csvUrl);
  if (!fetchRes.ok) {
    throw new Error(`無法取得試算表 (HTTP ${fetchRes.status})`);
  }
  const text = await fetchRes.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("無法取得 CSV，請確認試算表已設為「知道連結的人可查看」");
  }

  // 2. Parse routes
  const { routes, warnings } = parseRoutesCsv(text);

  const insertedList: { orderId: number; routeId: string }[] = [];
  const duplicateList: { routeId: string; existingOrderId: number }[] = [];
  const errorList: { routeId: string; error: string }[] = [];

  // 3. Upsert each route
  for (const route of routes) {
    try {
      if (route.stops.length === 0) continue;

      // Duplicate check (no date constraint — routes are identified by route ID globally)
      const dup = await pool.query(
        `SELECT id FROM orders
         WHERE source = 'route_import'
           AND notes LIKE $1
         LIMIT 1`,
        [`路線：${route.routeId}｜%`]
      );
      if (dup.rows.length > 0) {
        duplicateList.push({ routeId: route.routeId, existingOrderId: dup.rows[0].id });
        continue;
      }

      const firstStop = route.stops[0];
      const extraStops = route.stops.slice(1);
      const extraDeliveryJson = extraStops.length > 0
        ? JSON.stringify(extraStops.map(s => ({
            address: s.address,
            contactPerson: s.storeName,
            note: s.isDailyStore ? "日配門市" : "",
          })))
        : null;

      const routing = await applyAutoRoutingToOrder({
        pickup_address: cfg.pickup_address,
        delivery_address: firstStop.address,
        required_vehicle_type: route.vehicleType || null,
        cargo_description: cfg.cargo_description,
        region: null,
        postal_code: null,
      });

      const pickupTime = route.timeSlot?.match(/^(\d{2}:\d{2})/)?.[1] ?? null;

      const { rows: result } = await pool.query(
        `INSERT INTO orders (
          customer_name, customer_phone,
          pickup_address, delivery_address,
          extra_delivery_addresses,
          cargo_description,
          required_vehicle_type,
          pickup_time,
          notes,
          status, source,
          zone_id, team_id,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','route_import',$10,$11,NOW(),NOW()
        ) RETURNING id`,
        [
          cfg.customer_name,
          "0800000000",
          cfg.pickup_address,
          firstStop.address,
          extraDeliveryJson,
          cfg.cargo_description,
          route.vehicleType || null,
          pickupTime,
          `路線：${route.routeId}｜碼頭：${route.dockNo || "—"}｜司機ID：${route.driverId || "—"}｜共 ${route.stops.length} 站（${route.stops.map(s => s.storeName).join("→")}）`,
          routing.zone_id ?? null,
          routing.team_id ?? null,
        ]
      );
      insertedList.push({ orderId: result[0].id, routeId: route.routeId });
    } catch (e: unknown) {
      errorList.push({ routeId: route.routeId, error: String(e).slice(0, 200) });
    }
  }

  const summary = {
    inserted: insertedList.length,
    duplicates: duplicateList.length,
    errors: errorList.length,
    warnings: warnings.length,
    detail: { insertedList, duplicateList, errorList, warnings },
  };

  // 4. Write log entry
  await pool.query(
    `INSERT INTO sheet_sync_logs (config_id, inserted, duplicates, errors, warnings, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [cfg.id, summary.inserted, summary.duplicates, summary.errors, summary.warnings, summary.detail]
  );

  // 5. Update last_sync_at + result on config
  await pool.query(
    `UPDATE sheet_sync_configs
     SET last_sync_at = NOW(),
         last_sync_result = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [cfg.id, { inserted: summary.inserted, duplicates: summary.duplicates, errors: summary.errors, warnings: summary.warnings }]
  );

  console.log(
    `[SheetSync] "${cfg.name}" synced — inserted:${summary.inserted} dup:${summary.duplicates} err:${summary.errors}`
  );

  return summary;
}

// ── Scheduler: runs every minute, checks which configs are due ─────────────
export function startSheetSyncScheduler() {
  const CHECK_INTERVAL_MS = 60 * 1000; // check every minute

  async function tick() {
    try {
      const { rows: configs } = await pool.query<{
        id: number;
        name: string;
        sheet_url: string;
        interval_minutes: number;
        customer_name: string;
        pickup_address: string;
        cargo_description: string;
        last_sync_at: Date | null;
      }>(
        `SELECT id, name, sheet_url, interval_minutes, customer_name, pickup_address,
                cargo_description, last_sync_at
         FROM sheet_sync_configs WHERE is_active = true`
      );

      for (const cfg of configs) {
        const now = Date.now();
        const lastSync = cfg.last_sync_at ? new Date(cfg.last_sync_at).getTime() : 0;
        const dueMs = cfg.interval_minutes * 60 * 1000;

        if (now - lastSync >= dueMs) {
          const csvUrl = toCsvUrl(cfg.sheet_url);
          runSheetSync(cfg, csvUrl).catch(err => {
            console.error(`[SheetSync] "${cfg.name}" failed:`, err.message);
            pool.query(
              `UPDATE sheet_sync_configs SET last_sync_at = NOW(),
               last_sync_result = $2, updated_at = NOW() WHERE id = $1`,
              [cfg.id, { error: String(err.message).slice(0, 300) }]
            ).catch(() => {});
          });
        }
      }
    } catch (err) {
      console.error("[SheetSync] scheduler tick failed:", err);
    }
  }

  // First check after 30s to avoid startup congestion
  setTimeout(tick, 30_000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[SheetSync] scheduler started, checking every 60s");
}
