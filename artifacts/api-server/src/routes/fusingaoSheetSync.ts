/**
 * 福興高 × 富詠 Google Sheets 帳務自動同步
 *
 * 支援設定 Google Sheets URL，每小時自動拉取並 UPSERT 進 PostgreSQL。
 * 資料格式（CSV 欄位順序）：
 *   月份, 類型, 車隊名稱, 倉別, 區域, 路線號碼, 車型, 司機工號, 出車日期, 金額
 *
 * 可設定多個 Sheet config（不同類型：billing_trips / schedule）。
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const fusingaoSheetSyncRouter = Router();

// ── Table Setup ───────────────────────────────────────────────────────────────
export async function ensureFusingaoSheetSyncTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_sheet_configs (
      id               SERIAL PRIMARY KEY,
      sync_name        TEXT NOT NULL,
      sync_type        TEXT NOT NULL DEFAULT 'billing_trips',
      sheet_url        TEXT NOT NULL,
      interval_hours   INTEGER NOT NULL DEFAULT 1,
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      last_sync_at     TIMESTAMP,
      last_sync_status TEXT,
      last_sync_count  INTEGER,
      last_sync_error   TEXT,
      last_sync_skipped INTEGER,
      last_sync_errors  INTEGER,
      created_at        TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE fusingao_sheet_configs ADD COLUMN IF NOT EXISTS last_sync_skipped INTEGER`);
  await db.execute(sql`ALTER TABLE fusingao_sheet_configs ADD COLUMN IF NOT EXISTS last_sync_errors INTEGER`);

  // Add UNIQUE constraint to billing_trips to support UPSERT (idempotent imports)
  await db.execute(sql`
    ALTER TABLE fusingao_billing_trips
      ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'excel'
  `);
  await db.execute(sql`
    ALTER TABLE fusingao_billing_trips
      ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP DEFAULT NOW()
  `);

  // Normalise driver_id: store empty string instead of NULL for upsert uniqueness
  await db.execute(sql`
    UPDATE fusingao_billing_trips SET driver_id = '' WHERE driver_id IS NULL
  `);
  // Create unique index — driver_id must be '' not NULL for this to work
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_trips
      ON fusingao_billing_trips(billing_month, billing_type, route_no, driver_id, trip_date)
  `);

  // Add last_updated_at to schedules
  await db.execute(sql`
    ALTER TABLE shopee_route_schedules
      ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP DEFAULT NOW()
  `);
  await db.execute(sql`
    ALTER TABLE shopee_route_schedules
      ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'excel'
  `);
}

// ── Google Sheets CSV fetcher ──────────────────────────────────────────────────
function toExportCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const id = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ── CSV parser for billing trips ───────────────────────────────────────────────
// Expected columns: 月份,類型,車隊名稱,倉別,區域,路線號碼,車型,司機工號,出車日期,金額
interface CsvTripRow {
  billing_month: string; billing_type: string; fleet_name: string;
  warehouse: string; area: string; route_no: string; vehicle_size: string;
  driver_id: string; trip_date: string; amount: number;
}

function parseBillingCsv(text: string): CsvTripRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const colIdx = (names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const monthCol   = colIdx(["月份", "month", "billing_month"]);
  const typeCol    = colIdx(["類型", "type", "billing_type"]);
  const fleetCol   = colIdx(["車隊", "fleet"]);
  const warehCol   = colIdx(["倉別", "warehouse"]);
  const areaCol    = colIdx(["區域", "area"]);
  const routeCol   = colIdx(["路線號碼", "route"]);
  const vehicleCol = colIdx(["車型", "vehicle"]);
  const driverCol  = colIdx(["司機", "driver"]);
  const dateCol    = colIdx(["日期", "date", "trip_date"]);
  const amtCol     = colIdx(["金額", "amount"]);

  const rows: CsvTripRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const routeNo = routeCol >= 0 ? cols[routeCol] : "";
    const dateStr = dateCol >= 0 ? cols[dateCol] : "";
    const amtStr  = amtCol >= 0 ? cols[amtCol] : "";
    if (!routeNo || !dateStr) continue;
    const amount = parseFloat(amtStr.replace(/[^0-9.-]/g, ""));
    if (isNaN(amount) || amount <= 0) continue;

    rows.push({
      billing_month: monthCol >= 0 ? cols[monthCol] : dateStr.substring(0, 7),
      billing_type:  typeCol >= 0 ? cols[typeCol] : "NDD",
      fleet_name:    fleetCol >= 0 ? cols[fleetCol] : "",
      warehouse:     warehCol >= 0 ? cols[warehCol] : "",
      area:          areaCol >= 0 ? cols[areaCol] : "",
      route_no:      routeNo,
      vehicle_size:  vehicleCol >= 0 ? cols[vehicleCol] : "",
      driver_id:     driverCol >= 0 ? cols[driverCol] : "",
      trip_date:     dateStr,
      amount,
    });
  }
  return rows;
}

// ── Core sync function ────────────────────────────────────────────────────────
export async function runFusingaoSheetSync(configId: number): Promise<{
  upserted: number; skipped: number; errors: number;
}> {
  const configs = await db.execute(sql`SELECT * FROM fusingao_sheet_configs WHERE id = ${configId}`);
  const cfg = (configs.rows as any[])[0];
  if (!cfg) throw new Error(`Config ${configId} not found`);

  const csvUrl = toExportCsvUrl(cfg.sheet_url);
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} when fetching sheet`);
  const text = await resp.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("無法讀取試算表，請確認已設為「知道連結的人可查看」");
  }

  const rows = parseBillingCsv(text);
  let upserted = 0; let skipped = 0; let errors = 0;

  // Parallel upserts — all rows sent concurrently instead of sequentially
  const settled = await Promise.allSettled(rows.map(async (r) => {
    const driverId = r.driver_id || ''; // store '' not NULL for unique index
    const result = await db.execute(sql`
      INSERT INTO fusingao_billing_trips
        (billing_month, billing_type, fleet_name, warehouse, area, route_no, vehicle_size,
         driver_id, trip_date, amount, import_source, last_updated_at)
      VALUES (
        ${r.billing_month}, ${r.billing_type}, ${r.fleet_name||null}, ${r.warehouse||null},
        ${r.area||null}, ${r.route_no}, ${r.vehicle_size||null}, ${driverId},
        ${r.trip_date}, ${r.amount}, 'sheet', NOW()
      )
      ON CONFLICT (billing_month, billing_type, route_no, driver_id, trip_date)
      DO UPDATE SET
        amount = EXCLUDED.amount,
        fleet_name = EXCLUDED.fleet_name,
        vehicle_size = EXCLUDED.vehicle_size,
        import_source = 'sheet',
        last_updated_at = NOW()
      RETURNING id
    `);
    return (result.rows as any[]).length > 0 ? 'upserted' : 'skipped';
  }));

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value === 'upserted') upserted++; else skipped++;
    } else {
      console.warn("[FusingaoSheetSync] row error:", s.reason?.message);
      errors++;
    }
  }

  // Update sync status — 'warning' when some rows errored, 'success' when clean
  const syncStatus = errors > 0 ? 'warning' : 'success';
  const syncError = errors > 0
    ? `同步完成但有 ${errors} 筆資料格式錯誤（新增 ${upserted} 筆，略過重複 ${skipped} 筆）`
    : null;
  await db.execute(sql`
    UPDATE fusingao_sheet_configs SET
      last_sync_at = NOW(),
      last_sync_status = ${syncStatus},
      last_sync_count = ${upserted},
      last_sync_skipped = ${skipped},
      last_sync_errors = ${errors},
      last_sync_error = ${syncError}
    WHERE id = ${configId}
  `);

  return { upserted, skipped, errors };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startFusingaoSheetSyncScheduler() {
  if (syncTimer) return;
  syncTimer = setInterval(async () => {
    try {
      const now = new Date();
      const configs = await db.execute(sql`
        SELECT * FROM fusingao_sheet_configs
        WHERE is_active = TRUE
          AND (last_sync_at IS NULL
               OR last_sync_at < NOW() - MAKE_INTERVAL(hours => interval_hours))
      `);
      for (const cfg of configs.rows as any[]) {
        try {
          const result = await runFusingaoSheetSync(cfg.id);
          console.log(`[FusingaoSheetSync] ${cfg.sync_name}: upserted ${result.upserted}`);
        } catch (e: any) {
          console.error(`[FusingaoSheetSync] ${cfg.sync_name} failed:`, e.message);
          await db.execute(sql`
            UPDATE fusingao_sheet_configs
            SET last_sync_at = NOW(), last_sync_status = 'error', last_sync_error = ${e.message}
            WHERE id = ${cfg.id}
          `);
        }
      }
    } catch (e: any) {
      console.error("[FusingaoSheetSync] scheduler error:", e.message);
    }
  }, 60 * 1000); // Check every minute (run based on interval_hours)
  console.log("[FusingaoSheetSync] scheduler started, checking every 60s");
}

// ── API: GET /fusingao/sheet-sync/configs ─────────────────────────────────────
fusingaoSheetSyncRouter.get("/sheet-sync/configs", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM fusingao_sheet_configs ORDER BY created_at DESC`);
    res.json({ ok: true, configs: rows.rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── API: POST /fusingao/sheet-sync/configs ────────────────────────────────────
fusingaoSheetSyncRouter.post("/sheet-sync/configs", async (req, res) => {
  try {
    const { sync_name, sync_type = "billing_trips", sheet_url, interval_hours = 1 } = req.body;
    if (!sync_name || !sheet_url) return res.status(400).json({ ok: false, error: "sync_name 和 sheet_url 為必填" });
    const row = await db.execute(sql`
      INSERT INTO fusingao_sheet_configs (sync_name, sync_type, sheet_url, interval_hours)
      VALUES (${sync_name}, ${sync_type}, ${sheet_url}, ${Number(interval_hours)})
      RETURNING *
    `);
    res.json({ ok: true, config: (row.rows as any[])[0] });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── API: PATCH /fusingao/sheet-sync/configs/:id ───────────────────────────────
fusingaoSheetSyncRouter.patch("/sheet-sync/configs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { sync_name, sheet_url, interval_hours, is_active } = req.body;
    await db.execute(sql`
      UPDATE fusingao_sheet_configs SET
        sync_name = COALESCE(${sync_name ?? null}, sync_name),
        sheet_url = COALESCE(${sheet_url ?? null}, sheet_url),
        interval_hours = COALESCE(${interval_hours != null ? Number(interval_hours) : null}, interval_hours),
        is_active = COALESCE(${is_active != null ? Boolean(is_active) : null}, is_active)
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── API: DELETE /fusingao/sheet-sync/configs/:id ──────────────────────────────
fusingaoSheetSyncRouter.delete("/sheet-sync/configs/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM fusingao_sheet_configs WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── API: POST /fusingao/sheet-sync/configs/:id/run ───────────────────────────
fusingaoSheetSyncRouter.post("/sheet-sync/configs/:id/run", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await runFusingaoSheetSync(id);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    await db.execute(sql`
      UPDATE fusingao_sheet_configs
      SET last_sync_at = NOW(), last_sync_status = 'error', last_sync_error = ${err.message}
      WHERE id = ${Number(req.params.id)}
    `).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API: GET /fusingao/db-status ─────────────────────────────────────────────
fusingaoSheetSyncRouter.get("/db-status", async (_req, res) => {
  try {
    const checks = await Promise.all([
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(imported_at) AS latest FROM shopee_settlements`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM shopee_settlement_rows`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM fusingao_billing_trips`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM fusingao_billing_penalties`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM shopee_route_schedules`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM shopee_route_stops`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM fusingao_fleets`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM shopee_rate_cards`)),
      db.execute(sql.raw(`SELECT CAST(COUNT(*) AS INTEGER) AS cnt, MAX(created_at) AS latest FROM shopee_penalties`)),
    ]);

    const labels = [
      "蝦皮帳務批次（shopee_settlements）",
      "蝦皮帳務明細（shopee_settlement_rows）",
      "富詠帳務趟次（fusingao_billing_trips）",
      "富詠罰款紀錄（fusingao_billing_penalties）",
      "班表路線（shopee_route_schedules）",
      "班表站點（shopee_route_stops）",
      "合作車隊帳號（fusingao_fleets）",
      "Shopee費率表（shopee_rate_cards）",
      "Shopee罰款（shopee_penalties）",
    ];

    const tables = checks.map((r, i) => {
      const row = (r.rows as any[])[0];
      return { name: labels[i], count: Number(row.cnt), latest: row.latest };
    });

    const totalRows = tables.reduce((s, t) => s + t.count, 0);
    res.json({
      ok: true,
      db_type: "PostgreSQL (Replit Database - 永久儲存)",
      db_connected: true,
      total_records: totalRows,
      tables,
      checked_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, db_connected: false, error: err.message });
  }
});
