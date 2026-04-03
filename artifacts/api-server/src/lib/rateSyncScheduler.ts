/**
 * rateSyncScheduler.ts
 * 定時從 Google Sheets 拉取 Shopee 費率資料，自動更新 shopee_rate_cards。
 */

import { pool } from "@workspace/db";

function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── CSV parser ───────────────────────────────────────────────────────────────

interface RateRow {
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number | null;
  price_unit: string;
  notes: string | null;
}

const SERVICE_ALIASES: Record<string, string> = {
  "店配": "店配模式", "店配模式": "店配模式",
  "NDD": "NDD快速到貨", "NDD快速到貨": "NDD快速到貨",
  "轉運車趟次": "轉運車-趟次", "轉運車-趟次": "轉運車-趟次",
  "賣家上收": "賣家上收",
  "轉運車包時": "轉運車-包時", "轉運車-包時": "轉運車-包時",
  "WHNDD": "WH NDD", "WH NDD": "WH NDD", "WH_NDD": "WH NDD",
};

const VEHICLE_RE = /^\d+(\.\d+)?T$/i;

function normNum(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, "").trim());
  return isNaN(n) ? null : Math.round(n);
}

function normServiceType(raw: string): string {
  const trimmed = raw.trim();
  for (const [key, val] of Object.entries(SERVICE_ALIASES)) {
    if (trimmed.includes(key)) return val;
  }
  return trimmed || "未分類";
}

function parseRatesCsv(text: string): { rows: RateRow[]; warnings: string[] } {
  const lines = text.split(/\r?\n/);
  const rawRows = lines.map(line => {
    const cells: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (line[i] === ',' && !inQuote) {
        cells.push(current.trim());
        current = "";
      } else {
        current += line[i];
      }
    }
    cells.push(current.trim());
    return cells;
  }).filter(r => r.some(c => c));

  const rows: RateRow[] = [];
  const warnings: string[] = [];

  if (rawRows.length < 2) {
    warnings.push("CSV 列數不足，請確認格式");
    return { rows, warnings };
  }

  // ── Try to detect pivot format: find a row with ≥2 vehicle type columns ──
  let hdrRowIdx = -1;
  let vehicleCols: { col: number; type: string }[] = [];

  for (let i = 0; i < Math.min(rawRows.length, 8); i++) {
    const r = rawRows[i];
    const vCols = r
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => VEHICLE_RE.test(c.trim()));
    if (vCols.length >= 2) {
      hdrRowIdx = i;
      vehicleCols = vCols.map(({ c, idx }) => ({ col: idx, type: c.trim().toUpperCase().replace(/T$/, "T") }));
      break;
    }
  }

  if (hdrRowIdx >= 0) {
    // ── Wide/pivot format ───────────────────────────────────────────────────
    let price_unit = "趟";
    for (let i = 0; i <= hdrRowIdx; i++) {
      const txt = rawRows[i].join(" ");
      if (txt.includes("小時")) { price_unit = "小時"; break; }
    }

    // Check if there's a service_type column to the left of the route column
    const hdrRow = rawRows[hdrRowIdx];
    const routeColIdx = 0; // route is first column by default

    let currentServiceType = "未分類";
    // Check if sheet has a name-like first row
    const firstNonEmpty = rawRows[0]?.find(c => c.length > 0);
    if (firstNonEmpty) {
      const mapped = normServiceType(firstNonEmpty);
      if (mapped !== "未分類") currentServiceType = mapped;
    }
    // Also check header row for service type
    if (hdrRow[0] && !VEHICLE_RE.test(hdrRow[0])) {
      const mapped = normServiceType(hdrRow[0]);
      if (mapped !== "未分類") currentServiceType = mapped;
    }

    for (let i = hdrRowIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (!r.some(c => c)) continue;

      const firstCell = r[routeColIdx] || "";
      const hasAnyPrice = vehicleCols.some(({ col }) => normNum(r[col] || "") !== null);

      // Section header: first cell has text, no prices → service type label
      if (firstCell && !hasAnyPrice) {
        const mapped = normServiceType(firstCell);
        if (mapped !== "未分類") currentServiceType = mapped;
        else if (firstCell.length < 20) currentServiceType = firstCell;
        continue;
      }

      if (!firstCell) continue;

      for (const { col, type } of vehicleCols) {
        const price = normNum(r[col] || "");
        if (price === null) continue;
        rows.push({
          service_type: currentServiceType,
          route: firstCell,
          vehicle_type: type,
          unit_price: price,
          price_unit,
          notes: null,
        });
      }
    }
    return { rows, warnings };
  }

  // ── Flat format: look for header row with 路線/route and 車型/vehicle ────
  const flatHdrIdx = rawRows.findIndex(r => {
    const lower = r.map(c => c.toLowerCase());
    return (lower.some(c => c.includes("路線") || c === "route")) &&
           (lower.some(c => c.includes("車型") || c.includes("vehicle")));
  });

  if (flatHdrIdx >= 0) {
    const hdr = rawRows[flatHdrIdx].map(c => c.toLowerCase());
    const colST    = hdr.findIndex(c => c.includes("服務") || c.includes("service") || c.includes("類型"));
    const colRoute = hdr.findIndex(c => c === "路線" || c === "route");
    const colVeh   = hdr.findIndex(c => c.includes("車型") || c.includes("vehicle"));
    const colPrice = hdr.findIndex(c => c.includes("單價") || c.includes("price") || c.includes("運費"));
    const colUnit  = hdr.findIndex(c => c.includes("計價") || c.includes("unit") || c.includes("單位"));
    const colNotes = hdr.findIndex(c => c.includes("備") || c.includes("note"));

    let currentST = "未分類";
    for (let i = flatHdrIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (!r.some(c => c)) continue;
      const st = colST >= 0 ? (r[colST] || currentST) : currentST;
      if (st && r.every((c, j) => j === 0 || !c)) { currentST = normServiceType(st); continue; }
      const route = colRoute >= 0 ? r[colRoute] : "";
      const veh   = colVeh >= 0 ? r[colVeh] : "";
      const price = colPrice >= 0 ? normNum(r[colPrice] || "") : null;
      const unit  = colUnit >= 0 ? (r[colUnit] || "趟") : "趟";
      const notes = colNotes >= 0 ? (r[colNotes] || null) : null;
      if (!route || !veh) continue;
      rows.push({
        service_type: normServiceType(st || currentST),
        route,
        vehicle_type: veh,
        unit_price: price,
        price_unit: unit,
        notes,
      });
    }
    return { rows, warnings };
  }

  warnings.push("找不到符合的費率格式（需含車型欄 6.2T/8.5T... 或路線+車型欄位）");
  return { rows, warnings };
}

