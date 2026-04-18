import express, { type Express, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startAlertScheduler } from "./lib/alertScheduler";
import { startWeeklyReportScheduler } from "./lib/weeklyReportScheduler";
import { startSheetSyncScheduler } from "./lib/sheetSyncScheduler";
import { ensureSheetSyncTable } from "./routes/sheetSync";
import { ensurePenaltySyncTables, startPenaltySyncScheduler } from "./routes/penaltySync";
import { startRateSyncScheduler } from "./lib/rateSyncScheduler";
import { ensureRateTables } from "./routes/rateSync";
import { ensureShopeeDriversTable } from "./routes/shopeeDrivers";
import { ensureShopeeScheduleTables, importShopeeScheduleFromExcel } from "./routes/shopeeSchedules";
import { ensureDispatchOrdersTable } from "./routes/dispatchOrders";
import { ensureScheduleTables } from "./routes/fusingaoScheduleImport";
import { ensureBillingDetailTables } from "./routes/fusingaoBillingDetailImport";
import { ensureFusingaoSheetSyncTables, startFusingaoSheetSyncScheduler } from "./routes/fusingaoSheetSync";
import { ensureFleetSheetSyncTables, startFleetSheetSyncScheduler } from "./lib/fleetSheetSync";
import { ensureDbIndexes } from "./lib/dbIndexes";
import { ensureCreditSchema } from "./routes/line.js";
import { ensureVehicleProfitTables } from "./routes/vehicleProfit";
import { ensureLaborPensionTables } from "./routes/laborPension";
import { ensurePayrollCostTables } from "./routes/payrollCost";
import { pool as _migPool, db } from "@workspace/db";
import { sql } from "drizzle-orm";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

