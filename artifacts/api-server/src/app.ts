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
ensureDbIndexes().catch((e) => console.error("[dbIndexes] Failed:", e));
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
