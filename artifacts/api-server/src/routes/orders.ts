import { Router, type IRouter } from "express";
import { db, ordersTable, driversTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { customerNotificationsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
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
import {
  sendDispatchNotification,
  sendNewOrderAlertToCompany,
  sendCustomerDispatch,
  sendCustomerStatusUpdate,
} from "../lib/line.js";
import { autoIssueInvoice } from "../lib/autoInvoice.js";
import { customersTable } from "@workspace/db";

const router: IRouter = Router();

// ─── DB Migration: ensure custom_field_values column ─────────────────────────
async function ensureOrderColumns() {
  try {
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_field_values TEXT`);
  } catch { /* ignore */ }
}
ensureOrderColumns().catch(console.error);

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

// ─── GET /orders/suggestions — autocomplete for cargo descriptions & notes ────
router.get("/orders/suggestions", async (req, res) => {
  try {
    const [{ rows: cargoRows }, { rows: noteRows }] = await Promise.all([
      pool.query<{ cargo: string }>(`
        SELECT DISTINCT cargo_description AS cargo
        FROM orders
        WHERE cargo_description IS NOT NULL AND cargo_description <> ''
        ORDER BY cargo_description
        LIMIT 200
      `),
      pool.query<{ note: string }>(`
        SELECT DISTINCT notes AS note
        FROM orders
        WHERE notes IS NOT NULL AND notes <> ''
        ORDER BY notes
        LIMIT 100
      `),
    ]);
    res.json({
      cargo: cargoRows.map(r => r.cargo.trim()).filter(Boolean),
      notes: noteRows.map(r => r.note.trim()).filter(Boolean),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order suggestions");
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

// ─── GET /orders/search?q=keyword — 全域關鍵字搜尋 ─────────────────────────────
router.get("/orders/search", async (req, res) => {
  try {
    const q = ((req.query as any).q ?? "").toString().trim();
    const limit = Math.min(parseInt((req.query as any).limit ?? "50", 10), 200);
    const status = ((req.query as any).status ?? "").toString().trim();

    if (!q && !status) return res.json([]);

    const like = `%${q}%`;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (q) {
      // Try numeric match for order ID
      const isNum = /^\d+$/.test(q);
      conditions.push(`(
        ${isNum ? `o.id = $${pIdx++} OR` : ""}
        o.order_no ILIKE $${pIdx++}
        OR o.customer_name ILIKE $${pIdx++}
        OR o.customer_phone ILIKE $${pIdx++}
        OR o.pickup_address ILIKE $${pIdx++}
        OR o.delivery_address ILIKE $${pIdx++}
        OR o.cargo_description ILIKE $${pIdx++}
        OR o.cargo_name ILIKE $${pIdx++}
        OR o.special_requirements ILIKE $${pIdx++}
        OR o.notes ILIKE $${pIdx++}
        OR o.pickup_contact_person ILIKE $${pIdx++}
        OR o.delivery_contact_person ILIKE $${pIdx++}
        OR o.pickup_contact_name ILIKE $${pIdx++}
        OR o.delivery_contact_name ILIKE $${pIdx++}
        OR d.name ILIKE $${pIdx++}
        OR d.license_plate ILIKE $${pIdx++}
        OR d.phone ILIKE $${pIdx++}
        OR o.pickup_city ILIKE $${pIdx++}
        OR o.delivery_city ILIKE $${pIdx++}
        OR o.pickup_district ILIKE $${pIdx++}
        OR o.delivery_district ILIKE $${pIdx++}
      )`);
      if (isNum) params.push(parseInt(q, 10));
      // all ILIKE params share the same like pattern
      const ilikeCount = isNum ? 20 : 20;
      for (let i = 0; i < ilikeCount; i++) params.push(like);
    }

    if (status && status !== "all") {
      conditions.push(`o.status = $${pIdx++}`);
      params.push(status);
    }

    params.push(limit);

    const { rows } = await pool.query(`
      SELECT
        o.id, o.order_no, o.status, o.fee_status, o.customer_name, o.customer_phone,
        o.pickup_address, o.pickup_date, o.pickup_time, o.pickup_city, o.pickup_district,
        o.pickup_contact_person, o.pickup_contact_name,
        o.delivery_address, o.delivery_date, o.delivery_time, o.delivery_city, o.delivery_district,
        o.delivery_contact_person, o.delivery_contact_name,
        o.cargo_description, o.cargo_name, o.cargo_weight, o.cargo_quantity,
        o.special_requirements, o.notes,
        o.total_fee, o.base_price,
        o.required_vehicle_type, o.need_tailgate, o.need_hydraulic_pallet,
        o.source, o.created_at, o.updated_at,
        o.driver_id,
        d.name AS driver_name, d.license_plate, d.phone AS driver_phone, d.vehicle_type
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
      ORDER BY o.created_at DESC
      LIMIT $${pIdx}
    `, params);

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to search orders");
    return res.status(500).json({ error: "Search failed" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const query = ListOrdersQueryParams.parse(req.query);
    const q = req.query as Record<string, string>;
    let qb = db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .$dynamic();

    const conditions: any[] = [];

    if (query.status) conditions.push(eq(ordersTable.status, query.status));

    if (q.driverId) {
      const driverId = parseInt(q.driverId, 10);
      if (!isNaN(driverId)) conditions.push(eq(ordersTable.driverId, driverId));
    }

    if (q.customerName) {
      conditions.push(sql`lower(${ordersTable.customerName}) like ${"%" + q.customerName.toLowerCase() + "%"}`);
    }

    if (q.source) {
      if (q.source === "platform") {
        conditions.push(sql`"orders"."source" IN ('admin','api')`);
      } else {
        conditions.push(sql`"orders"."source" = ${q.source}`);
      }
    }

    if (q.dateFrom || q.dateTo) {
      const field = q.dateField === "created" ? ordersTable.createdAt : ordersTable.pickupDate;
      if (q.dateFrom) conditions.push(sql`${field} >= ${q.dateFrom}`);
      if (q.dateTo)   conditions.push(sql`${field} <= ${q.dateTo}`);
    }

    if (conditions.length > 0) qb = qb.where(and(...conditions));

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
        operatorName: body.operatorName ?? null,
        isColdChain: !!(req.body.isColdChain ?? req.body.is_cold_chain),
        orderStatus: "pending",
        status: "pending",
        feeStatus: "unpaid",
      })
      .returning();
    res.status(201).json({ ...order, driver: null });

    setImmediate(async () => {
      // 0. 自動建立客戶名單 — 若電話不存在則新增，已存在則跳過
      try {
        const phone = (order.customerPhone ?? "").trim();
        const name  = (order.customerName  ?? "").trim();
        const isValidPhone = phone && phone !== "未提供" && phone.length >= 4;
        if (isValidPhone && name) {
          const existing = await db.select({ id: customersTable.id })
            .from(customersTable)
            .where(eq(customersTable.phone, phone))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(customersTable).values({ name, phone });
          }
        }
      } catch { /* silent */ }

      // 1. LINE 通知公司
      try {
        await sendNewOrderAlertToCompany({
          id: order.id, pickupAddress: order.pickupAddress,
          deliveryAddress: order.deliveryAddress, cargoDescription: order.cargoDescription,
          customerName: order.customerName, customerPhone: order.customerPhone ?? undefined,
        });
      } catch { /* LINE not configured — silent */ }

      // 2. 客戶通知：訂單已建立
      try {
        const [customer] = await db.select().from(customersTable)
          .where(eq(customersTable.phone, order.customerPhone));
        if (customer) {
          await db.insert(customerNotificationsTable).values({
            customerId: customer.id, orderId: order.id,
            type: "order_created", title: "訂單已建立",
            message: `您的訂單 #${order.id}（${order.pickupAddress} → ${order.deliveryAddress}）已成功建立，我們將盡快安排司機。`,
          });
        }
      } catch { /* silent */ }

      // 3. 全自動派車觸發
      try {
        const cfgRows = await db.execute(sql`SELECT key, value FROM pricing_config WHERE key = 'auto_dispatch'`);
        const autoCfg = (cfgRows.rows as { key: string; value: string }[]).find(r => r.key === "auto_dispatch");
        if (autoCfg?.value !== "true") return;

        // 未付不派車：即時付款方式且尚未付款則封鎖
        if ((order as any).dispatch_blocked) return;

        // 找可用司機中距離最近、評分最高的
        const availableDrivers = await db.select().from(driversTable)
          .where(eq(driversTable.status, "available"));
        if (!availableDrivers.length) return;

        // 取前3位（按 today_revenue asc 分散工作量）
        const candidates = availableDrivers
          .sort((a, b) => (a.todayRevenue ?? 0) - (b.todayRevenue ?? 0))
          .slice(0, 1);

        if (!candidates.length) return;
        const chosen = candidates[0];

        await db.update(ordersTable).set({
          driverId: chosen.id,
          status: "assigned",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, order.id));

        await db.update(driversTable).set({ status: "busy" })
          .where(eq(driversTable.id, chosen.id));

        // LINE 通知司機（僅在職者）
        try {
          if (chosen.isActive !== false) {
            await sendDispatchNotification({
              orderId: order.id, driverName: chosen.name,
              lineUserId: chosen.lineUserId ?? undefined,
              pickupAddress: order.pickupAddress, deliveryAddress: order.deliveryAddress,
              customerName: order.customerName, customerPhone: order.customerPhone,
              cargoDescription: order.cargoDescription,
              vehicleType: chosen.vehicleType, licensePlate: chosen.licensePlate,
            });
          } else {
            console.log(`[DispatchNotify] 司機 ${chosen.name}(id=${chosen.id}) 已離職，跳過 LINE 通知`);
          }
        } catch { /* LINE not configured */ }

        // 客戶通知：已派車
        const [cust] = await db.select().from(customersTable)
          .where(eq(customersTable.phone, order.customerPhone));
        if (cust) {
          await db.insert(customerNotificationsTable).values({
            customerId: cust.id, orderId: order.id,
            type: "order_assigned", title: "司機已指派",
            message: `訂單 #${order.id} 已指派司機 ${chosen.name}（${chosen.vehicleType} ${chosen.licensePlate}），請保持聯絡。`,
          });
        }
      } catch { /* auto-dispatch error — silent */ }
    });
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
    if (body.driverPaymentStatus !== undefined) updates.driverPaymentStatus = body.driverPaymentStatus;
    if (body.franchiseePaymentStatus !== undefined) updates.franchiseePaymentStatus = body.franchiseePaymentStatus;
    // 訂單資料結構正規化欄位
    if (body.vehicleType !== undefined) updates.vehicleType = body.vehicleType ?? null;
    if (body.invoiceStatus !== undefined) updates.invoiceStatus = body.invoiceStatus;
    if (body.cargoName !== undefined) updates.cargoName = body.cargoName ?? null;
    if (body.qty !== undefined) updates.qty = body.qty ?? null;
    if (body.grossWeight !== undefined) updates.grossWeight = body.grossWeight ?? null;
    if (body.quoteAmount !== undefined) updates.quoteAmount = body.quoteAmount ?? null;
    if (body.costAmount !== undefined) updates.costAmount = body.costAmount ?? null;
    if (body.profitAmount !== undefined) updates.profitAmount = body.profitAmount ?? null;
    if (body.sourceChannel !== undefined) updates.sourceChannel = body.sourceChannel ?? null;
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
    // Custom field values (stored as JSON string)
    if (body.customFieldValues !== undefined) {
      updates.customFieldValues = body.customFieldValues
        ? JSON.stringify(body.customFieldValues)
        : null;
    }

    await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));
    const order = await fetchOrderWithDriver(id);
    res.json(order);

    // 自動開發票（後台手動將狀態改為 delivered）
    if (body.status === "delivered" && order?.id) {
      setImmediate(() => autoIssueInvoice(order.id, "admin_delivered").catch(() => {}));
    }

    // 客戶通知：狀態變更
    if (body.status && ["in_transit", "delivered", "assigned"].includes(body.status) && order) {
      setImmediate(async () => {
        try {
          const customerRows = await db.select().from(customersTable)
            .where(eq(customersTable.phone, order.customerPhone)).limit(1);
          const customer = customerRows[0];
          if (customer) {
            const notifMap: Record<string, { title: string; message: string }> = {
              assigned: { title: "司機已指派", message: `訂單 #${order.id} 已指派司機，請保持聯絡。` },
              in_transit: { title: "貨物運送中", message: `訂單 #${order.id} 的貨物正在運送中，預計即將抵達。` },
              delivered: { title: "訂單已完成", message: `訂單 #${order.id} 已完成交付，感謝您使用富詠運輸！請為司機留下評分。` },
            };
            const notif = notifMap[body.status!];
            if (notif) {
              await db.insert(customerNotificationsTable).values({
                customerId: customer.id, orderId: order.id,
                type: `order_${body.status}`, ...notif,
              });
            }
          }
        } catch { /* silent */ }
      });
    }

    const willBeAssigned = body.driverId != null && updates.status === "assigned";
    if (willBeAssigned && body.driverId && order) {
      const driverId = body.driverId;
      const log = req.log;
      setImmediate(async () => {
        try {
          const driverRows = await db.select().from(driversTable).where(eq(driversTable.id, driverId));
          const driver = driverRows[0];
          // 通知司機（僅在職者）
          if (driver?.lineUserId && driver.isActive !== false) {
            await sendDispatchNotification(driver.lineUserId, {
              id: order.id,
              pickupAddress: order.pickupAddress,
              deliveryAddress: order.deliveryAddress,
              cargoDescription: order.cargoDescription,
              customerName: order.customerName,
            });
          }
          // 通知客戶：已派車 + 司機資訊
          if (driver && order.customerPhone) {
            const customerRows = await db
              .select()
              .from(customersTable)
              .where(eq(customersTable.phone, order.customerPhone))
              .limit(1);
            const customer = customerRows[0];
            if (customer?.lineUserId) {
              await sendCustomerDispatch(
                customer.lineUserId,
                {
                  id: order.id,
                  pickupAddress: order.pickupAddress,
                  deliveryAddress: order.deliveryAddress,
                  cargoDescription: order.cargoDescription,
                  customerName: order.customerName,
                },
                {
                  name: driver.name,
                  phone: driver.phone,
                  licensePlate: driver.licensePlate,
                  vehicleType: driver.vehicleType ?? undefined,
                },
              );
            }
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

    // 自動開發票（訂單完成時）
    if (body.action === "complete") {
      setImmediate(() => autoIssueInvoice(id, "driver_complete").catch(() => {}));
    }

    // 通知客戶：到達 / 完成
    const notifyStatus = body.action === "checkin" ? "in_transit" : body.action === "complete" ? "delivered" : null;
    if (notifyStatus && order?.customerPhone) {
      const log = req.log;
      setImmediate(async () => {
        try {
          const customerRows = await db
            .select()
            .from(customersTable)
            .where(eq(customersTable.phone, order.customerPhone!))
            .limit(1);
          const customer = customerRows[0];
          if (customer?.lineUserId) {
            await sendCustomerStatusUpdate(customer.lineUserId, id, notifyStatus);
          }
        } catch (err) {
          log.warn({ err }, "Failed to send LINE status notification");
        }
      });
    }
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

/* ─── Driver self-grab order ─── */
router.post("/orders/:id/grab", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

    const schema = z.object({ driverId: z.number().int().positive() });
    const { driverId } = schema.parse(req.body);

    // Fetch current order state
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    const current = rows[0];

    // Only allow grabbing pending, unassigned orders
    if (current.status !== "pending" || current.driverId != null) {
      return res.status(409).json({ error: "此訂單已被接走或狀態不符，無法搶單" });
    }

    // Verify driver exists
    const driverRows = await db.select().from(driversTable).where(eq(driversTable.id, driverId));
    if (!driverRows.length) return res.status(404).json({ error: "Driver not found" });

    // Atomically assign
    await db.update(ordersTable).set({
      driverId,
      status: "assigned",
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id));

    // Update driver status to busy
    await db.update(driversTable).set({ status: "busy" }).where(eq(driversTable.id, driverId));

    const order = await fetchOrderWithDriver(id);

    // Send LINE notification to driver（僅在職者）
    try {
      const { sendDispatchNotification } = await import("../lib/line.js");
      const grabDriver = driverRows[0];
      if (grabDriver.lineUserId && grabDriver.isActive !== false) {
        await sendDispatchNotification(grabDriver.lineUserId, id, grabDriver.name, order as any);
      } else if (grabDriver.isActive === false) {
        req.log.warn({ driverId: grabDriver.id }, "grab order: 司機已離職，跳過 LINE 通知");
      }
    } catch (e) {
      req.log.warn({ err: e }, "LINE grab notify failed");
    }

    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to grab order");
    res.status(500).json({ error: "搶單失敗" });
  }
});

/* ─── Report: Excel export ─── */
router.get("/orders/report/excel", async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    let qb = db.select().from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .$dynamic();

    const conditions: any[] = [];
    if (q.status)       conditions.push(eq(ordersTable.status, q.status as any));
    if (q.driverId)     { const d = parseInt(q.driverId, 10); if (!isNaN(d)) conditions.push(eq(ordersTable.driverId, d)); }
    if (q.customerName) conditions.push(sql`lower(${ordersTable.customerName}) like ${"%" + q.customerName.toLowerCase() + "%"}`);
    if (q.source) {
      if (q.source === "platform") {
        conditions.push(sql`"orders"."source" IN ('admin','api')`);
      } else {
        conditions.push(sql`"orders"."source" = ${q.source}`);
      }
    }
    if (q.dateFrom || q.dateTo) {
      const field = q.dateField === "created" ? ordersTable.createdAt : ordersTable.pickupDate;
      if (q.dateFrom) conditions.push(sql`${field} >= ${q.dateFrom}`);
      if (q.dateTo)   conditions.push(sql`${field} <= ${q.dateTo}`);
    }
    if (conditions.length > 0) qb = qb.where(and(...conditions));

    const rows = await qb.orderBy(ordersTable.createdAt);

    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸";
    const ws = wb.addWorksheet("訂單報表");

    const STATUS_MAP: Record<string, string> = {
      pending: "待處理", assigned: "已指派", in_transit: "運送中",
      delivered: "已送達", cancelled: "已取消",
    };
    const FEE_MAP: Record<string, string> = {
      unpaid: "未收款", paid: "已收款", invoiced: "已開票",
    };

    const SOURCE_MAP: Record<string, string> = {
      route_import: "整筆Excel匯入", admin: "平台公司匯入",
      api: "平台公司匯入", driver: "司機完成匯入",
    };

    ws.columns = [
      { header: "單號",     key: "id",          width: 8  },
      { header: "狀態",     key: "status",       width: 10 },
      { header: "資料來源", key: "source",       width: 14 },
      { header: "客戶名稱", key: "customerName", width: 18 },
      { header: "客戶電話", key: "customerPhone",width: 14 },
      { header: "司機",     key: "driver",       width: 12 },
      { header: "提貨日期", key: "pickupDate",   width: 12 },
      { header: "提貨時間", key: "pickupTime",   width: 10 },
      { header: "提貨地址", key: "pickupAddress",width: 30 },
      { header: "到貨日期", key: "deliveryDate", width: 12 },
      { header: "到貨時間", key: "deliveryTime", width: 10 },
      { header: "到貨地址", key: "deliveryAddress",width:30 },
      { header: "運費(元)", key: "totalFee",     width: 12 },
      { header: "收款狀態", key: "feeStatus",    width: 10 },
      { header: "備注",     key: "notes",        width: 24 },
      { header: "建單時間", key: "createdAt",    width: 20 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 22;

    rows.forEach(({ orders: o, drivers: d }) => {
      ws.addRow({
        id:              o.id,
        status:          STATUS_MAP[o.status] ?? o.status,
        source:          SOURCE_MAP[o.source ?? ""] ?? (o.source ?? ""),
        customerName:    o.customerName,
        customerPhone:   o.customerPhone,
        driver:          d?.name ?? "",
        pickupDate:      o.pickupDate ?? "",
        pickupTime:      o.pickupTime ?? "",
        pickupAddress:   o.pickupAddress,
        deliveryDate:    o.deliveryDate ?? "",
        deliveryTime:    o.deliveryTime ?? "",
        deliveryAddress: o.deliveryAddress,
        totalFee:        o.totalFee ?? "",
        feeStatus:       FEE_MAP[o.feeStatus ?? "unpaid"] ?? "",
        notes:           o.notes ?? "",
        createdAt:       o.createdAt ? new Date(o.createdAt).toLocaleString("zh-TW") : "",
      });
    });

    // Zebra stripe
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
      }
    });

    const dateTag = new Date().toLocaleDateString("zh-TW").replace(/\//g, "");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("訂單報表_" + dateTag)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Excel export failed");
    res.status(500).json({ error: "匯出失敗" });
  }
});

/* ─── Delete order ─── */
router.delete("/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Order not found" });
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.json({ ok: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete order");
    res.status(500).json({ error: "刪除失敗" });
  }
});

/* ─── Duplicate order ─── */
router.post("/orders/:id/duplicate", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
    const [src] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!src) return res.status(404).json({ error: "Order not found" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, driverId: _di,
      driverAcceptedAt: _daa, checkInAt: _cia, completedAt: _coa,
      paymentConfirmedAt: _pca, priceLockedAt: _pla, priceLockedBy: _plby,
      priceLocked: _pl, arrivalNotifiedAt: _ana,
      orderGroupId: _ogi, status: _st, feeStatus: _fs,
      ...fields } = src;
    const [newOrder] = await db.insert(ordersTable).values({
      ...fields,
      status: "pending",
      feeStatus: "unpaid",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    const order = await fetchOrderWithDriver(newOrder.id);
    res.json(order);
  } catch (err) {
    req.log.error({ err }, "Failed to duplicate order");
    res.status(500).json({ error: "複製失敗" });
  }
});

export default router;