app.use("/api/line/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

startAlertScheduler();
startWeeklyReportScheduler();

// ── 訂單資料結構正規化遷移（冪等，只補空值）────────────────────────────
async function runOrdersColumnMigration() {
  // 0. 確保福興高派車相關欄位存在
  const fusingaoOrderCols = [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_id TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_prefix TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS station_count INTEGER`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatch_dock TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopee_driver_id TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fusingao_fleet_id INTEGER`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_grabbed_at TIMESTAMPTZ`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_completed_at TIMESTAMPTZ`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type TEXT`,
  ];
  for (const s of fusingaoOrderCols) {
    try { await _migPool.query(s); } catch { /* already exists */ }
  }

  // 1. 補 vehicle_type 欄位（若不存在）
  await _migPool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_type TEXT`);

  // 2. 從 required_vehicle_type 回填 vehicle_type（NULL 才補）
  await _migPool.query(`
    UPDATE orders
    SET vehicle_type = required_vehicle_type
    WHERE vehicle_type IS NULL AND required_vehicle_type IS NOT NULL
  `);

  // 3. 從 notes 解析出 route_id / route_prefix / station_count / dispatch_dock
  //    僅對 notes 像「路線：xxx」且對應欄位為 NULL 的舊資料作業
  //    用 regexp_match（PostgreSQL）— 每欄獨立 UPDATE 避免一欄失敗整批中斷
  try {
    await _migPool.query(`
      UPDATE orders
      SET route_id = (regexp_match(notes, '路線：([^｜\\s]+)'))[1]
      WHERE route_id IS NULL
        AND notes IS NOT NULL
        AND notes ~ '路線：'
    `);
  } catch (e) { console.warn("[OrderMigration] route_id backfill:", String(e).slice(0, 120)); }

  try {
    await _migPool.query(`
      UPDATE orders
      SET route_prefix = (regexp_match(notes, '路線：([A-Z0-9]+)-'))[1]
      WHERE route_prefix IS NULL
        AND notes IS NOT NULL
        AND notes ~ '路線：[A-Z0-9]+-'
    `);
  } catch (e) { console.warn("[OrderMigration] route_prefix backfill:", String(e).slice(0, 120)); }

  try {
    await _migPool.query(`
      UPDATE orders
      SET station_count = ((regexp_match(notes, '共 (\\d+) 站'))[1])::integer
      WHERE station_count IS NULL
        AND notes IS NOT NULL
        AND notes ~ '共 \\d+ 站'
    `);
  } catch (e) { console.warn("[OrderMigration] station_count backfill:", String(e).slice(0, 120)); }

  try {
    await _migPool.query(`
      UPDATE orders
      SET dispatch_dock = (regexp_match(notes, '碼頭：([^｜\\s]+)'))[1]
      WHERE dispatch_dock IS NULL
        AND notes IS NOT NULL
        AND notes ~ '碼頭：'
    `);
  } catch (e) { console.warn("[OrderMigration] dispatch_dock backfill:", String(e).slice(0, 120)); }

  // 4. 確保 source_channel 從 source 欄位回填（相容舊格式）
  try {
    await _migPool.query(`
      UPDATE orders
      SET source_channel = source
      WHERE source_channel IS NULL AND source IS NOT NULL
    `);
  } catch (e) { console.warn("[OrderMigration] source_channel backfill:", String(e).slice(0, 120)); }

  // 5. 加入 is_cold_chain 欄位（冷鏈標記）
  try {
    await _migPool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_cold_chain BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (e) { console.warn("[OrderMigration] is_cold_chain column:", String(e).slice(0, 120)); }

  // 6. 同步 order_status TMS 生命週期（pending→pending, assigned→accepted,
  //    in_transit/picking→picking, delivered→delivered, cancelled→cancelled）
  try {
    await _migPool.query(`
      UPDATE orders
      SET order_status = CASE
        WHEN status = 'pending'    THEN 'pending'
        WHEN status = 'assigned'   THEN 'accepted'
        WHEN status IN ('in_transit', 'picking') THEN 'picking'
        WHEN status = 'delivered'  THEN 'delivered'
        WHEN status = 'cancelled'  THEN 'cancelled'
        ELSE status
      END
      WHERE order_status IS NULL AND status IS NOT NULL
    `);
  } catch (e) { console.warn("[OrderMigration] order_status backfill:", String(e).slice(0, 120)); }

  // 7. 移除舊 NOT NULL 限制（允許建立不完整訂單）
  const dropNotNull = [
    "ALTER TABLE orders ALTER COLUMN customer_phone DROP NOT NULL",
    "ALTER TABLE orders ALTER COLUMN cargo_description DROP NOT NULL",
  ];
  for (const q of dropNotNull) {
    try { await _migPool.query(q); } catch (_) { /* 已是 nullable，忽略 */ }
  }

  console.log("[OrderMigration] orders column migration complete");
}

runOrdersColumnMigration().catch(e => console.error("[OrderMigration] failed:", e));

ensureDbIndexes().catch((e) => console.error("[dbIndexes] Failed:", e));
ensureCreditSchema().catch((e) => console.error("[DriverCredit] Failed:", e));
ensureSheetSyncTable()
  .then(() => startSheetSyncScheduler())
  .catch((e) => console.error("[SheetSync] table setup failed:", e));
ensurePenaltySyncTables()
  .then(() => startPenaltySyncScheduler())
  .catch((e) => console.error("[PenaltySync] table setup failed:", e));
ensureRateTables()
  .then(() => startRateSyncScheduler())
  .catch((e) => console.error("[RateSync] table setup failed:", e));
ensureShopeeDriversTable().catch((e) => console.error("[ShopeeDrivers] table setup failed:", e));
ensureVehicleProfitTables().catch((e) => console.error("[VehicleProfit] table setup failed:", e));
ensureLaborPensionTables().catch((e) => console.error("[LaborPension] table setup failed:", e));
ensurePayrollCostTables().catch((e) => console.error("[PayrollCost] table setup failed:", e));
ensureShopeeScheduleTables()
  .then(async () => {
    const { rows } = await _migPool.query(`SELECT COUNT(*) FROM shopee_week_routes`).catch(() => ({ rows: [{ count: "0" }] }));
    if (Number(rows[0].count) === 0) {
      const excelPath = require("path").resolve(process.cwd(), "../../attached_assets/福星高x富詠_-_蝦皮北倉班表_1776495896584.xlsx");
      await importShopeeScheduleFromExcel(excelPath).catch((e) => console.error("[ShopeeSchedule] 首次匯入失敗:", e));
    }
  })
  .catch((e) => console.error("[ShopeeSchedule] table setup failed:", e));
ensureDispatchOrdersTable().catch((e) => console.error("[DispatchOrders] table setup failed:", e));
ensureScheduleTables().catch((e) => console.error("[ScheduleTables] setup failed:", e));
ensureBillingDetailTables().catch((e) => console.error("[BillingDetailTables] setup failed:", e));
ensureFusingaoSheetSyncTables()
  .then(() => startFusingaoSheetSyncScheduler())
  .catch((e) => console.error("[FusingaoSheetSync] setup failed:", e));
ensureFleetSheetSyncTables()
  .then(() => startFleetSheetSyncScheduler())
  .catch((e) => console.error("[FleetSheetSync] setup failed:", e));

// 確保 drivers.is_active 欄位存在（離職狀態管理）
_migPool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`)
  .then(() => console.log("[DriverActive] is_active 欄位已確認"))
  .catch(e => console.warn("[DriverActive] 欄位確認失敗:", String(e).slice(0, 120)));

// 確保 drivers.line_binding_token / line_token_expires_at 欄位存在（LINE 綁定碼機制）
_migPool.query(`
  ALTER TABLE drivers
    ADD COLUMN IF NOT EXISTS line_binding_token      VARCHAR(10),
    ADD COLUMN IF NOT EXISTS line_token_expires_at   TIMESTAMPTZ
`).then(() => console.log("[LineBindingToken] 欄位已確認"))
  .catch(e => console.warn("[LineBindingToken] 欄位確認失敗:", String(e).slice(0, 120)));

// 清除格式錯誤的 LINE User ID（如填入電話號碼者）
// 有效 LINE User ID 格式：U + 32 hex 字元（共 33 字元）
_migPool.query(`
  UPDATE drivers
  SET line_user_id = NULL
  WHERE line_user_id IS NOT NULL
    AND (
      LENGTH(line_user_id) <> 33
      OR line_user_id NOT SIMILAR TO 'U[0-9a-f]{32}'
    )
`).then(async (r) => {
  if (r.rowCount && r.rowCount > 0)
    console.log(`[LineIDCleanup] 已清除 ${r.rowCount} 筆格式錯誤的 LINE User ID（例：填入電話號碼）`);

  // 清除重複的 LINE User ID（保留最早綁定的那筆，其餘清空）
  const dupResult = await _migPool.query(`
    UPDATE drivers d
    SET line_user_id = NULL
    WHERE line_user_id IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id) FROM drivers WHERE line_user_id IS NOT NULL GROUP BY line_user_id
      )
  `);
  if (dupResult.rowCount && dupResult.rowCount > 0)
    console.log(`[LineIDCleanup] 已清除 ${dupResult.rowCount} 筆重複的 LINE User ID（保留最早綁定者）`);

  // 建立唯一索引，防止未來重複綁定（CREATE IF NOT EXISTS 不影響已存在的索引）
  await _migPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drivers_line_user_id_unique
    ON drivers (line_user_id)
    WHERE line_user_id IS NOT NULL
  `);
  console.log("[LineIDCleanup] drivers.line_user_id 唯一索引已確認");
}).catch(e => console.warn("[LineIDCleanup] failed:", String(e).slice(0, 200)));

