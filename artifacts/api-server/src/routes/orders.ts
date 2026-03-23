import { Router, type IRouter } from "express";
import { db, ordersTable, driversTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  CreateOrderBody,
  UpdateOrderBody,
  UpdateOrderStopsBody,
  GroupOrdersBody,
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
        pickupDate: body.pickupDate ?? null,
        pickupTime: body.pickupTime ?? null,
        requiredLicense: body.requiredLicense ?? null,
        pickupContactName: body.pickupContactName ?? null,
        pickupAddress: body.pickupAddress,
        pickupContactPerson: body.pickupContactPerson ?? null,
        deliveryDate: body.deliveryDate ?? null,
        deliveryTime: body.deliveryTime ?? null,
        deliveryContactName: body.deliveryContactName ?? null,
        deliveryAddress: body.deliveryAddress,
        deliveryContactPerson: body.deliveryContactPerson ?? null,
        cargoDescription: body.cargoDescription,
        cargoQuantity: body.cargoQuantity ?? null,
        cargoWeight: body.cargoWeight ?? null,
        requiredVehicleType: body.requiredVehicleType ?? null,
        needTailgate: body.needTailgate ?? null,
        needHydraulicPallet: body.needHydraulicPallet ?? null,
        specialRequirements: body.specialRequirements ?? null,
        notes: body.notes ?? null,
        extraPickupAddresses: body.extraPickupAddresses ?? null,
        extraDeliveryAddresses: body.extraDeliveryAddresses ?? null,
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
    // Editable content fields
    if (body.pickupDate !== undefined) updates.pickupDate = body.pickupDate ?? null;
    if (body.pickupTime !== undefined) updates.pickupTime = body.pickupTime ?? null;
    if (body.pickupAddress !== undefined) updates.pickupAddress = body.pickupAddress as string;
    if (body.pickupContactPerson !== undefined) updates.pickupContactPerson = body.pickupContactPerson ?? null;
    if (body.pickupContactName !== undefined) updates.pickupContactName = body.pickupContactName ?? null;
    if (body.deliveryDate !== undefined) updates.deliveryDate = body.deliveryDate ?? null;
    if (body.deliveryTime !== undefined) updates.deliveryTime = body.deliveryTime ?? null;
    if (body.deliveryAddress !== undefined) updates.deliveryAddress = body.deliveryAddress as string;
    if (body.deliveryContactPerson !== undefined) updates.deliveryContactPerson = body.deliveryContactPerson ?? null;
    if (body.deliveryContactName !== undefined) updates.deliveryContactName = body.deliveryContactName ?? null;
    if (body.requiredVehicleType !== undefined) updates.requiredVehicleType = body.requiredVehicleType ?? null;
    if (body.cargoWeight !== undefined) updates.cargoWeight = body.cargoWeight ?? null;
    if (body.cargoLengthM !== undefined) updates.cargoLengthM = body.cargoLengthM ?? null;
    if (body.cargoWidthM !== undefined) updates.cargoWidthM = body.cargoWidthM ?? null;
    if (body.cargoHeightM !== undefined) updates.cargoHeightM = body.cargoHeightM ?? null;
    if (body.specialRequirements !== undefined) updates.specialRequirements = body.specialRequirements ?? null;
    if (body.extraPickupAddresses !== undefined) updates.extraPickupAddresses = body.extraPickupAddresses ?? null;
    if (body.extraDeliveryAddresses !== undefined) updates.extraDeliveryAddresses = body.extraDeliveryAddresses ?? null;
    if (body.orderGroupId !== undefined) updates.orderGroupId = body.orderGroupId ?? null;

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

router.patch("/orders/:id/stops", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
    const body = UpdateOrderStopsBody.parse(req.body);
    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Order not found" });
    await db.update(ordersTable).set({
      extraDeliveryAddresses: body.extraDeliveryAddresses,
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id));
    const order = await fetchOrderWithDriver(id);
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to update stops");
    res.status(500).json({ error: "Failed to update stops" });
  }
});

router.post("/orders/group", async (req, res) => {
  try {
    const body = GroupOrdersBody.parse(req.body);
    const groupId = body.groupId ?? `grp-${Date.now()}`;
    if (!body.orderIds.length) return res.status(400).json({ error: "No order IDs provided" });
    await db.update(ordersTable)
      .set({ orderGroupId: groupId, updatedAt: new Date() })
      .where(inArray(ordersTable.id, body.orderIds));
    const orders = await db.select().from(ordersTable)
      .where(inArray(ordersTable.id, body.orderIds));
    res.json({ groupId, orders });
  } catch (err) {
    req.log.error({ err }, "Failed to group orders");
    res.status(500).json({ error: "Failed to group orders" });
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

/* ─── Quick order (Landing page — minimal data) ─── */
router.post("/quick-order", async (req, res) => {
  try {
    const { phone, pickupAddress } = req.body as { phone: string; pickupAddress: string };
    if (!phone || !pickupAddress) {
      return res.status(400).json({ error: "電話與取貨地址為必填" });
    }
    const [order] = await db.insert(ordersTable).values({
      customerName: `快速下單 ${phone.slice(-4)}`,
      customerPhone: phone.trim(),
      pickupAddress: pickupAddress.trim(),
      deliveryAddress: "待確認",
      cargoDescription: "待補充（快速下單）",
      status: "pending",
    }).returning();

    const base = 350;
    const priceMin = base + Math.floor(Math.random() * 100);
    const priceMax = priceMin + 200 + Math.floor(Math.random() * 200);

    return res.status(201).json({ orderId: order.id, priceMin, priceMax });
  } catch (err) {
    req.log.error({ err }, "Failed to create quick order");
    return res.status(500).json({ error: "建立訂單失敗" });
  }
});

export default router;
