import express, { type Express, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startAlertScheduler } from "./lib/alertScheduler";
import { startSheetSyncScheduler } from "./lib/sheetSyncScheduler";
import { ensureSheetSyncTable } from "./routes/sheetSync";
import { ensurePenaltySyncTables, startPenaltySyncScheduler } from "./routes/penaltySync";
import { startRateSyncScheduler } from "./lib/rateSyncScheduler";
import { ensureRateTables } from "./routes/rateSync";
import { ensureShopeeDriversTable } from "./routes/shopeeDrivers";
import { ensureDispatchOrdersTable } from "./routes/dispatchOrders";
import { ensureScheduleTables } from "./routes/fusingaoScheduleImport";
import { ensureBillingDetailTables } from "./routes/fusingaoBillingDetailImport";
import { ensureFusingaoSheetSyncTables, startFusingaoSheetSyncScheduler } from "./routes/fusingaoSheetSync";
import { ensureFleetSheetSyncTables, startFleetSheetSyncScheduler } from "./lib/fleetSheetSync";
import { ensureDbIndexes } from "./lib/dbIndexes";
import { ensureCreditSchema } from "./routes/line.js";
import { pool as _migPool } from "@workspace/db";

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

// ── 訂單資料結構正規化遷移（冪等，只補空值）────────────────────────────
async function runOrdersColumnMigration() {
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
ensureDispatchOrdersTable().catch((e) => console.error("[DispatchOrders] table setup failed:", e));
ensureScheduleTables().catch((e) => console.error("[ScheduleTables] setup failed:", e));
ensureBillingDetailTables().catch((e) => console.error("[BillingDetailTables] setup failed:", e));
ensureFusingaoSheetSyncTables()
  .then(() => startFusingaoSheetSyncScheduler())
  .catch((e) => console.error("[FusingaoSheetSync] setup failed:", e));
ensureFleetSheetSyncTables()
  .then(() => startFleetSheetSyncScheduler())
  .catch((e) => console.error("[FleetSheetSync] setup failed:", e));

export default app;
