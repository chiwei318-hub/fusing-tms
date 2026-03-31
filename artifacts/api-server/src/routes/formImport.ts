/**
 * Google Form response import
 *
 * POST /api/orders/form-import/preview
 *   Body: { csvUrl?, csvText?, fieldMap? }
 *   fieldMap: { customerName: 2, customerPhone: 3, ... }  (column indices, 0-based)
 *   Returns: { ok, rows, warnings, columns, autoMap, summary }
 *
 * POST /api/orders/form-import
 *   Body: { rows, defaultPickupAddress? }
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

export type FieldKey =
  | "customerName"
  | "customerPhone"
  | "pickupAddress"
  | "deliveryAddress"
  | "cargoDescription"
  | "vehicleType"
  | "pickupDate"
  | "pickupTime"
  | "notes";

export type FieldMap = Partial<Record<FieldKey, number>>;

// ── Column alias map (auto-detect) ─────────────────────────────────────────
const FIELD_ALIASES: Record<FieldKey, string[]> = {
  customerName: [
    "姓名", "客戶姓名", "聯絡人", "客戶名稱", "訂購人", "下單者",
    "寄件人", "叫車人", "訂貨人", "預約人", "name",
  ],
  customerPhone: [
    "電話", "手機", "連絡電話", "客戶電話", "聯絡電話",
    "手機號碼", "聯絡方式", "phone", "mobile",
  ],
  pickupAddress: [
    // 地址類
    "取貨地址", "取件地址", "寄件地址", "pickup address",
    // 地點/門市類
    "取貨地點", "取件地點", "取貨門市", "取件門市",
    "取件站", "出發門市", "起點", "出發地", "出發地點",
    // 倉庫/站點
    "取貨倉", "出貨倉", "出貨地點", "取件倉",
    // 短關鍵字（最後匹配，避免誤判）
    "取貨", "取件", "pickup",
  ],
  deliveryAddress: [
    // 地址類
    "送貨地址", "收件地址", "送達地址", "收貨地址", "delivery address",
    // 地點/門市類
    "送貨地點", "送件地點", "送貨門市", "收件門市",
    "送達地點", "配送地點", "配送門市",
    "送件站", "收件站", "目的地", "終點",
    // 短關鍵字
    "送貨", "送件", "送達", "收件", "配送", "delivery",
  ],
  cargoDescription: [
    "貨物", "品項", "貨物說明", "貨品", "物品", "內容物",
    "貨品名稱", "品名", "配送品項", "cargo", "item",
  ],
  vehicleType: [
    "車型", "車輛", "需要車型", "車型需求",
    "車型需求", "使用車型", "叫車車型", "vehicle",
  ],
  pickupDate: [
    "取貨日期", "配送日期", "取件日期", "預約日期",
    "日期", "預約日", "預計日期", "需求日", "date",
  ],
  pickupTime: [
    "取貨時間", "配送時間", "取件時間", "預約時間",
    "時間", "需求時間", "time",
  ],
  notes: [
    "備註", "注意事項", "特殊需求", "附加說明",
    "說明", "補充說明", "其他說明", "note", "remark",
  ],
};

const TIMESTAMP_KEYWORDS = ["時間戳記", "timestamp", "提交時間", "填寫時間"];

function detectField(header: string, aliases: string[]): boolean {
  const h = header.toLowerCase().trim();
  return aliases.some((a) => h.includes(a.toLowerCase()));
}

function buildAutoMap(headers: string[]): FieldMap {
  const map: FieldMap = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [FieldKey, string[]][]) {
    const idx = headers.findIndex((h) => detectField(h, aliases));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

// ── CSV Parser ────────────────────────────────────────────────────────────
export function parseFormCsv(
  text: string,
  manualMap?: FieldMap
): {
  rows: FormRow[];
  columns: string[];
  autoMap: FieldMap;
  warnings: string[];
} {
  const lines = text.split("\n").filter((l) => l.trim());
  const warnings: string[] = [];
  const rows: FormRow[] = [];

  if (lines.length < 2) {
    return { rows: [], columns: [], autoMap: {}, warnings: ["試算表資料不足，至少需要表頭列與一筆資料"] };
  }

  const rawHeaders = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

  const isTimestampFirst = TIMESTAMP_KEYWORDS.some((kw) =>
    rawHeaders[0].toLowerCase().includes(kw.toLowerCase())
  );

  // Auto-detect column positions
  const autoMap = buildAutoMap(rawHeaders);

  // Merge: manual map overrides auto map
  const colMap: FieldMap = { ...autoMap, ...manualMap };

  // Report unmapped critical fields (only warn if NO manual map provided)
  const critical: FieldKey[] = ["customerName", "customerPhone", "pickupAddress", "deliveryAddress"];
  const unmapped = critical.filter((f) => colMap[f] === undefined);
  if (unmapped.length > 0 && !manualMap) {
    const labels: Record<string, string> = {
      customerName: "姓名", customerPhone: "電話",
      pickupAddress: "取貨地址", deliveryAddress: "送貨地址",
    };
    warnings.push(
      `自動偵測無法對應以下欄位：${unmapped.map((f) => labels[f]).join("、")}（請使用下方的「手動設定欄位對應」）`
    );
  }

  const get = (cols: string[], field: FieldKey): string => {
    const idx = colMap[field];
    if (idx === undefined || idx < 0) return "";
    return (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
  };

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw);
    if (cols.every((c) => !c.trim())) continue;

    // Skip duplicate header rows
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

    if (!row.deliveryAddress && !row.pickupAddress) {
      warnings.push(`第 ${i + 1} 列：取貨地址與送貨地址均為空，已略過`);
      continue;
    }

    rows.push(row);
  }

  return { rows, columns: rawHeaders, autoMap, warnings };
}

// ── Simple CSV line splitter ──────────────────────────────────────────────
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

// ── Cache fetched CSV text (keyed by URL) for re-parse with manual map ────
const csvCache = new Map<string, string>();

// ── Preview endpoint ──────────────────────────────────────────────────────
formImportRouter.post("/orders/form-import/preview", async (req, res) => {
  try {
    const {
      csvUrl,
      csvText,
      fieldMap,
    } = req.body as { csvUrl?: string; csvText?: string; fieldMap?: FieldMap };

    let text = csvText ?? "";
    let fetchedUrl = csvUrl ?? "(csvText)";

    if (!text && csvUrl) {
      // Check cache first (avoid re-fetching when user adjusts fieldMap)
      if (csvCache.has(csvUrl)) {
        text = csvCache.get(csvUrl)!;
      } else {
        const r = await fetch(csvUrl);
        if (!r.ok) {
          return res.status(400).json({ error: `無法取得試算表：HTTP ${r.status}` });
        }
        text = await r.text();
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          return res.status(400).json({
            error: "無法取得 CSV，請確認試算表已設為「知道連結的人可查看」，然後重試",
          });
        }
        // Cache for 5 minutes
        csvCache.set(csvUrl, text);
        setTimeout(() => csvCache.delete(csvUrl), 5 * 60 * 1000);
      }
    }

    if (!text) return res.status(400).json({ error: "請提供 csvUrl 或 csvText" });

    const { rows, columns, autoMap, warnings } = parseFormCsv(text, fieldMap);

    res.json({
      ok: true,
      rows,
      columns,
      autoMap,
      warnings,
      fetchedUrl,
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
