/**
 * sheetSyncScheduler.ts
 * 每分鐘檢查哪些 sheet_sync_configs 到了同步時間，自動拉取並匯入路線或帳務趟次。
 *
 * sync_type = 'route'   → 解析路線格式（路線編號|門市名稱|門市地址），匯入 orders
 * sync_type = 'billing' → 解析帳務格式（月份|類型|車隊名稱|倉別|區域|路線號碼|車型|司機工號|出車日期|金額），匯入 fusingao_billing_trips
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

// ── Billing CSV parser ─────────────────────────────────────────────────────
interface BillingRow {
  billing_month: string;
  billing_type: string;
  fleet_name: string;
  warehouse: string;
  area: string;
  route_no: string;
  vehicle_size: string;
  driver_id: string;
  trip_date: string;
  amount: number;
  stops: number | null;
  trips: number | null;
  license_plate: string;
  notes: string;
  customer_name: string;
  pickup_address: string;
  delivery_address: string;
}

function parseBillingCsv(text: string): { rows: BillingRow[]; warnings: string[] } {
  // Strip BOM if present
  const cleaned = text.replace(/^\uFEFF/, "");
  const rawLines = cleaned.split(/\r?\n/).filter(l => l.trim());
  const rows: BillingRow[] = [];
  const warnings: string[] = [];

  // Auto-detect delimiter (tab vs comma) from first non-empty line
  const firstLine = rawLines[0] ?? "";
  const delimiter = (firstLine.split("\t").length > firstLine.split(",").length) ? "\t" : ",";

  function splitRow(line: string): string[] {
    if (delimiter === ",") {
      // Handle quoted CSV fields
      const result: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      result.push(cur.trim());
      return result;
    }
    return line.split("\t").map(c => c.trim().replace(/^"|"$/g, ""));
  }

  // Broad alias map — covers many real-world monthly billing sheet formats
  const BILLING_ALIASES: Record<string, string[]> = {
    billing_month:    ["月份", "帳款月份", "帳務月份", "結帳月份", "期別"],
    billing_type:     ["類型", "服務類型", "配送類型", "業務類型"],
    fleet_name:       ["車隊名稱", "車隊", "配送商", "承攬商"],
    warehouse:        ["倉別", "倉庫", "發貨倉"],
    area:             ["區域", "配送區域", "服務區域"],
    route_no:         ["路線號碼", "路線編號", "路線", "線號"],
    vehicle_size:     ["車型", "車輛類型", "車種"],
    driver_id:        ["司機工號", "司機ID", "司機id", "工號", "司機編號", "員工編號"],
    trip_date:        ["出車日期", "日期", "配送日期", "出勤日期", "趟次日期"],
    amount:           ["金額", "費用", "費率金額", "趟次金額", "應付金額", "實付金額"],
    stops:            ["站數", "門市數", "站點數", "配送站數", "趟次站數"],
    trips:            ["趟次", "趟數", "出車趟次", "配送趟次"],
    license_plate:    ["車牌", "車牌號碼", "車號"],
    notes:            ["備註", "說明", "附註", "特殊備註"],
    customer_name:    ["客戶名稱", "客戶", "客戶名", "公司名稱", "收件人", "寄件人"],
    pickup_address:   ["起點", "起始地", "取貨地址", "取貨地", "出發地", "發貨地址", "起始地址"],
    delivery_address: ["終點", "目的地", "送貨地址", "送貨地", "送達地", "目的地址", "到達地址"],
  };

  // Keywords that must appear in a header row (at least one from each group)
  const AMOUNT_KEYWORDS = ["金額", "費用", "應付", "實付"];
  const DATE_KEYWORDS   = ["日期", "月份", "趟次日期", "出車", "配送日", "結帳"];
  const ROUTE_KEYWORDS  = ["路線", "線號", "路線編號", "路線號碼"];

  function findColIdx(headers: string[], aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.replace(/\s/g, "").includes(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function isHeaderRow(cols: string[]): boolean {
    const joined = cols.join(",").replace(/\s/g, "");
    const hasAmount = AMOUNT_KEYWORDS.some(k => joined.includes(k));
    const hasDate   = DATE_KEYWORDS.some(k => joined.includes(k));
    const hasRoute  = ROUTE_KEYWORDS.some(k => joined.includes(k));
    // Need amount + (date or route) to count as a billing header
    return hasAmount && (hasDate || hasRoute);
  }

  let colMap: Record<string, number> = {};
  let headerFound = false;

  for (let i = 0; i < rawLines.length; i++) {
    const cols = splitRow(rawLines[i]);

    if (!headerFound) {
      if (isHeaderRow(cols)) {
        for (const [field, aliases] of Object.entries(BILLING_ALIASES)) {
          colMap[field] = findColIdx(cols, aliases);
        }
        headerFound = true;
      }
      continue;
    }

    if (cols.length < 2) continue;
    // Skip summary/total rows
    const firstCell = cols[0].trim();
    if (firstCell === "合計" || firstCell === "小計" || firstCell === "總計") continue;

    const get = (field: string): string => {
      const idx = colMap[field];
      if (idx === undefined || idx < 0 || idx >= cols.length) return "";
      return cols[idx]?.trim() ?? "";
    };

    const trip_date = get("trip_date");
    const route_no  = get("route_no");
    const rawAmount = get("amount").replace(/,/g, "");
    const amount    = parseFloat(rawAmount);

    // At minimum we need a date (or route) and an amount
    if (!trip_date && !route_no) continue;
    if (!rawAmount || isNaN(amount)) continue;

    // Derive billing_month from trip_date if no explicit month column
    let billing_month = get("billing_month");
    if (!billing_month && trip_date) {
      // Try to extract YYYY-MM from various date formats
      const m =
        trip_date.match(/^(\d{4})[\/\-](\d{1,2})/) ||
        trip_date.match(/^(\d{3,4})年(\d{1,2})月/);
      if (m) billing_month = `${m[1]}-${m[2].padStart(2, "0")}`;
      else billing_month = trip_date.slice(0, 7);
    }

    const stopsRaw = get("stops").replace(/,/g, "");
    const tripsRaw = get("trips").replace(/,/g, "");

    rows.push({
      billing_month,
      billing_type:     get("billing_type"),
      fleet_name:       get("fleet_name"),
      warehouse:        get("warehouse"),
      area:             get("area"),
      route_no,
      vehicle_size:     get("vehicle_size"),
      driver_id:        get("driver_id"),
      trip_date,
      amount,
      stops:            stopsRaw ? parseInt(stopsRaw, 10) || null : null,
      trips:            tripsRaw ? parseInt(tripsRaw, 10) || null : null,
      license_plate:    get("license_plate"),
      notes:            get("notes"),
      customer_name:    get("customer_name"),
      pickup_address:   get("pickup_address"),
      delivery_address: get("delivery_address"),
    });
  }

  if (!headerFound) {
    warnings.push(
      "找不到帳務表頭列，請確認試算表至少包含「金額（或費用）」以及「日期（或路線）」欄位"
    );
  }

  return { rows, warnings };
}

// ── Route sync handler ─────────────────────────────────────────────────────
async function syncRoutes(
  cfg: { id: number; name: string; customer_name: string; pickup_address: string; cargo_description: string },
  text: string
): Promise<{ inserted: number; duplicates: number; errors: number; warnings: number; detail: object }> {
  const { routes, warnings } = parseRoutesCsv(text);

  const insertedList: { orderId: number; routeId: string }[] = [];
  const duplicateList: { routeId: string; existingOrderId: number }[] = [];
  const errorList: { routeId: string; error: string }[] = [];

  for (const route of routes) {
    try {
      if (route.stops.length === 0) continue;

      const dup = await pool.query(
        `SELECT id FROM orders WHERE route_id = $1 AND created_at >= NOW() - INTERVAL '7 days' LIMIT 1`,
        [route.routeId]
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

      const routePrefix = route.routeId ? (route.routeId.match(/^([A-Z0-9]+)-/))?.[1] ?? null : null;
      const noteText = `路線：${route.routeId}｜碼頭：${route.dockNo || "—"}｜司機ID：${route.driverId || "—"}｜共 ${route.stops.length} 站（${route.stops.map(s => s.storeName).join("→")}）`;

      const { rows: result } = await pool.query(
        `INSERT INTO orders (
          customer_name, customer_phone,
          pickup_address, delivery_address,
          extra_delivery_addresses,
          cargo_description,
          required_vehicle_type,
          vehicle_type,
          pickup_time,
          notes,
          route_id,
          route_prefix,
          station_count,
          dispatch_dock,
          status, source,
          zone_id, team_id,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,'pending','route_import',$14,$15,NOW(),NOW()
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
          noteText,
          route.routeId,
          routePrefix,
          route.stops.length,
          route.dockNo || null,
          routing.zone_id ?? null,
          routing.team_id ?? null,
        ]
      );
      insertedList.push({ orderId: result[0].id, routeId: route.routeId });
    } catch (e: unknown) {
      errorList.push({ routeId: route.routeId, error: String(e).slice(0, 200) });
    }
  }

  return {
    inserted: insertedList.length,
    duplicates: duplicateList.length,
    errors: errorList.length,
    warnings: warnings.length,
    detail: { insertedList, duplicateList, errorList, warnings },
  };
}

// ── Billing sync handler ───────────────────────────────────────────────────
async function syncBilling(
  _cfg: { id: number; name: string },
  text: string
): Promise<{ inserted: number; duplicates: number; errors: number; warnings: number; detail: object }> {
  const { rows, warnings } = parseBillingCsv(text);

  // Ensure table exists with base columns
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fusingao_billing_trips (
      id             SERIAL PRIMARY KEY,
      billing_month  TEXT,
      billing_type   TEXT,
      fleet_name     TEXT,
      warehouse      TEXT,
      area           TEXT,
      route_no       TEXT,
      vehicle_size   TEXT,
      driver_id      TEXT,
      trip_date      TEXT,
      amount         NUMERIC,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  // Safely add new columns if they don't exist yet
  const newCols = [
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS stops            INTEGER",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS trips            INTEGER",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS license_plate    TEXT",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS notes            TEXT",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS customer_name    TEXT",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS pickup_address   TEXT",
    "ALTER TABLE fusingao_billing_trips ADD COLUMN IF NOT EXISTS delivery_address TEXT",
  ];
  for (const sql of newCols) {
    await pool.query(sql);
  }

  const insertedList: string[] = [];
  const duplicateList: string[] = [];
  const errorList: { row: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Duplicate check: same billing_month + trip_date + amount + customer_name (or route_no+driver_id)
      const dup = await pool.query(
        `SELECT id FROM fusingao_billing_trips
         WHERE billing_month = $1
           AND COALESCE(trip_date,'') = $2
           AND amount = $3
           AND COALESCE(customer_name, route_no, '') = $4
         LIMIT 1`,
        [
          row.billing_month,
          row.trip_date,
          row.amount,
          row.customer_name || row.route_no || "",
        ]
      );
      if (dup.rows.length > 0) {
        duplicateList.push(`${row.billing_month}/${row.trip_date}/${row.customer_name || row.route_no}`);
        continue;
      }

      await pool.query(
        `INSERT INTO fusingao_billing_trips
           (billing_month, billing_type, fleet_name, warehouse, area,
            route_no, vehicle_size, driver_id, trip_date, amount,
            stops, trips, license_plate, notes,
            customer_name, pickup_address, delivery_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          row.billing_month, row.billing_type, row.fleet_name, row.warehouse, row.area,
          row.route_no, row.vehicle_size, row.driver_id, row.trip_date, row.amount,
          row.stops, row.trips, row.license_plate, row.notes || null,
          row.customer_name || null, row.pickup_address || null, row.delivery_address || null,
        ]
      );
      insertedList.push(`${row.billing_month}/${row.trip_date}/${row.customer_name || row.route_no}`);
    } catch (e: unknown) {
      errorList.push({ row: `${row.route_no || row.customer_name}/${row.trip_date}`, error: String(e).slice(0, 200) });
    }
  }

  return {
    inserted: insertedList.length,
    duplicates: duplicateList.length,
    errors: errorList.length,
    warnings: warnings.length,
    detail: { insertedList, duplicateList, errorList, warnings },
  };
}

// ── Schedule (班表欄位) sync handler ────────────────────────────────────────
// Parses Shopee 北倉班表 format and upserts into shopee_route_schedules
// Column layout (positional): [0] date_time [1] empty [2] route_no [3] vehicle_type
//   [4] driver_id [5] time_slot [6] dock_no [7] stop_seq [8] store_name [9] store_address
// Also supports header-based format with columns: 日期時間/路線編號/車型/司機工號/時間/碼頭
async function syncSchedule(
  _cfg: { id: number; name: string },
  text: string
): Promise<{ inserted: number; duplicates: number; errors: number; warnings: number; detail: object }> {
  const cleaned = text.replace(/^\uFEFF/, "");
  const allLines = cleaned.split(/\r?\n/).filter(l => l.trim());
  const warnings: string[] = [];
  const insertedList: string[] = [];
  const duplicateList: string[] = [];
  const errorList: { line: string; error: string }[] = [];

  function splitLine(line: string): string[] {
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

  // Detect header or use positional columns
  const HEADER_KEYWORDS = ["路線編號", "route_no", "routeno", "日期", "date"];
  let headerColMap: Record<string, number> | null = null;
  let dataStartIdx = 0;

  const firstCols = splitLine(allLines[0] ?? "");
  const firstJoined = firstCols.join(",").toLowerCase();
  if (HEADER_KEYWORDS.some(k => firstJoined.includes(k.toLowerCase()))) {
    // Header-based
    headerColMap = {};
    for (let i = 0; i < firstCols.length; i++) {
      const h = firstCols[i].toLowerCase().replace(/\s/g, "");
      if (h.includes("日期") || h.includes("date")) headerColMap["date"] = i;
      if (h.includes("路線") || h.includes("route")) headerColMap["route_no"] = i;
      if (h.includes("車型") || h.includes("vehicle")) headerColMap["vehicle_type"] = i;
      if (h.includes("司機") || h.includes("driver")) headerColMap["driver_id"] = i;
      if (h.includes("時間") || h.includes("time")) headerColMap["time_slot"] = i;
      if (h.includes("碼頭") || h.includes("dock")) headerColMap["dock_no"] = i;
      if (h.includes("倉") || h.includes("warehouse")) headerColMap["warehouse"] = i;
    }
    dataStartIdx = 1;
  }

  // Ensure shopee_route_schedules table has import_source
  await pool.query(`ALTER TABLE shopee_route_schedules ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'excel'`);
  await pool.query(`ALTER TABLE shopee_route_schedules ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP DEFAULT NOW()`);

  // Parse rows
  let currentRouteDate = "";
  let currentRouteNo = "";

  for (let i = dataStartIdx; i < allLines.length; i++) {
    const line = allLines[i];
    // Skip header-like rows
    if (line.includes("路線編號（預排）") || line.includes("路線編號,")) continue;

    const cols = splitLine(line);
    if (cols.length < 2) continue;

    let routeDate = "";
    let routeNo = "";
    let vehicleType = "";
    let driverRaw = "";
    let timeSlot = "";
    let dockNo = "";
    let warehouse = "";

    if (headerColMap) {
      routeDate = cols[headerColMap["date"] ?? -1] ?? "";
      routeNo = cols[headerColMap["route_no"] ?? -1] ?? "";
      vehicleType = cols[headerColMap["vehicle_type"] ?? -1] ?? "";
      driverRaw = cols[headerColMap["driver_id"] ?? -1] ?? "";
      timeSlot = cols[headerColMap["time_slot"] ?? -1] ?? "";
      dockNo = cols[headerColMap["dock_no"] ?? -1] ?? "";
      warehouse = cols[headerColMap["warehouse"] ?? -1] ?? "";
    } else {
      // Positional: [0] date_time [2] route_no [3] vehicle_type [4] driver_id [5] time_slot [6] dock_no
      routeDate = (cols[0] ?? "").split(" ")[0]?.replace(/\//g, "-") ?? "";
      routeNo = cols[2] ?? "";
      vehicleType = cols[3] ?? "";
      driverRaw = cols[4] ?? "";
      timeSlot = cols[5] ?? "";
      dockNo = cols[6] ?? "";
    }

    // Track current route info (rows without routeNo are store stops of previous route)
    if (routeNo) { currentRouteDate = routeDate; currentRouteNo = routeNo; }
    if (!currentRouteNo) continue;

    // Only upsert route-level rows (skip pure stop rows)
    if (!routeNo) continue;

    // Normalise date
    const dateStr = currentRouteDate
      .replace(/[年\/]/g, "-").replace(/[月日]/g, "").trim();
    const dateMatch = dateStr.match(/^(\d{4}-\d{1,2}-\d{1,2})/);
    if (!dateMatch) continue;
    const routeDateNorm = dateMatch[1];
    const importMonth = routeDateNorm.slice(0, 7);

    try {
      const dup = await pool.query(
        `SELECT id FROM shopee_route_schedules WHERE route_date = $1 AND route_id = $2 LIMIT 1`,
        [routeDateNorm, routeNo]
      );
      if (dup.rows.length > 0) {
        await pool.query(
          `UPDATE shopee_route_schedules SET vehicle_type=$1, driver_id=$2, departure_time=$3,
           dock_number=$4, warehouse=$5, import_source='sheet_sync', last_updated_at=NOW()
           WHERE route_date=$6 AND route_id=$7`,
          [vehicleType || null, driverRaw || null, timeSlot || null,
           dockNo || null, warehouse || null, routeDateNorm, routeNo]
        );
        duplicateList.push(`${routeDateNorm}/${routeNo}`);
      } else {
        await pool.query(
          `INSERT INTO shopee_route_schedules
             (route_date, route_id, vehicle_type, driver_id, departure_time,
              dock_number, warehouse, import_month, import_source, last_updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sheet_sync',NOW())`,
          [routeDateNorm, routeNo, vehicleType || null, driverRaw || null,
           timeSlot || null, dockNo || null, warehouse || null, importMonth]
        );
        insertedList.push(`${routeDateNorm}/${routeNo}`);
      }
    } catch (e: unknown) {
      errorList.push({ line: `L${i + 1}:${routeNo}`, error: String(e).slice(0, 150) });
    }
  }

  if (insertedList.length === 0 && duplicateList.length === 0 && errorList.length === 0) {
    warnings.push("試算表中找不到可解析的班表資料，請確認格式：第1欄為「日期時間」、第3欄為「路線編號」，或試算表有欄位標題列");
  }

  return {
    inserted: insertedList.length,
    duplicates: duplicateList.length,
    errors: errorList.length,
    warnings: warnings.length,
    detail: { insertedList, duplicateList, errorList, warnings },
  };
}

// ── Core sync logic (shared between scheduler and manual /run) ─────────────
export async function runSheetSync(
  cfg: {
    id: number;
    name: string;
    sync_type?: string;
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

  // 2. Dispatch by sync_type
  const syncType = cfg.sync_type ?? "route";
  const summary = syncType === "billing"
    ? await syncBilling(cfg, text)
    : syncType === "班表欄位" || syncType === "schedule"
      ? await syncSchedule(cfg, text)
      : await syncRoutes(cfg, text);

  // 3. Write log entry
  await pool.query(
    `INSERT INTO sheet_sync_logs (config_id, inserted, duplicates, errors, warnings, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [cfg.id, summary.inserted, summary.duplicates, summary.errors, summary.warnings, summary.detail]
  );

  // 4. Update last_sync_at + result on config
  await pool.query(
    `UPDATE sheet_sync_configs
     SET last_sync_at = NOW(),
         last_sync_result = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [cfg.id, { inserted: summary.inserted, duplicates: summary.duplicates, errors: summary.errors, warnings: summary.warnings }]
  );

  console.log(
    `[SheetSync] "${cfg.name}" (${syncType}) synced — inserted:${summary.inserted} dup:${summary.duplicates} err:${summary.errors} warn:${summary.warnings}`
  );

  return summary;
}

// ── Scheduler: runs every minute, checks which configs are due ─────────────
export function startSheetSyncScheduler() {
  const CHECK_INTERVAL_MS = 60 * 1000;

  async function tick() {
    try {
      const { rows: configs } = await pool.query<{
        id: number;
        name: string;
        sheet_url: string;
        interval_minutes: number;
        sync_type: string;
        customer_name: string;
        pickup_address: string;
        cargo_description: string;
        last_sync_at: Date | null;
      }>(
        `SELECT id, name, sheet_url, interval_minutes, sync_type, customer_name, pickup_address,
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

  setTimeout(tick, 30_000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[SheetSync] scheduler started, checking every 60s");
}
