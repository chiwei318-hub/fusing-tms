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
// Flexible: auto-detects delimiter, scans first 10 rows for header, handles quoted fields.
// Expected columns (any order): 月份,類型,車隊名稱,倉別,區域,路線號碼,車型,司機工號,出車日期,金額
interface CsvTripRow {
  billing_month: string; billing_type: string; fleet_name: string;
  warehouse: string; area: string; route_no: string; vehicle_size: string;
  driver_id: string; trip_date: string; amount: number;
}

function parseBillingCsv(text: string): { rows: CsvTripRow[]; headerFound: boolean; warning: string | null } {
  // Strip BOM
  const cleaned = text.replace(/^\uFEFF/, "");
  const rawLines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (rawLines.length < 2) return { rows: [], headerFound: false, warning: "試算表內容為空" };

  // Auto-detect delimiter from first non-empty line
  const firstLine = rawLines[0] ?? "";
  const delimiter = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";

  function splitRow(line: string): string[] {
    if (delimiter === "\t") return line.split("\t").map(c => c.trim().replace(/^"|"$/g, ""));
    const result: string[] = [];
    let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  }

  const ALIASES: Record<string, string[]> = {
    billing_month:  ["月份", "帳款月份", "帳務月份", "結帳月份", "期別", "month", "billing_month"],
    billing_type:   ["類型", "服務類型", "配送類型", "業務類型", "type", "billing_type"],
    fleet_name:     ["車隊名稱", "車隊", "配送商", "承攬商", "fleet"],
    warehouse:      ["倉別", "倉庫", "發貨倉", "warehouse"],
    area:           ["區域", "配送區域", "服務區域", "area"],
    route_no:       ["路線號碼", "路線編號", "路線", "線號", "route"],
    vehicle_size:   ["車型", "車輛類型", "車種", "vehicle"],
    driver_id:      ["司機工號", "司機ID", "司機id", "工號", "司機編號", "員工編號", "driver"],
    trip_date:      ["出車日期", "日期", "配送日期", "出勤日期", "趟次日期", "date", "trip_date"],
    amount:         ["金額", "費用", "費率金額", "趟次金額", "應付金額", "實付金額", "amount"],
  };

  // Validation: a real billing header must have at least "金額" + ("日期" or "路線")
  const AMOUNT_KW = ["金額", "費用", "應付", "實付", "amount"];
  const DATE_KW   = ["日期", "月份", "date", "trip_date", "出車", "month"];
  const ROUTE_KW  = ["路線", "線號", "route"];

  function isHeaderRow(cols: string[]): boolean {
    const joined = cols.join(",").replace(/\s/g, "");
    const hasAmt   = AMOUNT_KW.some(k => joined.includes(k));
    const hasDate  = DATE_KW.some(k => joined.includes(k));
    const hasRoute = ROUTE_KW.some(k => joined.includes(k));
    return hasAmt && (hasDate || hasRoute);
  }

  function findColIdx(headers: string[], aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.replace(/\s/g, "").includes(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // Scan first 10 rows for header
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
    const cols = splitRow(rawLines[i]);
    if (isHeaderRow(cols)) {
      headerRowIdx = i;
      for (const [field, aliases] of Object.entries(ALIASES)) {
        colMap[field] = findColIdx(cols, aliases);
      }
      break;
    }
  }

  if (headerRowIdx < 0) {
    return { rows: [], headerFound: false, warning: "找不到帳務標題列（需包含「金額」及「日期」或「路線號碼」欄位）" };
  }

  const rows: CsvTripRow[] = [];
  for (let i = headerRowIdx + 1; i < rawLines.length; i++) {
    const cols = splitRow(rawLines[i]);
    const firstCell = cols[0]?.trim() ?? "";
    // Skip summary rows
    if (["合計", "小計", "總計", "Total", "SUM"].includes(firstCell)) continue;

    const get = (field: string): string => {
      const idx = colMap[field];
      if (idx === undefined || idx < 0 || idx >= cols.length) return "";
      return cols[idx]?.trim() ?? "";
    };

    const routeNo = get("route_no");
    const dateStr = get("trip_date");
    const amtStr  = get("amount").replace(/[,，]/g, "");
    // Need at minimum a date and an amount
    if (!dateStr && !routeNo) continue;
    const amount = parseFloat(amtStr.replace(/[^0-9.-]/g, ""));
    if (isNaN(amount) || amount <= 0) continue;

    // Derive billing_month from date if not present
    let billing_month = get("billing_month");
    if (!billing_month && dateStr) {
      const m = dateStr.match(/^(\d{4})[\/\-](\d{1,2})/) || dateStr.match(/^(\d{3,4})年(\d{1,2})月/);
      if (m) billing_month = `${m[1]}-${m[2].padStart(2, "0")}`;
      else billing_month = dateStr.slice(0, 7);
    }

    rows.push({
      billing_month,
      billing_type:  get("billing_type") || "NDD",
      fleet_name:    get("fleet_name"),
      warehouse:     get("warehouse"),
      area:          get("area"),
      route_no:      routeNo,
      vehicle_size:  get("vehicle_size"),
      driver_id:     get("driver_id"),
      trip_date:     dateStr || billing_month,
      amount,
    });
  }

  return { rows, headerFound: true, warning: null };
}

// ── Core sync function ────────────────────────────────────────────────────────
export async function runFusingaoSheetSync(configId: number): Promise<{
  inserted: number; updated: number; skipped: number; errors: number; warning: string | null;
}> {
  const configs = await db.execute(sql`SELECT * FROM fusingao_sheet_configs WHERE id = ${configId}`);
  const cfg = (configs.rows as any[])[0];
  if (!cfg) throw new Error(`Config ${configId} not found`);

  const csvUrl = toExportCsvUrl(cfg.sheet_url);
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — 無法取得試算表，請確認 URL 正確且試算表已公開分享`);
  const text = await resp.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("試算表尚未公開 — 請在 Google Sheets 共用設定中選擇「知道連結的人可查看」");
  }

  const { rows, headerFound, warning } = parseBillingCsv(text);

  if (!headerFound) {
    const errMsg = warning ?? "找不到帳務標題列";
    await db.execute(sql`
      UPDATE fusingao_sheet_configs SET
        last_sync_at = NOW(), last_sync_status = 'warning',
        last_sync_count = 0, last_sync_skipped = 0,
        last_sync_errors = 0, last_sync_error = ${errMsg}
      WHERE id = ${configId}
    `);
    return { inserted: 0, updated: 0, skipped: 0, errors: 0, warning: errMsg };
  }

  let inserted = 0; let updated = 0; let skipped = 0; let errors = 0;

  // Parallel upserts using xmax trick to detect INSERT vs UPDATE
  const settled = await Promise.allSettled(rows.map(async (r) => {
    const driverId = r.driver_id || ''; // '' not NULL for unique index
    const result = await db.execute(sql`
      INSERT INTO fusingao_billing_trips
        (billing_month, billing_type, fleet_name, warehouse, area, route_no, vehicle_size,
         driver_id, trip_date, amount, import_source, last_updated_at)
      VALUES (
        ${r.billing_month}, ${r.billing_type}, ${r.fleet_name||null}, ${r.warehouse||null},
        ${r.area||null}, ${r.route_no||''}, ${r.vehicle_size||null}, ${driverId},
        ${r.trip_date}, ${r.amount}, 'sheet', NOW()
      )
      ON CONFLICT (billing_month, billing_type, route_no, driver_id, trip_date)
      DO UPDATE SET
        amount = EXCLUDED.amount,
        fleet_name = COALESCE(EXCLUDED.fleet_name, fusingao_billing_trips.fleet_name),
        vehicle_size = COALESCE(EXCLUDED.vehicle_size, fusingao_billing_trips.vehicle_size),
        warehouse = COALESCE(EXCLUDED.warehouse, fusingao_billing_trips.warehouse),
        area = COALESCE(EXCLUDED.area, fusingao_billing_trips.area),
        import_source = 'sheet',
        last_updated_at = NOW()
      RETURNING id, (xmax = 0) AS was_inserted
    `);
    const row = (result.rows as any[])[0];
    if (!row) return 'skipped';
    return row.was_inserted ? 'inserted' : 'updated';
  }));

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value === 'inserted') inserted++;
      else if (s.value === 'updated') updated++;
      else skipped++;
    } else {
      console.warn("[FusingaoSheetSync] row error:", s.reason?.message);
      errors++;
    }
  }

  // Update sync status
  const syncStatus = errors > 0 ? 'warning' : 'success';
  const syncError = errors > 0
    ? `同步完成但有 ${errors} 筆格式錯誤（新增 ${inserted} 筆，更新 ${updated} 筆）`
    : null;
  await db.execute(sql`
    UPDATE fusingao_sheet_configs SET
      last_sync_at = NOW(),
      last_sync_status = ${syncStatus},
      last_sync_count = ${inserted},
      last_sync_skipped = ${updated},
      last_sync_errors = ${errors},
      last_sync_error = ${syncError}
    WHERE id = ${configId}
  `);

  return { inserted, updated, skipped, errors, warning: null };
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
          console.log(`[FusingaoSheetSync] ${cfg.sync_name}: inserted=${result.inserted} updated=${result.updated} errors=${result.errors}`);
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
