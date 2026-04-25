/**
 * importSheetsStores.mjs
 * 從 Google Sheets 所有分頁匯入門市地址 → location_history
 *
 * 使用 batchGet 每批讀取 30 個分頁，大幅降低 API 呼叫次數
 * 動態偵測表頭（門市名稱 / 門市地址）
 *
 * 執行: node src/scripts/importSheetsStores.mjs
 */
import { google } from "googleapis";
import pkg from "pg";
const { Pool } = pkg;

const SPREADSHEET_ID = process.env.SHOPEE_SCHEDULE_SHEET_ID ?? "1JQR9RUtxmMt6VhxG_3on-1ftiQKzKQpFI8GO6JuBLvI";
const BATCH_SIZE = 30;   // 每次 batchGet 讀幾個分頁
const PAUSE_MS   = 1200; // 每批之間暫停（Sheets API: 60 reqs/min/user → 1req/sec safe）

const SKIP_SHEETS = new Set([
  "司機回填表", "主線過刷異常", "NDD過刷異常",
  "罰款統計2026年01月", "7月罰款統計", "8月罰款統計",
  "9月罰款統計", "10月罰款統計", "11月罰款統計", "2月份罰款",
]);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TW_CITIES = [
  "台北市","新北市","桃園市","台中市","台南市","高雄市",
  "基隆市","新竹市","嘉義市","新竹縣","苗栗縣","彰化縣",
  "南投縣","雲林縣","嘉義縣","屏東縣","宜蘭縣","花蓮縣",
  "台東縣","澎湖縣","金門縣","連江縣",
];
function extractCity(addr) {
  for (const c of TW_CITIES) if (addr.includes(c)) return c;
  return null;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] ?? [];
    const nameCol = row.findIndex((c) => String(c).includes("門市名稱"));
    const addrCol = row.findIndex((c) => String(c).includes("門市地址"));
    if (nameCol >= 0) return { headerIdx: i, nameCol, addrCol };
  }
  return null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function batchGetWithRetry(sheets, ranges, attempt = 1) {
  try {
    const resp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
      majorDimension: "ROWS",
    });
    return resp.data.valueRanges ?? [];
  } catch (e) {
    if (String(e.message).includes("Quota") && attempt <= 3) {
      const wait = attempt * 15000;
      console.log(`  ⏳ 速率限制，等待 ${wait/1000}s (嘗試 ${attempt}/3)...`);
      await sleep(wait);
      return batchGetWithRetry(sheets, ranges, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. 取得所有分頁清單
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });
  const allSheets = meta.data.sheets
    .map((s) => s.properties.title)
    .filter((t) => !SKIP_SHEETS.has(t));

  console.log(`處理 ${allSheets.length} 個分頁（每批 ${BATCH_SIZE} 個）\n`);

  // 2. 分批讀取
  const storeMap = new Map(); // address → place_name
  let sheetsWithAddr = 0, sheetsSkipped = 0;

  for (let batchStart = 0; batchStart < allSheets.length; batchStart += BATCH_SIZE) {
    const batch  = allSheets.slice(batchStart, batchStart + BATCH_SIZE);
    const ranges = batch.map((t) => `'${t}'!A1:K400`);

    let valueRanges;
    try {
      valueRanges = await batchGetWithRetry(sheets, ranges);
    } catch (e) {
      console.error(`  ❌ 批次 ${batchStart}–${batchStart + batch.length - 1} 讀取失敗:`, e.message);
      sheetsSkipped += batch.length;
      await sleep(PAUSE_MS);
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const sheetTitle = batch[i];
      const rows       = valueRanges[i]?.values ?? [];

      const header = findHeaderRow(rows);
      if (!header || header.addrCol < 0) {
        sheetsSkipped++;
        continue;
      }

      sheetsWithAddr++;
      let newInSheet = 0;
      for (let ri = header.headerIdx + 1; ri < rows.length; ri++) {
        const row     = rows[ri] ?? [];
        const name    = String(row[header.nameCol] ?? "").trim();
        const address = String(row[header.addrCol] ?? "").trim();
        if (!address || address.length < 5) continue;
        if (!storeMap.has(address)) {
          storeMap.set(address, name || null);
          newInSheet++;
        }
      }
      if (newInSheet > 0) {
        process.stdout.write(`  ✓ ${sheetTitle}: ${newInSheet} 筆\n`);
      }
    }

    const batchEnd = Math.min(batchStart + BATCH_SIZE, allSheets.length);
    process.stdout.write(`  [${batchEnd}/${allSheets.length}] 批次完成，暫停 ${PAUSE_MS}ms...\n`);
    if (batchEnd < allSheets.length) await sleep(PAUSE_MS);
  }

  console.log(`\n分頁：有地址 ${sheetsWithAddr} 個、跳過 ${sheetsSkipped} 個`);
  console.log(`去重後共 ${storeMap.size} 個唯一地址，寫入 DB...\n`);

  // 3. 批次寫入 DB
  let inserted = 0, updated = 0, errors = 0;
  for (const [address, placeName] of storeMap) {
    const city = extractCity(address);
    try {
      const r = await pool.query(
        `INSERT INTO location_history
           (address, place_name, place_type, location_type,
            city, visit_count, first_visited_at, last_visited_at)
         VALUES ($1, $2, 'store', 'delivery', $3, 1, NOW(), NOW())
         ON CONFLICT (address) DO UPDATE SET
           place_name      = COALESCE(EXCLUDED.place_name, location_history.place_name),
           place_type      = COALESCE(location_history.place_type, 'store'),
           city            = COALESCE(EXCLUDED.city, location_history.city),
           last_visited_at = GREATEST(location_history.last_visited_at, NOW()),
           updated_at      = NOW()
         RETURNING (xmax = 0) AS is_new`,
        [address, placeName || null, city],
      );
      if (r.rows[0]?.is_new) inserted++; else updated++;
    } catch (e) {
      console.error(`  ❌ [${address}]: ${e.message}`);
      errors++;
    }
  }

  console.log(`✅ 完成！新增 ${inserted} 筆、更新 ${updated} 筆、失敗 ${errors} 筆`);

  // 4. 統計
  const { rows: stats } = await pool.query(`
    SELECT
      COUNT(*)                                           AS total,
      COUNT(CASE WHEN place_type = 'store' THEN 1 END)  AS stores,
      COUNT(CASE WHEN city IS NOT NULL THEN 1 END)       AS has_city
    FROM location_history
  `);
  const { rows: cities } = await pool.query(`
    SELECT city, COUNT(*) AS cnt
    FROM location_history WHERE place_type = 'store' AND city IS NOT NULL
    GROUP BY city ORDER BY cnt DESC
  `);
  const s = stats[0];
  console.log(`\n📊 location_history 總計：地點 ${s.total} 個 | 門市 ${s.stores} 間 | 有縣市 ${s.has_city} 個`);
  console.log(`   縣市分佈：${cities.map((c) => `${c.city}(${c.cnt})`).join(" | ")}`);

  await pool.end();
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
