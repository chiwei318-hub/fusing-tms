/**
 * rateSync.ts — Shopee 費率試算表自動同步
 *
 * GET    /api/rate-sync              列出所有同步設定
 * POST   /api/rate-sync              新增同步設定
 * PATCH  /api/rate-sync/:id          更新設定
 * DELETE /api/rate-sync/:id          刪除設定
 * POST   /api/rate-sync/:id/run      手動觸發一次同步
 * GET    /api/rate-sync/:id/logs     取得最近同步記錄
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { runRateSync } from "../lib/rateSyncScheduler";

export const rateSyncRouter = Router();

const SEED_RATES: [string, string, string, number | null, string][] = [
  ["NDD快速到貨","嘉義<->北屏東","11T",5932,"趟"],
  ["NDD快速到貨","嘉義<->北屏東","6.2T",4900,"趟"],
  ["NDD快速到貨","嘉義<->北屏東","8.5T",4975,"趟"],
  ["NDD快速到貨","嘉義<->南屏東","8.5T",5050,"趟"],
  ["NDD快速到貨","嘉義<->南投","11T",4281,"趟"],
  ["NDD快速到貨","嘉義<->南投","6.2T",2950,"趟"],
  ["NDD快速到貨","嘉義<->南投","8.5T",3425,"趟"],
  ["NDD快速到貨","嘉義<->台南","11T",4395,"趟"],
  ["NDD快速到貨","嘉義<->台南","6.2T",3200,"趟"],
  ["NDD快速到貨","嘉義<->台南","8.5T",3550,"趟"],
  ["NDD快速到貨","嘉義<->嘉義","11T",3529,"趟"],
  ["NDD快速到貨","嘉義<->嘉義","6.2T",2800,"趟"],
  ["NDD快速到貨","嘉義<->嘉義","8.5T",2850,"趟"],
  ["NDD快速到貨","嘉義<->彰化","11T",4739,"趟"],
  ["NDD快速到貨","嘉義<->彰化","6.2T",3400,"趟"],
  ["NDD快速到貨","嘉義<->彰化","8.5T",3915,"趟"],
  ["NDD快速到貨","嘉義<->雲林","11T",3813,"趟"],
  ["NDD快速到貨","嘉義<->雲林","6.2T",2650,"趟"],
  ["NDD快速到貨","嘉義<->雲林","8.5T",3050,"趟"],
  ["NDD快速到貨","嘉義<->高雄","11T",5369,"趟"],
  ["NDD快速到貨","嘉義<->高雄","6.2T",3900,"趟"],
  ["NDD快速到貨","嘉義<->高雄","8.5T",4550,"趟"],
  ["NDD快速到貨","彰化<->北台中","11T",4079,"趟"],
  ["NDD快速到貨","彰化<->北台中","6.2T",2750,"趟"],
  ["NDD快速到貨","彰化<->北台中","8.5T",3225,"趟"],
  ["NDD快速到貨","彰化<->南投","11T",4079,"趟"],
  ["NDD快速到貨","彰化<->南投","6.2T",2750,"趟"],
  ["NDD快速到貨","彰化<->南投","8.5T",3225,"趟"],
  ["NDD快速到貨","彰化<->台中","11T",3841,"趟"],
  ["NDD快速到貨","彰化<->台中","6.2T",2650,"趟"],
  ["NDD快速到貨","彰化<->台中","8.5T",3025,"趟"],
  ["NDD快速到貨","彰化<->彰化","11T",3841,"趟"],
  ["NDD快速到貨","彰化<->彰化","6.2T",2650,"趟"],
  ["NDD快速到貨","彰化<->彰化","8.5T",3025,"趟"],
  ["NDD快速到貨","桃園<->台中","11T",6613,"趟"],
  ["NDD快速到貨","桃園<->台中","6.2T",4600,"趟"],
  ["NDD快速到貨","桃園<->台中","8.5T",5750,"趟"],
  ["NDD快速到貨","桃園<->基隆","11T",3995,"趟"],
  ["NDD快速到貨","桃園<->基隆","6.2T",2850,"趟"],
  ["NDD快速到貨","桃園<->基隆","8.5T",3300,"趟"],
  ["NDD快速到貨","桃園<->宜蘭","6.2T",4200,"趟"],
  ["NDD快速到貨","桃園<->新竹","11T",4219,"趟"],
  ["NDD快速到貨","桃園<->新竹","6.2T",2900,"趟"],
  ["NDD快速到貨","桃園<->新竹","8.5T",3375,"趟"],
  ["NDD快速到貨","桃園<->桃園市","11T",3651,"趟"],
  ["NDD快速到貨","桃園<->桃園市","6.2T",2500,"趟"],
  ["NDD快速到貨","桃園<->桃園市","8.5T",2875,"趟"],
  ["NDD快速到貨","桃園<->苗栗","11T",4787,"趟"],
  ["NDD快速到貨","桃園<->苗栗","6.2T",3500,"趟"],
  ["NDD快速到貨","桃園<->苗栗","8.5T",3850,"趟"],
  ["NDD快速到貨","桃園<->雙北地區","11T",3921,"趟"],
  ["NDD快速到貨","桃園<->雙北地區","6.2T",2650,"趟"],
  ["NDD快速到貨","桃園<->雙北地區","8.5T",3100,"趟"],
  ["WH NDD","安南<->北屏東","6.2T",4000,"趟"],
  ["WH NDD","安南<->南屏東","6.2T",4100,"趟"],
  ["WH NDD","安南<->南投","6.2T",5100,"趟"],
  ["WH NDD","安南<->台南","6.2T",3050,"趟"],
  ["WH NDD","安南<->嘉義","6.2T",3700,"趟"],
  ["WH NDD","安南<->彰化","6.2T",5000,"趟"],
  ["WH NDD","安南<->雲林","6.2T",4050,"趟"],
  ["WH NDD","安南<->高雄","6.2T",3650,"趟"],
  ["WH NDD","桃園<->台中","6.2T",5000,"趟"],
  ["WH NDD","桃園<->基隆","6.2T",4000,"趟"],
  ["WH NDD","桃園<->新竹縣市","6.2T",3200,"趟"],
  ["WH NDD","桃園<->桃園","6.2T",3050,"趟"],
  ["WH NDD","桃園<->苗栗","6.2T",4100,"趟"],
  ["WH NDD","桃園<->雙北地區","6.2T",3400,"趟"],
  ["店配模式","嘉義<->北屏東","11T",6200,"趟"],
  ["店配模式","嘉義<->北屏東","6.2T",4365,"趟"],
  ["店配模式","嘉義<->北屏東","8.5T",5200,"趟"],
  ["店配模式","嘉義<->南屏東","11T",6400,"趟"],
  ["店配模式","嘉義<->南屏東","6.2T",4700,"趟"],
  ["店配模式","嘉義<->南屏東","8.5T",5400,"趟"],
  ["店配模式","嘉義<->南投","11T",4500,"趟"],
  ["店配模式","嘉義<->南投","6.2T",3005,"趟"],
  ["店配模式","嘉義<->南投","8.5T",3600,"趟"],
  ["店配模式","嘉義<->南投/埔里","11T",5300,"趟"],
  ["店配模式","嘉義<->南投/埔里","6.2T",3900,"趟"],
  ["店配模式","嘉義<->南投/埔里","8.5T",4300,"趟"],
  ["店配模式","嘉義<->台中","11T",5200,"趟"],
  ["店配模式","嘉義<->台中","6.2T",3800,"趟"],
  ["店配模式","嘉義<->台中","8.5T",4200,"趟"],
  ["店配模式","嘉義<->台南","11T",5200,"趟"],
  ["店配模式","嘉義<->台南","6.2T",3685,"趟"],
  ["店配模式","嘉義<->台南","8.5T",4200,"趟"],
  ["店配模式","嘉義<->台東","6.2T",11000,"趟"],
  ["店配模式","嘉義<->嘉義","11T",3900,"趟"],
  ["店配模式","嘉義<->嘉義","6.2T",2665,"趟"],
  ["店配模式","嘉義<->嘉義","8.5T",3150,"趟"],
  ["店配模式","嘉義<->彰化","11T",4600,"趟"],
  ["店配模式","嘉義<->彰化","6.2T",3200,"趟"],
  ["店配模式","嘉義<->彰化","8.5T",3800,"趟"],
  ["店配模式","嘉義<->恆春/屏東","6.2T",8000,"趟"],
  ["店配模式","嘉義<->花蓮","6.2T",16000,"趟"],
  ["店配模式","嘉義<->雲林","11T",4000,"趟"],
  ["店配模式","嘉義<->雲林","6.2T",2715,"趟"],
  ["店配模式","嘉義<->雲林","8.5T",3200,"趟"],
  ["店配模式","嘉義<->雲林/參寮","11T",4500,"趟"],
  ["店配模式","嘉義<->雲林/參寮","6.2T",3100,"趟"],
  ["店配模式","嘉義<->雲林/參寮","8.5T",3600,"趟"],
  ["店配模式","嘉義<->高雄","11T",5900,"趟"],
  ["店配模式","嘉義<->高雄","6.2T",4170,"趟"],
  ["店配模式","嘉義<->高雄","8.5T",5000,"趟"],
  ["店配模式","彰化<->北台中","11T",4300,"趟"],
  ["店配模式","彰化<->北台中","6.2T",2900,"趟"],
  ["店配模式","彰化<->北台中","8.5T",3400,"趟"],
  ["店配模式","彰化<->南投","11T",4300,"趟"],
  ["店配模式","彰化<->南投","6.2T",2900,"趟"],
  ["店配模式","彰化<->南投","8.5T",3400,"趟"],
  ["店配模式","彰化<->台中","11T",3500,"趟"],
  ["店配模式","彰化<->台中","6.2T",2500,"趟"],
  ["店配模式","彰化<->台中","8.5T",3000,"趟"],
  ["店配模式","彰化<->彰化","11T",3500,"趟"],
  ["店配模式","彰化<->彰化","6.2T",2500,"趟"],
  ["店配模式","彰化<->彰化","8.5T",3000,"趟"],
  ["店配模式","桃園<->台中","11T",7000,"趟"],
  ["店配模式","桃園<->台中","6.2T",4870,"趟"],
  ["店配模式","桃園<->台中","8.5T",5800,"趟"],
  ["店配模式","桃園<->基隆","11T",4340,"趟"],
  ["店配模式","桃園<->基隆","6.2T",3160,"趟"],
  ["店配模式","桃園<->基隆","8.5T",3710,"趟"],
  ["店配模式","桃園<->宜蘭","6.2T",4800,"趟"],
  ["店配模式","桃園<->新竹","11T",4230,"趟"],
  ["店配模式","桃園<->新竹","6.2T",3060,"趟"],
  ["店配模式","桃園<->新竹","8.5T",3600,"趟"],
  ["店配模式","桃園<->桃園市","11T",3600,"趟"],
  ["店配模式","桃園<->桃園市","6.2T",2620,"趟"],
  ["店配模式","桃園<->桃園市","8.5T",3100,"趟"],
  ["店配模式","桃園<->苗栗","11T",5200,"趟"],
  ["店配模式","桃園<->苗栗","6.2T",3700,"趟"],
  ["店配模式","桃園<->苗栗","8.5T",4300,"趟"],
  ["店配模式","桃園<->雙北地區","11T",4100,"趟"],
  ["店配模式","桃園<->雙北地區","6.2T",2830,"趟"],
  ["店配模式","桃園<->雙北地區","8.5T",3400,"趟"],
  ["賣家上收","嘉義<->北屏東","11T",5390,"趟"],
  ["賣家上收","嘉義<->北屏東","17T",5750,"趟"],
  ["賣家上收","嘉義<->北屏東","26T",6620,"趟"],
  ["賣家上收","嘉義<->北屏東","8.5T",4890,"趟"],
  ["賣家上收","嘉義<->南屏東","11T",5540,"趟"],
  ["賣家上收","嘉義<->南屏東","17T",5920,"趟"],
  ["賣家上收","嘉義<->南屏東","26T",6820,"趟"],
  ["賣家上收","嘉義<->南屏東","8.5T",5030,"趟"],
  ["賣家上收","嘉義<->南投","11T",4310,"趟"],
  ["賣家上收","嘉義<->南投","17T",4540,"趟"],
  ["賣家上收","嘉義<->南投","26T",5050,"趟"],
  ["賣家上收","嘉義<->南投","8.5T",3870,"趟"],
  ["賣家上收","嘉義<->台南","11T",3880,"趟"],
  ["賣家上收","嘉義<->台南","17T",4140,"趟"],
  ["賣家上收","嘉義<->台南","26T",4700,"趟"],
  ["賣家上收","嘉義<->台南","8.5T",3520,"趟"],
  ["賣家上收","嘉義<->嘉義","11T",2890,"趟"],
  ["賣家上收","嘉義<->嘉義","17T",3210,"趟"],
  ["賣家上收","嘉義<->嘉義","26T",3650,"趟"],
  ["賣家上收","嘉義<->嘉義","8.5T",2580,"趟"],
  ["賣家上收","嘉義<->彰化","11T",4540,"趟"],
  ["賣家上收","嘉義<->彰化","17T",5040,"趟"],
  ["賣家上收","嘉義<->彰化","26T",5810,"趟"],
  ["賣家上收","嘉義<->彰化","8.5T",4150,"趟"],
  ["賣家上收","嘉義<->雲林","11T",3640,"趟"],
  ["賣家上收","嘉義<->雲林","17T",3810,"趟"],
  ["賣家上收","嘉義<->雲林","26T",4290,"趟"],
  ["賣家上收","嘉義<->雲林","8.5T",3310,"趟"],
  ["賣家上收","嘉義<->高雄","11T",5040,"趟"],
  ["賣家上收","嘉義<->高雄","17T",5540,"趟"],
  ["賣家上收","嘉義<->高雄","26T",6450,"趟"],
  ["賣家上收","嘉義<->高雄","8.5T",4490,"趟"],
  ["賣家上收","彰化<->北台中","11T",3640,"趟"],
  ["賣家上收","彰化<->北台中","17T",3830,"趟"],
  ["賣家上收","彰化<->北台中","26T",4350,"趟"],
  ["賣家上收","彰化<->北台中","8.5T",3290,"趟"],
  ["賣家上收","彰化<->南投","11T",3640,"趟"],
  ["賣家上收","彰化<->南投","17T",3830,"趟"],
  ["賣家上收","彰化<->南投","26T",4350,"趟"],
  ["賣家上收","彰化<->南投","8.5T",3290,"趟"],
  ["賣家上收","彰化<->台中","11T",3140,"趟"],
  ["賣家上收","彰化<->台中","17T",3290,"趟"],
  ["賣家上收","彰化<->台中","26T",3670,"趟"],
  ["賣家上收","彰化<->台中","8.5T",2820,"趟"],
  ["賣家上收","彰化<->彰化","11T",3140,"趟"],
  ["賣家上收","彰化<->彰化","17T",3290,"趟"],
  ["賣家上收","彰化<->彰化","26T",3670,"趟"],
  ["賣家上收","彰化<->彰化","8.5T",2820,"趟"],
  ["賣家上收","桃園<->台中","11T",4950,"趟"],
  ["賣家上收","桃園<->台中","17T",5540,"趟"],
  ["賣家上收","桃園<->台中","26T",5290,"趟"],
  ["賣家上收","桃園<->台中","8.5T",4300,"趟"],
  ["賣家上收","桃園<->基隆","11T",3560,"趟"],
  ["賣家上收","桃園<->基隆","17T",3720,"趟"],
  ["賣家上收","桃園<->基隆","26T",4380,"趟"],
  ["賣家上收","桃園<->基隆","8.5T",3140,"趟"],
  ["賣家上收","桃園<->新竹縣市","11T",3310,"趟"],
  ["賣家上收","桃園<->新竹縣市","17T",3430,"趟"],
  ["賣家上收","桃園<->新竹縣市","26T",3970,"趟"],
  ["賣家上收","桃園<->新竹縣市","8.5T",2890,"趟"],
  ["賣家上收","桃園<->桃園市","11T",1860,"趟"],
  ["賣家上收","桃園<->桃園市","17T",2070,"趟"],
  ["賣家上收","桃園<->桃園市","26T",2340,"趟"],
  ["賣家上收","桃園<->桃園市","8.5T",1620,"趟"],
  ["賣家上收","桃園<->苗栗","11T",3970,"趟"],
  ["賣家上收","桃園<->苗栗","17T",4140,"趟"],
  ["賣家上收","桃園<->苗栗","26T",4550,"趟"],
  ["賣家上收","桃園<->苗栗","8.5T",3560,"趟"],
  ["賣家上收","桃園<->雙北地區","11T",2670,"趟"],
  ["賣家上收","桃園<->雙北地區","17T",3400,"趟"],
  ["賣家上收","桃園<->雙北地區","26T",4130,"趟"],
  ["賣家上收","桃園<->雙北地區","8.5T",2430,"趟"],
  ["轉運車-包時","EVA倉1F-3F(來回)","11T",650,"小時"],
  ["轉運車-包時","EVA倉1F-3F(來回)","17T",900,"小時"],
  ["轉運車-包時","EVA倉1F-3F(來回)","8.5T",450,"小時"],
  ["轉運車-包時","倉庫大件各內轉移","11T",650,"小時"],
  ["轉運車-包時","倉庫大件各內轉移","17T",800,"小時"],
  ["轉運車-包時","倉庫大件各內轉移","8.5T",450,"小時"],
  ["轉運車-包時","桃園倉<->全省","11T",800,"小時"],
  ["轉運車-包時","桃園倉<->全省","17T",1000,"小時"],
  ["轉運車-包時","桃園倉<->全省","26T",1150,"小時"],
  ["轉運車-包時","桃園倉<->全省","8.5T",450,"小時"],
  ["轉運車-趟次","嘉義<->彰化","11T",4000,"趟"],
  ["轉運車-趟次","嘉義<->彰化","17T",5300,"趟"],
  ["轉運車-趟次","嘉義<->彰化","26T",6600,"趟"],
  ["轉運車-趟次","嘉義<->彰化","8.5T",3750,"趟"],
  ["轉運車-趟次","桃園<->嘉義","11T",7500,"趟"],
  ["轉運車-趟次","桃園<->嘉義","17T",10350,"趟"],
  ["轉運車-趟次","桃園<->嘉義","26T",12600,"趟"],
  ["轉運車-趟次","桃園<->嘉義","8.5T",7000,"趟"],
  ["轉運車-趟次","桃園<->彰化","11T",6000,"趟"],
  ["轉運車-趟次","桃園<->彰化","17T",8200,"趟"],
  ["轉運車-趟次","桃園<->彰化","26T",10000,"趟"],
  ["轉運車-趟次","桃園<->彰化","8.5T",5600,"趟"],
  ["轉運車-趟次","桃園<->桃園","11T",2300,"趟"],
  ["轉運車-趟次","桃園<->桃園","17T",2300,"趟"],
  ["轉運車-趟次","桃園<->桃園","26T",2900,"趟"],
  ["轉運車-趟次","桃園<->桃園","8.5T",2000,"趟"],
];

export async function ensureRateTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_rate_cards (
      id           SERIAL PRIMARY KEY,
      service_type TEXT    NOT NULL,
      route        TEXT    NOT NULL,
      vehicle_type TEXT    NOT NULL,
      unit_price   INTEGER,
      price_unit   TEXT    DEFAULT '趟',
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT NOW(),
      effective_month TEXT,
      version_tag  TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_sync_configs (
      id               SERIAL PRIMARY KEY,
      name             TEXT    NOT NULL,
      sheet_url        TEXT    NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      import_mode      TEXT    NOT NULL DEFAULT 'merge',
      effective_month  TEXT,
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      last_sync_at     TIMESTAMPTZ,
      last_sync_result JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_sync_logs (
      id         SERIAL PRIMARY KEY,
      config_id  INTEGER NOT NULL,
      synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      inserted   INTEGER NOT NULL DEFAULT 0,
      updated    INTEGER NOT NULL DEFAULT 0,
      errors     INTEGER NOT NULL DEFAULT 0,
      warnings   INTEGER NOT NULL DEFAULT 0,
      detail     JSONB
    )
  `);

  const { rowCount } = await pool.query(
    `UPDATE shopee_rate_cards SET route = REPLACE(route, '楠梅', '桃園') WHERE route LIKE '楠梅%'`
  );
  if ((rowCount ?? 0) > 0) console.log(`[RateSync] corrected ${rowCount} '楠梅' routes → '桃園'`);

  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS n FROM shopee_rate_cards`);
  const count = parseInt(countRows[0].n, 10);
  if (count === 0 && SEED_RATES.length > 0) {
    const values = SEED_RATES.map(
      (_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`
    ).join(",");
    const params = SEED_RATES.flatMap(([st, ro, vt, up, pu]) => [st, ro, vt, up, pu]);
    await pool.query(
      `INSERT INTO shopee_rate_cards (service_type, route, vehicle_type, unit_price, price_unit)
       VALUES ${values}`,
      params
    );
    console.log(`[RateSync] seeded ${SEED_RATES.length} default rate cards`);
  }

  console.log("[RateSync] tables ensured");
}

function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

rateSyncRouter.get("/rate-sync", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, sheet_url, interval_minutes, import_mode, effective_month,
            is_active, last_sync_at, last_sync_result, created_at
     FROM rate_sync_configs ORDER BY id`
  );
  res.json({ ok: true, configs: rows });
});

rateSyncRouter.post("/rate-sync", async (req, res) => {
  const {
    name, sheet_url,
    interval_minutes = 60,
    import_mode = "merge",
    effective_month = null,
    is_active = true,
  } = req.body ?? {};
  if (!name || !sheet_url) {
    return res.status(400).json({ error: "name 和 sheet_url 為必填" });
  }
  const { rows } = await pool.query(
    `INSERT INTO rate_sync_configs
       (name, sheet_url, interval_minutes, import_mode, effective_month, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, sheet_url, interval_minutes, import_mode, effective_month, is_active]
  );
  res.status(201).json({ ok: true, config: rows[0] });
});

rateSyncRouter.patch("/rate-sync/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["name", "sheet_url", "interval_minutes", "import_mode", "effective_month", "is_active"];
  const updates: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (vals.length === 0) return res.status(400).json({ error: "沒有要更新的欄位" });
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE rate_sync_configs SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });
  res.json({ ok: true, config: rows[0] });
});

rateSyncRouter.delete("/rate-sync/:id", async (req, res) => {
  await pool.query("DELETE FROM rate_sync_configs WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

rateSyncRouter.post("/rate-sync/:id/run", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query("SELECT * FROM rate_sync_configs WHERE id = $1", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });
  const cfg = rows[0];
  try {
    const result = await runRateSync(cfg, toCsvUrl(cfg.sheet_url));
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

rateSyncRouter.get("/rate-sync/:id/logs", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, synced_at, inserted, updated, errors, warnings, detail
     FROM rate_sync_logs WHERE config_id = $1 ORDER BY synced_at DESC LIMIT 30`,
    [id]
  );
  res.json({ ok: true, logs: rows });
});
