import { Router } from "express";
import { db } from "@workspace/db";
import { customerNotificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const customerNotificationsRouter = Router();

// GET /api/customer-notifications/:customerId
customerNotificationsRouter.get("/:customerId", async (req, res) => {
  const customerId = Number(req.params.customerId);
  const notifs = await db
    .select()
    .from(customerNotificationsTable)
    .where(eq(customerNotificationsTable.customerId, customerId))
    .orderBy(desc(customerNotificationsTable.createdAt))
    .limit(100);
  const unread = notifs.filter(n => !n.isRead).length;
  res.json({ notifications: notifs, unread });
});

// PATCH /api/customer-notifications/:customerId/read-all
customerNotificationsRouter.patch("/:customerId/read-all", async (req, res) => {
  await db
    .update(customerNotificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(customerNotificationsTable.customerId, Number(req.params.customerId)),
        eq(customerNotificationsTable.isRead, false)
      )
    );
  res.json({ ok: true });
});

// PATCH /api/customer-notifications/item/:id/read
customerNotificationsRouter.patch("/item/:id/read", async (req, res) => {
  await db
    .update(customerNotificationsTable)
    .set({ isRead: true })
    .where(eq(customerNotificationsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// POST /api/customer-notifications (internal - create notification)
customerNotificationsRouter.post("/", async (req, res) => {
  const { customerId, orderId, type, title, message } = req.body;
  const [n] = await db.insert(customerNotificationsTable).values({
    customerId, orderId, type, title, message,
  }).returning();
  res.json({ ok: true, notification: n });
});
