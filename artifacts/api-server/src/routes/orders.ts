import { Router, type IRouter } from "express";
import { db, ordersTable, driversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/orders", async (req, res) => {
  try {
    const query = ListOrdersQueryParams.parse(req.query);
    let orders;
    if (query.status) {
      orders = await db
        .select()
        .from(ordersTable)
        .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
        .where(eq(ordersTable.status, query.status))
        .orderBy(ordersTable.createdAt);
    } else {
      orders = await db
        .select()
        .from(ordersTable)
        .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
        .orderBy(ordersTable.createdAt);
    }
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
    const rows = await db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .where(eq(ordersTable.id, id));
    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }
    const row = rows[0];
    res.json({ ...row.orders, driver: row.drivers ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Failed to get order" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = UpdateOrderParams.parse(req.params);
    const body = UpdateOrderBody.parse(req.body);

    const existing = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const updates: Partial<typeof ordersTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes ?? null;
    if (body.driverId !== undefined) {
      updates.driverId = body.driverId ?? null;
      if (body.driverId && !body.status) {
        updates.status = "assigned";
      }
    }

    const [updated] = await db
      .update(ordersTable)
      .set(updates)
      .where(eq(ordersTable.id, id))
      .returning();

    const rows = await db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .where(eq(ordersTable.id, updated.id));

    const row = rows[0];
    res.json({ ...row.orders, driver: row.drivers ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    res.status(500).json({ error: "Failed to update order" });
  }
});

export default router;
