import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import driversRouter from "./drivers";
import lineRouter from "./line";
import customersRouter from "./customers";
import vehicleTypesRouter from "./vehicleTypes";
import licensesRouter from "./licenses";
import enterpriseRouter from "./enterprise";
import outsourcingRouter from "./outsourcing";
import { pricingRouter } from "./pricing";
import paymentsRouter from "./payments";
import permissionsRouter from "./permissions";
import aiChatRouter from "./aiChat";
import authRouter from "./auth";
import { routePricesRouter } from "./routePrices";
import { vehicleCostsRouter } from "./vehicleCosts";
import { smartOrderRouter } from "./smartOrder";
import { auditMiddleware } from "../middleware/audit";

const router: IRouter = Router();

router.use(auditMiddleware);

router.use(healthRouter);
router.use(ordersRouter);
router.use(driversRouter);
router.use(lineRouter);
router.use(customersRouter);
router.use(vehicleTypesRouter);
router.use(licensesRouter);
router.use(enterpriseRouter);
router.use(outsourcingRouter);
router.use("/orders", pricingRouter);
router.use(paymentsRouter);
router.use(permissionsRouter);
router.use(aiChatRouter);
router.use(authRouter);
router.use(routePricesRouter);
router.use(vehicleCostsRouter);
router.use(smartOrderRouter);

export default router;
