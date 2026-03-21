import { Router, type IRouter } from "express";
import { db, ordersTable, driversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
} from "@workspace/api-zod";
import { sendDispatchNotification } from "../lib/line.js";

const router: IRouter = Router();

async function fetchOrderWithDriver(id: number) {
  const rows = await db
    .select()
    .from(ordersTable)
    .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
    .where(eq(ordersTable.id, id));
  if (!rows.length) return null;
  const row = rows[0];
  return { ...row.orders, driver: row.drivers ?? null };
}

router.get("/orders/track", async (req, res) => {
  try {
    const schema = z.object({
      phone: z.string().min(1),
      orderId: z.coerce.number().optional(),
    });
    const query = schema.parse(req.query);
    let qb = db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .$dynamic();

    const conditions = [eq(ordersTable.customerPhone, query.phone)];
    if (query.orderId) {
      conditions.push(eq(ordersTable.id, query.orderId));
    }
    qb = qb.where(and(...conditions));

    const orders = await qb.orderBy(ordersTable.createdAt);
    const result = orders.map((row) => ({
      ...row.orders,
      driver: row.drivers ?? null,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to track orders");
    res.status(400).json({ error: "Failed to track orders" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const query = ListOrdersQueryParams.parse(req.query);
    let qb = db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .$dynamic();
    if (query.status) {
      qb = qb.where(eq(ordersTable.status, query.status));
    } else if ((req.query as Record<string,string>).driverId) {
      const driverId = parseInt((req.query as Record<string,string>).driverId, 10);
      qb = qb.where(eq(ordersTable.driverId, driverId));
    }
    const orders = await qb.orderBy(ordersTable.createdAt);
    const result = orders.map((row) => ({
      ...row.orders,
      driver: row.drivers ?? null,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const body = CreateOrderBody.parse(req.body);
    const [order] = await db
      .insert(ordersTable)
      .values({
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        pickupAddress: body.pickupAddress,
        deliveryAddress: body.deliveryAddress,
        cargoDescription: body.cargoDescription,
        cargoWeight: body.cargoWeight ?? null,
        notes: body.notes ?? null,
        status: "pending",
        feeStatus: "unpaid",
      })
      .returning();
    res.status(201).json({ ...order, driver: null });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(400).json({ error: "Failed to create order" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const { id } = GetOrderParams.parse(req.params);
    const order = await fetchOrderWithDriver(id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Failed to get order" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = UpdateOrderParams.parse(req.params);
    const body = UpdateOrderBody.parse(req.body);

    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Order not found" });

    const updates: Partial<typeof ordersTable.$inferInsert> = { updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes ?? null;
    if (body.driverId !== undefined) {
      updates.driverId = body.driverId ?? null;
      if (body.driverId && body.status === undefined) updates.status = "assigned";
    }
    if (body.basePrice !== undefined) updates.basePrice = body.basePrice ?? null;
    if (body.extraFee !== undefined) updates.extraFee = body.extraFee ?? null;
    if (body.totalFee !== undefined) updates.totalFee = body.totalFee ?? null;
    if (body.feeStatus !== undefined) updates.feeStatus = body.feeStatus;

    await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));
    const order = await fetchOrderWithDriver(id);
    res.json(order);

    const willBeAssigned = body.driverId != null && updates.status === "assigned";
    if (willBeAssigned && body.driverId && order) {
      const driverId = body.driverId;
      const log = req.log;
      setImmediate(async () => {
        try {
          const driverRows = await db.select().from(driversTable).where(eq(driversTable.id, driverId));
          const driver = driverRows[0];
          if (driver?.lineUserId) {
            await sendDispatchNotification(driver.lineUserId, {
              id: order.id,
              pickupAddress: order.pickupAddress,
              deliveryAddress: order.deliveryAddress,
              cargoDescription: order.cargoDescription,
              customerName: order.customerName,
            });
          }
        } catch (err) {
          log.warn({ err }, "Failed to send LINE dispatch notification");
        }
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    res.status(500).json({ error: "Failed to update order" });
  }
});

router.post("/orders/:id/driver-action", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

    const schema = z.object({
      action: z.enum(["accept", "reject", "checkin", "complete"]),
      signaturePhotoUrl: z.string().nullable().optional(),
      completionNote: z.string().nullable().optional(),
    });
    const body = schema.parse(req.body);

    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Order not found" });

    const now = new Date();
    const updates: Partial<typeof ordersTable.$inferInsert> = { updatedAt: now };

    if (body.action === "accept") {
      updates.driverAcceptedAt = now;
      updates.status = "assigned";
    } else if (body.action === "reject") {
      updates.driverId = null;
      updates.status = "pending";
    } else if (body.action === "checkin") {
      updates.checkInAt = now;
      updates.status = "in_transit";
    } else if (body.action === "complete") {
      updates.completedAt = now;
      updates.status = "delivered";
      if (body.signaturePhotoUrl) updates.signaturePhotoUrl = body.signaturePhotoUrl;
      if (body.completionNote) updates.notes = body.completionNote;
    }

    await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));
    const order = await fetchOrderWithDriver(id);
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to perform driver action");
    res.status(500).json({ error: "Failed to perform driver action" });
  }
});

router.post("/orders/:id/payment", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

    const schema = z.object({
      paymentNote: z.string().nullable().optional(),
    });
    const body = schema.parse(req.body);

    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Order not found" });

    await db.update(ordersTable).set({
      paymentConfirmedAt: new Date(),
      paymentNote: body.paymentNote ?? null,
      feeStatus: "paid",
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id));

    const order = await fetchOrderWithDriver(id);
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to confirm payment");
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

export default router;
