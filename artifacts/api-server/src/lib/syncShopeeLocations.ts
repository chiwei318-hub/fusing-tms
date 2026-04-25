/**
 * syncShopeeLocations.ts
 *
 * 從 Google Sheets (SHOPEE_SCHEDULE_SHEET_ID) 讀取所有分頁，
 * 掃描含「門市地址」欄位的分頁，將地址 UPSERT 進 location_history。
 *
 * 驗證順序：GOOGLE_SERVICE_ACCOUNT_KEY → GOOGLE_API_KEY
 * 分頁策略：讀取所有分頁（跳過 SKIP_SHEETS），不限 Raw_ 前綴
 */

import { pool } from "@workspace/db";

const SPREADSHEET_ID =
  process.env.SHOPEE_SCHEDULE_SHEET_ID ??
  "1JQR9RUtxmMt6VhxG_3on-1ftiQKzKQpFI8GO6JuBLvI";

const BATCH_SIZE = 30;

const SKIP_SHEETS = new Set([
  "司機回填表", "主線過刷異常", "NDD過刷異常",
  "罰款統計2026年01月", "7月罰款統計", "8月罰款統計",
  "9月罰款統計", "10月罰款統計", "11月罰款統計", "2月份罰款",
]);

const TW_CITIES = [
  "台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市",
  "基隆市", "新竹市", "嘉義市", "新竹縣", "苗栗縣", "彰化縣",
  "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "台東縣", "澎湖縣", "金門縣", "連江縣",
];

function extractCity(addr: string): string | null {
  for (const c of TW_CITIES) if (addr.includes(c)) return c;
  return null;
}

function findHeader(rows: string[][]): { hi: number; nc: number; ac: number } | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i] ?? [];
    const nc = r.findIndex(c => String(c).includes("門市名稱"));
    const ac = r.findIndex(c => String(c).includes("門市地址"));
    if (ac >= 0) return { hi: i, nc, ac };
  }
  return null;
}

export interface SyncShopeeResult {
  inserted: number;
  updated: number;
  total: number;
  sheetCount: number;
  addressCount: number;
  durationMs: number;
  error?: string;
}

export async function syncShopeeLocations(): Promise<SyncShopeeResult> {
  const startMs = Date.now();

  // ── 建立 Google Sheets client ──────────────────────────────────────────────
  const { google } = await import("googleapis");
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!serviceAccountRaw && !apiKey) {
    throw new Error("未設定 GOOGLE_SERVICE_ACCOUNT_KEY 或 GOOGLE_API_KEY");
  }

  let sheets: any;
  if (serviceAccountRaw) {
    const creds = JSON.parse(serviceAccountRaw);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    sheets = google.sheets({ version: "v4", auth });
    console.log("[SyncShopeeLocations] 使用 Service Account 驗證");
  } else {
    sheets = google.sheets({ version: "v4", auth: apiKey });
    console.log("[SyncShopeeLocations] 使用 API Key 驗證");
  }

  // ── 取得分頁清單 ──────────────────────────────────────────────────────────
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });
  const allTitles: string[] = (meta.data.sheets ?? []).map(
    (s: any) => s.properties.title as string,
  );
  const titles = allTitles.filter(t => !SKIP_SHEETS.has(t));
  console.log(`[SyncShopeeLocations] 共 ${allTitles.length} 個分頁，有效處理 ${titles.length} 個`);

  // ── 批次讀取所有分頁 ──────────────────────────────────────────────────────
  const storeMap = new Map<string, string | null>(); // address → name
  let sheetCount = 0;

  for (let start = 0; start < titles.length; start += BATCH_SIZE) {
    await new Promise(r => setTimeout(r, 1000)); // rate limit
    const batch = titles.slice(start, start + BATCH_SIZE);
    let vr: any[];
    try {
      const resp = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: batch.map(t => `'${t}'!A1:M400`),
        majorDimension: "ROWS",
      });
      vr = resp.data.valueRanges ?? [];
    } catch (err: any) {
      console.warn(`[SyncShopeeLocations] 批次 ${start}~${start + BATCH_SIZE - 1} 讀取失敗:`, err.message);
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const rows = (vr[i]?.values ?? []) as string[][];
      const hdr = findHeader(rows);
      if (!hdr || hdr.ac < 0) continue;
      sheetCount++;
      for (let ri = hdr.hi + 1; ri < rows.length; ri++) {
        const r = rows[ri] ?? [];
        const nm = String(r[hdr.nc] ?? "").trim();
        const ad = String(r[hdr.ac] ?? "").trim();
        if (!ad || ad.length < 5) continue;
        if (!storeMap.has(ad)) storeMap.set(ad, nm || null);
      }
    }
  }

  console.log(`[SyncShopeeLocations] 從 ${sheetCount} 個含地址分頁讀取到 ${storeMap.size} 筆不重複地址`);

  // ── UPSERT 進 location_history ────────────────────────────────────────────
  let inserted = 0;
  let updated = 0;

  for (const [address, placeName] of storeMap) {
    const city = extractCity(address);
    try {
      const r = await pool.query(
        `INSERT INTO location_history
           (address, place_name, place_type, location_type, city,
            visit_count, first_visited_at, last_visited_at)
         VALUES ($1, $2, 'store', 'delivery', $3, 1, NOW(), NOW())
         ON CONFLICT (address) DO UPDATE SET
           place_name  = COALESCE(EXCLUDED.place_name, location_history.place_name),
           city        = COALESCE(EXCLUDED.city, location_history.city),
           updated_at  = NOW()
         RETURNING (xmax = 0) AS is_new`,
        [address, placeName || null, city],
      );
      if (r.rows[0]?.is_new) inserted++;
      else updated++;
    } catch (err: any) {
      console.warn(`[SyncShopeeLocations] UPSERT 失敗 "${address}":`, err.message);
    }
  }

  const durationMs = Date.now() - startMs;
  console.log(
    `[SyncShopeeLocations] ✅ 完成 — 新增 ${inserted} / 更新 ${updated} / 耗時 ${Math.round(durationMs / 1000)}s`,
  );

  return {
    inserted,
    updated,
    total: inserted + updated,
    sheetCount,
    addressCount: storeMap.size,
    durationMs,
  };
}
