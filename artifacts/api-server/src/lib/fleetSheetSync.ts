/**
 * fleetSheetSync.ts
 * 加盟車行 — 蝦皮班表 Google Sheets 自動同步
 *
 * 每個車行可設定一條或多條班表連結，系統按設定間隔自動拉取並 UPSERT 進 fleet_trips。
 * UPSERT key: (franchisee_id, trip_date, notes)  →  notes 包含路線編號，確保同日同路線不重複
 */

import { pool } from "@workspace/db";

// ── DB Schema ─────────────────────────────────────────────────────────────────
export async function ensureFleetSheetSyncTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_sheet_sync_configs (
      id                SERIAL PRIMARY KEY,
      franchisee_id     INTEGER NOT NULL,
      sync_name         TEXT    NOT NULL DEFAULT '蝦皮班表',
      sheet_url         TEXT    NOT NULL,
      interval_minutes  INTEGER NOT NULL DEFAULT 60,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      last_sync_at      TIMESTAMPTZ,
      last_sync_status  TEXT,
      last_sync_count   INTEGER,
      last_sync_error   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS fleet_sheet_sync_fid_idx
      ON fleet_sheet_sync_configs(franchisee_id)
  `);
  console.log("[FleetSheetSync] table ensured");
}

// ── URL Helper ────────────────────────────────────────────────────────────────
function toCsvUrl(raw: string): string {
  const m = raw.match(/\/spreadsheets\/d\/([^/]+)/);
  const gidM = raw.match(/[?&#]gid=(\d+)/);
  if (!m) return raw;
  const gid = gidM?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

// ── CSV line parser (handles quoted fields) ───────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// ── Parse schedule text → trip rows ──────────────────────────────────────────
// Expected column order (蝦皮北倉班表):
//   [0] date_time  [1] empty  [2] route_no  [3] vehicle_type  [4] driver_id
//   [5] time_slot  [6] dock_no  [7] stop_seq  [8] store_name  [9] store_address
export function parseScheduleText(
  text: string,
  driverById: Record<string, number>,
  driverByName: Record<string, number>
): Array<{
  trip_date: string; route_no: string; vehicle_type: string;
  driver_id: number | null; driver_raw: string; time_slot: string; dock_no: string;
  stops: Array<{ seq: string; name: string; address: string }>;
}> {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/)
    .filter(l => l.trim() && !l.includes("路線編號（預排）"));

  const routes: Array<{
    trip_date: string; route_no: string; vehicle_type: string;
    driver_id: number | null; driver_raw: string;
    time_slot: string; dock_no: string;
    stops: Array<{ seq: string; name: string; address: string }>;
  }> = [];

  let current: typeof routes[0] | null = null;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const routeNo   = cols[2] ?? "";
    const storeName = cols[8] ?? "";
    const storeAddr = cols[9] ?? "";
    const stopSeq   = cols[7] ?? "";

    if (routeNo) {
      // New route row
      const dateRaw = (cols[0] ?? "").split(" ")[0]?.replace(/\//g, "-") ?? "";
      const driverRaw = cols[4] ?? "";
      let driverId: number | null = null;
      if (driverRaw) {
        driverId = driverById[driverRaw] ?? driverByName[driverRaw] ?? null;
      }
      current = {
        trip_date:    dateRaw,
        route_no:     routeNo,
        vehicle_type: cols[3] ?? "",
        driver_id:    driverId,
        driver_raw:   driverRaw,
        time_slot:    cols[5] ?? "",
        dock_no:      cols[6] ?? "",
        stops: storeName ? [{ seq: stopSeq, name: storeName, address: storeAddr }] : [],
      };
      routes.push(current);
    } else if (current && (storeName || storeAddr)) {
      current.stops.push({ seq: stopSeq, name: storeName, address: storeAddr });
    }
  }

  return routes;
}

// ── Core sync runner ──────────────────────────────────────────────────────────
export async function runFleetSheetSync(configId: number): Promise<{
  upserted: number; skipped: number; errors: number; message: string;
}> {
  // Load config
  const { rows: cfgRows } = await pool.query(
    `SELECT * FROM fleet_sheet_sync_configs WHERE id = $1`, [configId]
  );
  const cfg = cfgRows[0];
  if (!cfg) throw new Error(`Config ${configId} not found`);

  const fid: number = cfg.franchisee_id;
  const csvUrl = toCsvUrl(cfg.sheet_url);

  // Fetch sheet
  const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`無法取得試算表 (HTTP ${resp.status})`);
  const text = await resp.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("試算表未設為公開，請設定為「知道連結的人可查看」");
  }

  // Load drivers for matching
  const { rows: driverRows } = await pool.query(
    `SELECT id, name FROM drivers WHERE franchisee_id = $1`, [fid]
  );
  const driverById: Record<string, number> = {};
  const driverByName: Record<string, number> = {};
  for (const d of driverRows) {
    driverById[String(d.id)] = d.id;
    driverByName[d.name.trim()] = d.id;
  }

  // Parse routes
  const routes = parseScheduleText(text, driverById, driverByName);

  let upserted = 0, skipped = 0, errors = 0;

  for (const r of routes) {
    try {
      if (!r.trip_date || !r.route_no) { skipped++; continue; }

      const stopCount = r.stops.length;
      const stopNames = r.stops.map(s => s.name).join("、").slice(0, 300);
      const notesVal  = `${r.route_no} ｜ ${r.vehicle_type} ｜ ${stopCount} 站`;
      const pickup    = r.dock_no ? `碼頭 ${r.dock_no}（${r.time_slot}）` : r.time_slot;
      const delivery  = stopCount > 0 ? `${stopCount} 站：${stopNames}` : "";

      // UPSERT: same franchisee + date + route_no (in notes prefix) → update
      await pool.query(`
        INSERT INTO fleet_trips
          (franchisee_id, driver_id, trip_date, customer_name,
           pickup_address, delivery_address, amount, driver_payout, status, notes)
        VALUES ($1,$2,$3,'蝦皮',$4,$5,0,NULL,'pending',$6)
        ON CONFLICT DO NOTHING
      `, [fid, r.driver_id, r.trip_date, pickup, delivery, notesVal]);

      // Check if it was a new insert or already existed
      const { rows: existing } = await pool.query(`
        SELECT id FROM fleet_trips
        WHERE franchisee_id=$1 AND trip_date=$2 AND notes=$3
        LIMIT 1
      `, [fid, r.trip_date, notesVal]);

      if (existing.length > 0) {
        // Update driver_id and addresses even if record already existed
        await pool.query(`
          UPDATE fleet_trips
          SET driver_id      = COALESCE($2, driver_id),
              pickup_address = $3,
              delivery_address = $4,
              updated_at     = NOW()
          WHERE id = $1
        `, [existing[0].id, r.driver_id, pickup, delivery]);
        upserted++;
      } else {
        upserted++;
      }
    } catch (e: any) {
      console.error(`[FleetSheetSync] route ${r.route_no} error:`, e.message);
      errors++;
    }
  }

  // Update config status
  await pool.query(`
    UPDATE fleet_sheet_sync_configs
    SET last_sync_at = NOW(),
        last_sync_status = 'ok',
        last_sync_count  = $2,
        last_sync_error  = NULL,
        updated_at       = NOW()
    WHERE id = $1
  `, [configId, upserted]);

  const message = `同步完成：共 ${routes.length} 條路線，寫入 ${upserted} 筆，跳過 ${skipped} 筆，錯誤 ${errors} 筆`;
  console.log(`[FleetSheetSync] config#${configId} — ${message}`);
  return { upserted, skipped, errors, message };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
export function startFleetSheetSyncScheduler() {
  const TICK_MS = 60 * 1000; // check every minute

  async function tick() {
    try {
      const { rows: configs } = await pool.query(`
        SELECT id, franchisee_id, sync_name, interval_minutes, last_sync_at
        FROM fleet_sheet_sync_configs
        WHERE is_active = TRUE
      `);

      const now = Date.now();
      for (const cfg of configs) {
        const lastMs  = cfg.last_sync_at ? new Date(cfg.last_sync_at).getTime() : 0;
        const dueMs   = cfg.interval_minutes * 60 * 1000;
        if (now - lastMs < dueMs) continue;

        runFleetSheetSync(cfg.id).catch(async (err: Error) => {
          console.error(`[FleetSheetSync] "${cfg.sync_name}" failed:`, err.message);
          await pool.query(`
            UPDATE fleet_sheet_sync_configs
            SET last_sync_at = NOW(), last_sync_status = 'error',
                last_sync_error = $2, updated_at = NOW()
            WHERE id = $1
          `, [cfg.id, err.message.slice(0, 300)]);
        });
      }
    } catch (err) {
      console.error("[FleetSheetSync] scheduler tick failed:", err);
    }
  }

  setTimeout(tick, 20_000); // first run after 20s
  setInterval(tick, TICK_MS);
  console.log("[FleetSheetSync] scheduler started, checking every 60s");
}
