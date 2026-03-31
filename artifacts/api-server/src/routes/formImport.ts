/**
 * Google Form response import
 *
 * POST /api/orders/form-import/preview
 *   Body: { csvUrl?, csvText? } — parse only, no DB writes
 *   Returns: { ok, rows, warnings, columns, summary }
 *
 * POST /api/orders/form-import
 *   Body: { rows, fieldMap? } — insert orders
 *   Returns: { ok, inserted, errors }
 *
 * CSV format: Google Form export to Google Sheets
 *   Row 1: headers (time, customer questions...)
 *   Row 2+: one customer order per row
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { applyAutoRoutingToOrder } from "./autoRouting";

export const formImportRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────
export interface FormRow {
  rowIndex: number;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription: string;
  vehicleType: string;
  pickupDate: string;
  pickupTime: string;
  notes: string;
  raw: Record<string, string>;
}

// ── Column alias map ───────────────────────────────────────────────────────
// Keys = internal field; values = substrings that identify the column header
const FIELD_ALIASES: Record<keyof Omit<FormRow, "rowIndex" | "raw">, string[]> = {
  customerName:    ["姓名", "客戶姓名", "聯絡人", "客戶名稱", "訂購人", "下單者", "寄件人", "name"],
  customerPhone:   ["電話", "手機", "連絡電話", "客戶電話", "聯絡電話", "phone", "mobile"],
  pickupAddress:   ["取貨地址", "起點", "出發地", "取件地址", "寄件地址", "pickup", "取貨"],
  deliveryAddress: ["送貨地址", "目的地", "送達地址", "收件地址", "收貨地址", "delivery", "送達", "送貨"],
  cargoDescription:["貨物", "品項", "貨物說明", "貨品", "物品", "內容物", "cargo", "item"],
  vehicleType:     ["車型", "車輛", "需要車型", "vehicle"],
  pickupDate:      ["取貨日期", "配送日期", "日期", "date"],
  pickupTime:      ["取貨時間", "配送時間", "時間", "time"],
  notes:           ["備註", "注意事項", "特殊需求", "note", "remark"],
};

const TIMESTAMP_KEYWORDS = ["時間戳記", "timestamp", "提交時間", "填寫時間"];

function detectField(header: string, aliases: string[]): boolean {
  const h = header.toLowerCase().trim();
  return aliases.some((a) => h.includes(a.toLowerCase()));
}

function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex((h) => detectField(h, aliases));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

// ── CSV Parser ────────────────────────────────────────────────────────────
export function parseFormCsv(text: string): {
  rows: FormRow[];
  columns: string[];
  warnings: string[];
} {
  const lines = text.split("\n").filter((l) => l.trim());
  const warnings: string[] = [];
  const rows: FormRow[] = [];

  if (lines.length < 2) {
    return { rows: [], columns: [], warnings: ["試算表資料不足，至少需要表頭列與一筆資料"] };
  }

  // Parse headers — skip if first column looks like a timestamp
  const rawHeaders = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const isTimestampFirst = TIMESTAMP_KEYWORDS.some((kw) =>
    rawHeaders[0].toLowerCase().includes(kw.toLowerCase())
  );

  const colMap = buildColumnMap(rawHeaders);

  // Report unmapped critical fields
  const critical: (keyof typeof FIELD_ALIASES)[] = ["customerName", "customerPhone", "pickupAddress", "deliveryAddress"];
  const unmapped = critical.filter((f) => colMap[f] === undefined);
  if (unmapped.length > 0) {
    const labels: Record<string, string> = {
      customerName: "姓名",
      customerPhone: "電話",
      pickupAddress: "取貨地址",
      deliveryAddress: "送貨地址",
    };
    warnings.push(`找不到以下必要欄位：${unmapped.map((f) => labels[f]).join("、")}（請確認欄位標題包含對應關鍵字）`);
  }

  const get = (cols: string[], field: string): string => {
    const idx = colMap[field];
    if (idx === undefined || idx < 0) return "";
    return (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
  };

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // Simple CSV split (handles quoted commas)
    const cols = splitCsvLine(raw);
    if (cols.every((c) => !c.trim())) continue;

    // Skip if this looks like another header row
    if (isTimestampFirst && TIMESTAMP_KEYWORDS.some((kw) =>
      (cols[0] ?? "").toLowerCase().includes(kw.toLowerCase())
    )) continue;

    const rawObj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rawObj[h] = (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
    });

    const row: FormRow = {
      rowIndex: i,
      customerName:     get(cols, "customerName"),
      customerPhone:    get(cols, "customerPhone"),
      pickupAddress:    get(cols, "pickupAddress"),
      deliveryAddress:  get(cols, "deliveryAddress"),
      cargoDescription: get(cols, "cargoDescription"),
      vehicleType:      get(cols, "vehicleType"),
      pickupDate:       get(cols, "pickupDate"),
      pickupTime:       get(cols, "pickupTime"),
      notes:            get(cols, "notes"),
      raw: rawObj,
    };

    // Skip rows with no delivery address (likely empty/filler rows)
    if (!row.deliveryAddress && !row.pickupAddress) {
      warnings.push(`第 ${i + 1} 列：取貨地址與送貨地址均為空，已略過`);
      continue;
    }

    rows.push(row);
  }

  return { rows, columns: rawHeaders, warnings };
}

// ── Simple CSV line splitter (handles quoted fields) ──────────────────────
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Preview endpoint ──────────────────────────────────────────────────────
formImportRouter.post("/orders/form-import/preview", async (req, res) => {
  try {
    const { csvUrl, csvText } = req.body as { csvUrl?: string; csvText?: string };

    let text = csvText ?? "";
    if (!text && csvUrl) {
      const r = await fetch(csvUrl);
      if (!r.ok) return res.status(400).json({ error: `無法取得試算表：HTTP ${r.status}` });
      text = await r.text();
      if (text.trim().startsWith("<!DOCTYPE")) {
        return res.status(400).json({
          error: "無法取得 CSV，請確認試算表已設為「知道連結的人可查看」",
        });
      }
    }

    if (!text) return res.status(400).json({ error: "請提供 csvUrl 或 csvText" });

    const { rows, columns, warnings } = parseFormCsv(text);

    res.json({
      ok: true,
      rows,
      columns,
      warnings,
      fetchedUrl: csvUrl ?? "(csvText)",
      summary: { rowCount: rows.length },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Import endpoint ───────────────────────────────────────────────────────
formImportRouter.post("/orders/form-import", async (req, res) => {
  try {
    const { rows, defaultPickupAddress = "" } = req.body as {
      rows: FormRow[];
      defaultPickupAddress?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "請先預覽並確認表單資料" });
    }

    const inserted: { orderId: number; rowIndex: number; customerName: string }[] = [];
    const errors: { rowIndex: number; customerName: string; error: string }[] = [];

    for (const row of rows) {
      try {
        const pickupAddr = row.pickupAddress || defaultPickupAddress;

        const routing = await applyAutoRoutingToOrder({
          pickup_address: pickupAddr,
          delivery_address: row.deliveryAddress,
          required_vehicle_type: row.vehicleType || null,
          cargo_description: row.cargoDescription || "客戶訂單",
          region: null,
          postal_code: null,
        });

        const { rows: result } = await pool.query(
          `INSERT INTO orders (
            customer_name, customer_phone,
            pickup_address, delivery_address,
            cargo_description,
            required_vehicle_type,
            pickup_date, pickup_time,
            notes,
            status, source,
            zone_id, team_id,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','form_import',$10,$11,NOW(),NOW())
          RETURNING id`,
          [
            row.customerName || "（未填）",
            row.customerPhone || "",
            pickupAddr,
            row.deliveryAddress,
            row.cargoDescription || "客戶表單訂單",
            row.vehicleType || null,
            row.pickupDate || null,
            row.pickupTime || null,
            row.notes || null,
            routing.zone_id ?? null,
            routing.team_id ?? null,
          ]
        );

        inserted.push({
          orderId: result[0].id,
          rowIndex: row.rowIndex,
          customerName: row.customerName,
        });
      } catch (e: any) {
        errors.push({
          rowIndex: row.rowIndex,
          customerName: row.customerName,
          error: String(e).slice(0, 200),
        });
      }
    }

    res.json({ ok: true, inserted: inserted.length, orders: inserted, errors });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
