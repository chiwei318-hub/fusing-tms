import { Router, type IRouter } from "express";
import * as lineLib from "@line/bot-sdk";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post(
  "/line/webhook",
  (req, _res, next) => {
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
    if (!channelSecret) {
      next();
      return;
    }
    lineLib.middleware({ channelSecret })(req, _res, next);
  },
  async (req, res) => {
    res.sendStatus(200);

    const events: lineLib.WebhookEvent[] = req.body?.events ?? [];

    for (const event of events) {
      if (event.type !== "postback") continue;

      const data = new URLSearchParams(event.postback.data);
      const action = data.get("action");
      const orderIdStr = data.get("orderId");
      if (!action || !orderIdStr) continue;

      const orderId = parseInt(orderIdStr, 10);
      if (isNaN(orderId)) continue;

      try {
        const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
        if (!existing.length) continue;

        const now = new Date();

        if (action === "accept") {
          await db.update(ordersTable).set({
            status: "assigned",
            driverAcceptedAt: now,
            updatedAt: now,
          }).where(eq(ordersTable.id, orderId));
        } else if (action === "reject") {
          await db.update(ordersTable).set({
            driverId: null,
            status: "pending",
            updatedAt: now,
          }).where(eq(ordersTable.id, orderId));
        }
      } catch (err) {
        console.error(`Failed to process LINE postback for order ${orderId}:`, err);
      }
    }
  }
);

export default router;