// ── Core sync ────────────────────────────────────────────────────────────────

export async function runRateSync(cfg: {
  id: number;
  name: string;
  import_mode: string;
  effective_month: string | null;
}, csvUrl: string): Promise<{
  inserted: number;
  updated: number;
  errors: number;
  warnings: number;
  detail: object;
}> {
  const fetchRes = await fetch(csvUrl);
  if (!fetchRes.ok) throw new Error(`無法取得試算表 (HTTP ${fetchRes.status})`);
  const text = await fetchRes.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("無法取得 CSV，請確認試算表已設為「知道連結的人可查看」");
  }

  const { rows, warnings: parseWarnings } = parseRatesCsv(text);

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorList: string[] = [];

  const effectiveMonth = cfg.effective_month || null;

  if (cfg.import_mode === "replace") {
    if (effectiveMonth) {
      await pool.query(
        `DELETE FROM shopee_rate_cards WHERE effective_month = $1`,
        [effectiveMonth]
      );
    } else {
      await pool.query(`TRUNCATE TABLE shopee_rate_cards RESTART IDENTITY`);
    }
  }

  for (const row of rows) {
    const { service_type, route, vehicle_type, unit_price, price_unit, notes } = row;
    if (!service_type || !route || !vehicle_type) continue;
    try {
      if (cfg.import_mode === "merge") {
        const ex = await pool.query(
          `SELECT id FROM shopee_rate_cards
           WHERE service_type=$1 AND route=$2 AND vehicle_type=$3
           ${effectiveMonth ? "AND effective_month=$4" : "AND effective_month IS NULL"}
           LIMIT 1`,
          effectiveMonth
            ? [service_type, route, vehicle_type, effectiveMonth]
            : [service_type, route, vehicle_type]
        );
        if (ex.rows.length > 0) {
          await pool.query(
            `UPDATE shopee_rate_cards
             SET unit_price=$1, price_unit=$2, notes=$3, effective_month=$4
             WHERE id=$5`,
            [unit_price, price_unit, notes, effectiveMonth, ex.rows[0].id]
          );
          updated++;
          continue;
        }
      }
      await pool.query(
        `INSERT INTO shopee_rate_cards (service_type, route, vehicle_type, unit_price, price_unit, notes, effective_month)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [service_type, route, vehicle_type, unit_price, price_unit, notes, effectiveMonth]
      );
      inserted++;
    } catch (e: unknown) {
      errors++;
      errorList.push(String(e).slice(0, 200));
    }
  }

  const summary = { inserted, updated, errors, warnings: parseWarnings.length, detail: { parseWarnings, errorList } };

  await pool.query(
    `INSERT INTO rate_sync_logs (config_id, inserted, updated, errors, warnings, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [cfg.id, inserted, updated, errors, parseWarnings.length, JSON.stringify(summary.detail)]
  );
  await pool.query(
    `UPDATE rate_sync_configs
     SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
     WHERE id=$2`,
    [JSON.stringify({ inserted, updated, errors, warnings: parseWarnings.length }), cfg.id]
  );

  console.log(`[RateSync] "${cfg.name}" — inserted:${inserted} updated:${updated} err:${errors}`);
  return summary;
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export function startRateSyncScheduler() {
  console.log("[RateSync] scheduler started, checking every 60s");
  setInterval(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, sheet_url, import_mode, effective_month
         FROM rate_sync_configs
         WHERE is_active = true
           AND (last_sync_at IS NULL
             OR last_sync_at < NOW() - (interval_minutes || ' minutes')::interval)`
      );
      for (const cfg of rows) {
        try {
          const csvUrl = toCsvUrl(cfg.sheet_url);
          await runRateSync(cfg, csvUrl);
        } catch (e: unknown) {
          console.error(`[RateSync] "${cfg.name}" error:`, e);
          await pool.query(
            `UPDATE rate_sync_configs
             SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
             WHERE id=$2`,
            [JSON.stringify({ error: String(e).slice(0, 300) }), cfg.id]
          );
        }
      }
    } catch (e) {
      console.error("[RateSync] scheduler error:", e);
    }
  }, 60_000);
}