// ── 自動將 ATOMS_WEBHOOK_URL 環境變數註冊進 webhooks 表 ──────────────────────
(async () => {
  const atomsUrl = process.env.ATOMS_WEBHOOK_URL;
  if (!atomsUrl) return;
  try {
    const existing = await db.execute(sql`
      SELECT id FROM webhooks WHERE url = ${atomsUrl} LIMIT 1
    `);
    if (existing.rows.length > 0) {
      console.log("[AtomsWebhook] 已登錄，跳過建立");
      return;
    }
    await db.execute(sql`
      INSERT INTO webhooks (name, url, events, note, status)
      VALUES (
        'Atoms 派單系統',
        ${atomsUrl},
        ARRAY['order.assigned']::text[],
        '自動由 ATOMS_WEBHOOK_URL 環境變數建立',
        'active'
      )
    `);
    console.log(`[AtomsWebhook] ✅ 已自動登錄：${atomsUrl}`);
  } catch (e) {
    console.warn("[AtomsWebhook] 登錄失敗：", String(e).slice(0, 200));
  }
})();

// ── 建立報價單維護資料表 ──────────────────────────────────────────────────────
(async () => {
  try {
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS customer_contract_quotes (
        id             SERIAL PRIMARY KEY,
        quote_no       VARCHAR(30) UNIQUE NOT NULL,
        customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name  VARCHAR(100),
        title          VARCHAR(200) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'draft',
        valid_from     DATE,
        valid_to       DATE,
        contact_person VARCHAR(50),
        contact_phone  VARCHAR(30),
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // ── 報價單欄位擴充 (Glory 對齊) ─────────────────────────────────────────
    for (const col of [
      "ADD COLUMN IF NOT EXISTS quote_date DATE",
      "ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR(50)",
      "ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ",
      "ADD COLUMN IF NOT EXISTS created_by VARCHAR(50)",
      "ADD COLUMN IF NOT EXISTS updated_by VARCHAR(50)",
    ]) {
      await _migPool.query(`ALTER TABLE customer_contract_quotes ${col}`).catch(() => {});
    }
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS customer_contract_quote_items (
        id           SERIAL PRIMARY KEY,
        quote_id     INTEGER NOT NULL REFERENCES customer_contract_quotes(id) ON DELETE CASCADE,
        route_from   VARCHAR(100),
        route_to     VARCHAR(100),
        vehicle_type VARCHAR(50),
        cargo_type   VARCHAR(100),
        unit         VARCHAR(20) NOT NULL DEFAULT 'per_trip',
        unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_charge   NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes        VARCHAR(200),
        sort_order   INTEGER NOT NULL DEFAULT 0
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        short_name      VARCHAR(30),
        tax_id          VARCHAR(20),
        contact_person  VARCHAR(50),
        contact_phone   VARCHAR(30),
        contact_email   VARCHAR(100),
        address         VARCHAR(200),
        vehicle_types   VARCHAR(200),
        service_regions VARCHAR(200),
        payment_terms   VARCHAR(100),
        bank_name       VARCHAR(50),
        bank_account    VARCHAR(30),
        status          VARCHAR(20) NOT NULL DEFAULT 'active',
        category        VARCHAR(50),
        commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[ContractQuotes] tables ensured");
  } catch (e) {
    console.warn("[ContractQuotes] table ensure failed:", String(e).slice(0, 200));
  }
})();

// ── 車輛管理、油料、司機獎金、鄉鎮市區 資料表 ──────────────────────────────────
(async () => {
  try {
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id            SERIAL PRIMARY KEY,
        plate_no      VARCHAR(20) NOT NULL,
        vehicle_type  VARCHAR(30),
        brand         VARCHAR(50),
        model         VARCHAR(50),
        year          INTEGER,
        color         VARCHAR(20),
        vin           VARCHAR(50),
        engine_no     VARCHAR(50),
        gross_weight  NUMERIC(8,2),
        owner_name    VARCHAR(50),
        owner_id      VARCHAR(20),
        assigned_driver VARCHAR(50),
        fleet_id      INTEGER,
        status        VARCHAR(20) NOT NULL DEFAULT 'active',
        purchase_date DATE,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_tax (
        id          SERIAL PRIMARY KEY,
        vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        tax_year    INTEGER NOT NULL,
        tax_type    VARCHAR(30) NOT NULL DEFAULT '牌照稅',
        amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_date    DATE,
        paid_date   DATE,
        paid_amount NUMERIC(12,2),
        receipt_no  VARCHAR(50),
        status      VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        notes       VARCHAR(200),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_insurance (
        id               SERIAL PRIMARY KEY,
        vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        insurance_type   VARCHAR(30) NOT NULL DEFAULT '強制險',
        insurer          VARCHAR(50),
        policy_no        VARCHAR(50),
        start_date       DATE,
        end_date         DATE,
        premium          NUMERIC(12,2),
        coverage_amount  NUMERIC(14,2),
        agent_name       VARCHAR(30),
        agent_phone      VARCHAR(20),
        status           VARCHAR(20) NOT NULL DEFAULT 'active',
        notes            VARCHAR(200),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_etag (
        id          SERIAL PRIMARY KEY,
        vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        etag_no     VARCHAR(30) NOT NULL,
        bind_date   DATE,
        status      VARCHAR(20) NOT NULL DEFAULT 'active',
        notes       VARCHAR(200),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // ── 車輛資料擴充欄位 (Glory 欄位對齊) ──────────────────────────────────────
    for (const col of [
      "ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(20)",
      "ADD COLUMN IF NOT EXISTS branch_company VARCHAR(50)",
      "ADD COLUMN IF NOT EXISTS driver_code VARCHAR(20)",
      "ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(50)",
      "ADD COLUMN IF NOT EXISTS vehicle_model_type VARCHAR(30)",
      "ADD COLUMN IF NOT EXISTS mfg_month INTEGER",
      "ADD COLUMN IF NOT EXISTS empty_weight_kg NUMERIC(10,2)",
      "ADD COLUMN IF NOT EXISTS max_load_kg NUMERIC(10,2)",
      "ADD COLUMN IF NOT EXISTS max_cubic_feet INTEGER",
      "ADD COLUMN IF NOT EXISTS max_pallets INTEGER",
      "ADD COLUMN IF NOT EXISTS is_legal_id CHAR(1) DEFAULT 'Y'",
      "ADD COLUMN IF NOT EXISTS inner_length_cm INTEGER",
      "ADD COLUMN IF NOT EXISTS inner_width_cm INTEGER",
      "ADD COLUMN IF NOT EXISTS inner_height_cm INTEGER",
      "ADD COLUMN IF NOT EXISTS lift_height_cm INTEGER",
      "ADD COLUMN IF NOT EXISTS tire_size VARCHAR(30)",
      "ADD COLUMN IF NOT EXISTS engine_cc INTEGER",
      "ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20)",
      "ADD COLUMN IF NOT EXISTS gps_vendor VARCHAR(50)",
      "ADD COLUMN IF NOT EXISTS gps_cost NUMERIC(10,2)",
      "ADD COLUMN IF NOT EXISTS sim_no VARCHAR(30)",
      "ADD COLUMN IF NOT EXISTS sub_vehicle_code VARCHAR(20)",
      "ADD COLUMN IF NOT EXISTS weighing_count INTEGER DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS insurance_km INTEGER",
      "ADD COLUMN IF NOT EXISTS next_maintenance_km INTEGER",
      "ADD COLUMN IF NOT EXISTS fuel_consumption NUMERIC(8,2)",
      "ADD COLUMN IF NOT EXISTS license_issue_date DATE",
      "ADD COLUMN IF NOT EXISTS deregister_date DATE",
      "ADD COLUMN IF NOT EXISTS dealer_sponsor_date DATE",
      "ADD COLUMN IF NOT EXISTS per_trip_fee NUMERIC(10,2)",
      "ADD COLUMN IF NOT EXISTS gate_type VARCHAR(20)",
    ]) {
      await _migPool.query(`ALTER TABLE vehicles ${col}`).catch(() => {});
    }
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS fuel_records (
        id             SERIAL PRIMARY KEY,
        vehicle_id     INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        plate_no       VARCHAR(20),
        fuel_date      DATE NOT NULL,
        fuel_type      VARCHAR(20) NOT NULL DEFAULT '柴油',
        liters         NUMERIC(8,2) NOT NULL DEFAULT 0,
        unit_price     NUMERIC(8,2) NOT NULL DEFAULT 0,
        total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
        mileage        INTEGER,
        station_name   VARCHAR(50),
        driver_name    VARCHAR(30),
        receipt_no     VARCHAR(30),
        notes          VARCHAR(200),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS driver_bonus (
        id           SERIAL PRIMARY KEY,
        driver_name  VARCHAR(50) NOT NULL,
        driver_id    INTEGER,
        bonus_date   DATE NOT NULL,
        bonus_type   VARCHAR(50) NOT NULL DEFAULT '績效獎金',
        amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
        reason       VARCHAR(200),
        status       VARCHAR(20) NOT NULL DEFAULT 'pending',
        paid_date    DATE,
        notes        VARCHAR(200),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS townships (
        id          SERIAL PRIMARY KEY,
        county      VARCHAR(20) NOT NULL,
        district    VARCHAR(20) NOT NULL,
        zip_code    VARCHAR(10),
        UNIQUE(county, district)
      )
    `);
    // Pre-populate Taiwan townships if empty
    const cnt = await _migPool.query(`SELECT COUNT(*) FROM townships`);
    if (parseInt(cnt.rows[0].count) === 0) {
      const twData = [
        ["台北市","中正區","100"],["台北市","大同區","103"],["台北市","中山區","104"],
        ["台北市","松山區","105"],["台北市","大安區","106"],["台北市","萬華區","108"],
        ["台北市","信義區","110"],["台北市","士林區","111"],["台北市","北投區","112"],
        ["台北市","內湖區","114"],["台北市","南港區","115"],["台北市","文山區","116"],
        ["新北市","板橋區","220"],["新北市","三重區","241"],["新北市","中和區","235"],
        ["新北市","永和區","234"],["新北市","新莊區","242"],["新北市","新店區","231"],
        ["新北市","樹林區","238"],["新北市","鶯歌區","239"],["新北市","三峽區","237"],
        ["新北市","淡水區","251"],["新北市","汐止區","221"],["新北市","瑞芳區","224"],
        ["新北市","土城區","236"],["新北市","蘆洲區","247"],["新北市","五股區","248"],
        ["新北市","泰山區","243"],["新北市","林口區","244"],["新北市","深坑區","222"],
        ["新北市","石碇區","223"],["新北市","坪林區","232"],["新北市","三芝區","252"],
        ["新北市","石門區","253"],["新北市","八里區","249"],["新北市","平溪區","226"],
        ["新北市","雙溪區","227"],["新北市","貢寮區","228"],["新北市","金山區","208"],
        ["新北市","萬里區","207"],["新北市","烏來區","233"],
        ["桃園市","桃園區","330"],["桃園市","中壢區","320"],["桃園市","大溪區","335"],
        ["桃園市","楊梅區","326"],["桃園市","蘆竹區","338"],["桃園市","大園區","337"],
        ["桃園市","龜山區","333"],["桃園市","八德區","334"],["桃園市","龍潭區","325"],
        ["桃園市","平鎮區","324"],["桃園市","新屋區","327"],["桃園市","觀音區","328"],
        ["桃園市","復興區","336"],
        ["台中市","中區","400"],["台中市","東區","401"],["台中市","南區","402"],
        ["台中市","西區","403"],["台中市","北區","404"],["台中市","北屯區","406"],
        ["台中市","西屯區","407"],["台中市","南屯區","408"],["台中市","太平區","411"],
        ["台中市","大里區","412"],["台中市","霧峰區","413"],["台中市","烏日區","414"],
        ["台中市","豐原區","420"],["台中市","后里區","421"],["台中市","石岡區","422"],
        ["台中市","東勢區","423"],["台中市","和平區","424"],["台中市","新社區","426"],
        ["台中市","潭子區","427"],["台中市","大雅區","428"],["台中市","神岡區","429"],
        ["台中市","大肚區","432"],["台中市","沙鹿區","433"],["台中市","龍井區","434"],
        ["台中市","梧棲區","435"],["台中市","清水區","436"],["台中市","大甲區","437"],
        ["台中市","外埔區","438"],["台中市","大安區","439"],
        ["台南市","中西區","700"],["台南市","東區","701"],["台南市","南區","702"],
        ["台南市","北區","704"],["台南市","安平區","708"],["台南市","安南區","709"],
        ["台南市","永康區","710"],["台南市","歸仁區","711"],["台南市","新化區","712"],
        ["台南市","左鎮區","713"],["台南市","玉井區","714"],["台南市","楠西區","715"],
        ["台南市","南化區","716"],["台南市","仁德區","717"],["台南市","關廟區","718"],
        ["台南市","龍崎區","719"],["台南市","官田區","720"],["台南市","麻豆區","721"],
        ["台南市","佳里區","722"],["台南市","西港區","723"],["台南市","七股區","724"],
        ["台南市","將軍區","725"],["台南市","學甲區","726"],["台南市","北門區","727"],
        ["台南市","新營區","730"],["台南市","後壁區","731"],["台南市","白河區","732"],
        ["台南市","東山區","733"],["台南市","六甲區","734"],["台南市","下營區","735"],
        ["台南市","柳營區","736"],["台南市","鹽水區","737"],["台南市","善化區","741"],
        ["台南市","大內區","742"],["台南市","山上區","743"],["台南市","新市區","744"],
        ["台南市","安定區","745"],
        ["高雄市","新興區","800"],["高雄市","前金區","801"],["高雄市","苓雅區","802"],
        ["高雄市","鹽埕區","803"],["高雄市","鼓山區","804"],["高雄市","旗津區","805"],
        ["高雄市","前鎮區","806"],["高雄市","三民區","807"],["高雄市","楠梓區","811"],
        ["高雄市","小港區","812"],["高雄市","左營區","813"],["高雄市","仁武區","814"],
        ["高雄市","大社區","815"],["高雄市","東沙群島","817"],["高雄市","南沙群島","819"],
        ["高雄市","岡山區","820"],["高雄市","路竹區","821"],["高雄市","阿蓮區","822"],
        ["高雄市","田寮區","823"],["高雄市","燕巢區","824"],["高雄市","橋頭區","825"],
        ["高雄市","梓官區","826"],["高雄市","彌陀區","827"],["高雄市","永安區","828"],
        ["高雄市","湖內區","829"],["高雄市","鳳山區","830"],["高雄市","大寮區","831"],
        ["高雄市","林園區","832"],["高雄市","鳥松區","833"],["高雄市","大樹區","840"],
        ["高雄市","旗山區","842"],["高雄市","美濃區","843"],["高雄市","六龜區","844"],
        ["高雄市","內門區","845"],["高雄市","杉林區","846"],["高雄市","甲仙區","847"],
        ["高雄市","桃源區","848"],["高雄市","那瑪夏區","849"],["高雄市","茂林區","851"],
        ["高雄市","茄萣區","852"],
        ["基隆市","仁愛區","200"],["基隆市","信義區","201"],["基隆市","中正區","202"],
        ["基隆市","中山區","203"],["基隆市","安樂區","204"],["基隆市","暖暖區","205"],
        ["基隆市","七堵區","206"],
        ["新竹市","東區","300"],["新竹市","北區","300"],["新竹市","香山區","300"],
        ["新竹縣","竹北市","302"],["新竹縣","湖口鄉","303"],["新竹縣","新豐鄉","304"],
        ["新竹縣","新埔鎮","305"],["新竹縣","關西鎮","306"],["新竹縣","芎林鄉","307"],
        ["新竹縣","寶山鄉","308"],["新竹縣","竹東鎮","310"],["新竹縣","五峰鄉","311"],
        ["新竹縣","橫山鄉","312"],["新竹縣","尖石鄉","313"],["新竹縣","北埔鄉","314"],
        ["新竹縣","峨眉鄉","315"],
        ["苗栗縣","苗栗市","360"],["苗栗縣","頭份市","351"],["苗栗縣","竹南鎮","350"],
        ["苗栗縣","後龍鎮","356"],["苗栗縣","通霄鎮","357"],["苗栗縣","苑裡鎮","358"],
        ["苗栗縣","造橋鄉","361"],["苗栗縣","頭屋鄉","362"],["苗栗縣","公館鄉","363"],
        ["苗栗縣","大湖鄉","364"],["苗栗縣","泰安鄉","365"],["苗栗縣","銅鑼鄉","366"],
        ["苗栗縣","三義鄉","367"],["苗栗縣","西湖鄉","368"],["苗栗縣","卓蘭鎮","369"],
        ["彰化縣","彰化市","500"],["彰化縣","芬園鄉","502"],["彰化縣","花壇鄉","503"],
        ["彰化縣","秀水鄉","504"],["彰化縣","鹿港鎮","505"],["彰化縣","福興鄉","506"],
        ["彰化縣","線西鄉","507"],["彰化縣","和美鎮","508"],["彰化縣","伸港鄉","509"],
        ["彰化縣","員林市","510"],["彰化縣","社頭鄉","511"],["彰化縣","永靖鄉","512"],
        ["彰化縣","田中鎮","520"],["彰化縣","北斗鎮","521"],["彰化縣","田尾鄉","522"],
        ["彰化縣","埤頭鄉","523"],["彰化縣","溪州鄉","524"],["彰化縣","竹塘鄉","525"],
        ["彰化縣","二林鎮","526"],["彰化縣","大城鄉","527"],["彰化縣","芳苑鄉","528"],
        ["彰化縣","二水鄉","530"],
        ["南投縣","南投市","540"],["南投縣","中寮鄉","541"],["南投縣","草屯鎮","542"],
        ["南投縣","國姓鄉","544"],["南投縣","埔里鎮","545"],["南投縣","仁愛鄉","546"],
        ["南投縣","名間鄉","551"],["南投縣","集集鎮","552"],["南投縣","水里鄉","553"],
        ["南投縣","魚池鄉","555"],["南投縣","信義鄉","556"],["南投縣","竹山鎮","557"],
        ["南投縣","鹿谷鄉","558"],
        ["雲林縣","斗南鎮","630"],["雲林縣","大埤鄉","631"],["雲林縣","虎尾鎮","632"],
        ["雲林縣","土庫鎮","633"],["雲林縣","褒忠鄉","634"],["雲林縣","東勢鄉","635"],
        ["雲林縣","台西鄉","636"],["雲林縣","崙背鄉","637"],["雲林縣","麥寮鄉","638"],
        ["雲林縣","斗六市","640"],["雲林縣","林內鄉","643"],["雲林縣","古坑鄉","646"],
        ["雲林縣","莿桐鄉","647"],["雲林縣","西螺鎮","648"],["雲林縣","二崙鄉","649"],
        ["雲林縣","北港鎮","651"],["雲林縣","水林鄉","652"],["雲林縣","口湖鄉","653"],
        ["雲林縣","四湖鄉","654"],["雲林縣","元長鄉","655"],
        ["嘉義市","東區","600"],["嘉義市","西區","600"],
        ["嘉義縣","番路鄉","602"],["嘉義縣","梅山鄉","603"],["嘉義縣","竹崎鄉","604"],
        ["嘉義縣","阿里山鄉","605"],["嘉義縣","中埔鄉","606"],["嘉義縣","大埔鄉","607"],
        ["嘉義縣","水上鄉","608"],["嘉義縣","鹿草鄉","611"],["嘉義縣","太保市","612"],
        ["嘉義縣","朴子市","613"],["嘉義縣","東石鄉","614"],["嘉義縣","六腳鄉","615"],
        ["嘉義縣","新港鄉","616"],["嘉義縣","民雄鄉","621"],["嘉義縣","大林鎮","622"],
        ["嘉義縣","溪口鄉","623"],["嘉義縣","義竹鄉","624"],["嘉義縣","布袋鎮","625"],
        ["屏東縣","屏東市","900"],["屏東縣","三地門鄉","901"],["屏東縣","霧台鄉","902"],
        ["屏東縣","瑪家鄉","903"],["屏東縣","九如鄉","904"],["屏東縣","里港鄉","905"],
        ["屏東縣","高樹鄉","906"],["屏東縣","鹽埔鄉","907"],["屏東縣","長治鄉","908"],
        ["屏東縣","麟洛鄉","909"],["屏東縣","竹田鄉","911"],["屏東縣","內埔鄉","912"],
        ["屏東縣","萬丹鄉","913"],["屏東縣","潮州鎮","920"],["屏東縣","泰武鄉","921"],
        ["屏東縣","來義鄉","922"],["屏東縣","萬巒鄉","923"],["屏東縣","崁頂鄉","924"],
        ["屏東縣","新埤鄉","925"],["屏東縣","南州鄉","926"],["屏東縣","林邊鄉","927"],
        ["屏東縣","東港鎮","928"],["屏東縣","琉球鄉","929"],["屏東縣","佳冬鄉","931"],
        ["屏東縣","新園鄉","932"],["屏東縣","枋寮鄉","940"],["屏東縣","枋山鄉","941"],
        ["屏東縣","春日鄉","942"],["屏東縣","獅子鄉","943"],["屏東縣","車城鄉","944"],
        ["屏東縣","牡丹鄉","945"],["屏東縣","恆春鎮","946"],["屏東縣","滿州鄉","947"],
        ["宜蘭縣","宜蘭市","260"],["宜蘭縣","頭城鎮","261"],["宜蘭縣","礁溪鄉","262"],
        ["宜蘭縣","壯圍鄉","263"],["宜蘭縣","員山鄉","264"],["宜蘭縣","羅東鎮","265"],
        ["宜蘭縣","三星鄉","266"],["宜蘭縣","大同鄉","267"],["宜蘭縣","五結鄉","268"],
        ["宜蘭縣","冬山鄉","269"],["宜蘭縣","蘇澳鎮","270"],["宜蘭縣","南澳鄉","272"],
        ["花蓮縣","花蓮市","970"],["花蓮縣","新城鄉","971"],["花蓮縣","秀林鄉","972"],
        ["花蓮縣","吉安鄉","973"],["花蓮縣","壽豐鄉","974"],["花蓮縣","鳳林鎮","975"],
        ["花蓮縣","光復鄉","976"],["花蓮縣","豐濱鄉","977"],["花蓮縣","瑞穗鄉","978"],
        ["花蓮縣","富里鄉","983"],["花蓮縣","玉里鎮","981"],["花蓮縣","卓溪鄉","982"],
        ["台東縣","台東市","950"],["台東縣","綠島鄉","951"],["台東縣","蘭嶼鄉","952"],
        ["台東縣","延平鄉","953"],["台東縣","卑南鄉","954"],["台東縣","鹿野鄉","955"],
        ["台東縣","關山鎮","956"],["台東縣","海端鄉","957"],["台東縣","池上鄉","958"],
        ["台東縣","東河鄉","959"],["台東縣","成功鎮","961"],["台東縣","長濱鄉","962"],
        ["台東縣","太麻里鄉","963"],["台東縣","金峰鄉","964"],["台東縣","大武鄉","965"],
        ["台東縣","達仁鄉","966"],
        ["澎湖縣","馬公市","880"],["澎湖縣","西嶼鄉","881"],["澎湖縣","望安鄉","882"],
        ["澎湖縣","七美鄉","883"],["澎湖縣","白沙鄉","884"],["澎湖縣","湖西鄉","885"],
        ["金門縣","金城鎮","893"],["金門縣","金湖鎮","891"],["金門縣","金沙鎮","892"],
        ["金門縣","金寧鄉","894"],["金門縣","烈嶼鄉","895"],["金門縣","烏坵鄉","896"],
        ["連江縣","南竿鄉","209"],["連江縣","北竿鄉","210"],["連江縣","莒光鄉","211"],
        ["連江縣","東引鄉","212"]
      ];
      const vals = twData.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(",");
      const flat = twData.flat();
      await _migPool.query(
        `INSERT INTO townships (county, district, zip_code) VALUES ${vals} ON CONFLICT DO NOTHING`,
        flat
      );
    }
    console.log("[VehicleMgmt] tables ensured");
  } catch (e) {
    console.warn("[VehicleMgmt] table ensure failed:", String(e).slice(0, 200));
  }
})();

// ── 貸款管理資料表 ─────────────────────────────────────────────────────────────
(async () => {
  try {
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS loan_accounts (
        id              SERIAL PRIMARY KEY,
        loan_name       VARCHAR(100) NOT NULL,
        loan_type       VARCHAR(30)  NOT NULL DEFAULT '車輛貸款',
        bank_name       VARCHAR(50),
        bank_branch     VARCHAR(50),
        account_no      VARCHAR(50),
        vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        plate_no        VARCHAR(20),
        principal       NUMERIC(14,2) NOT NULL DEFAULT 0,
        interest_rate   NUMERIC(6,4)  NOT NULL DEFAULT 0,
        start_date      DATE NOT NULL,
        end_date        DATE NOT NULL,
        total_periods   INTEGER NOT NULL DEFAULT 1,
        monthly_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
        payment_day     INTEGER DEFAULT 1,
        status          VARCHAR(20) NOT NULL DEFAULT 'active',
        contact_person  VARCHAR(30),
        contact_phone   VARCHAR(20),
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`
      CREATE TABLE IF NOT EXISTS loan_payments (
        id              SERIAL PRIMARY KEY,
        loan_id         INTEGER NOT NULL REFERENCES loan_accounts(id) ON DELETE CASCADE,
        period_no       INTEGER NOT NULL,
        due_date        DATE NOT NULL,
        principal_amt   NUMERIC(12,2) NOT NULL DEFAULT 0,
        interest_amt    NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_amt       NUMERIC(12,2) NOT NULL DEFAULT 0,
        remaining_bal   NUMERIC(14,2) NOT NULL DEFAULT 0,
        paid_date       DATE,
        paid_amount     NUMERIC(12,2),
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        receipt_no      VARCHAR(50),
        notes           VARCHAR(200),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await _migPool.query(`CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)`);
    await _migPool.query(`CREATE INDEX IF NOT EXISTS idx_loan_payments_due_date ON loan_payments(due_date)`);
    console.log("[LoanMgmt] tables ensured");
  } catch (e) {
    console.warn("[LoanMgmt] table ensure failed:", String(e).slice(0, 200));
  }
})();

export default app;
