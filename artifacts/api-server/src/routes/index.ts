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

const router: IRouter = Router();

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

export default router;
