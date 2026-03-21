import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import driversRouter from "./drivers";
import lineRouter from "./line";
import customersRouter from "./customers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(driversRouter);
router.use(lineRouter);
router.use(customersRouter);

export default router;
