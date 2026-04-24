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
import { broadcastWebhook } from "./webhooks.js";
import { autoCalculateSettlement } from "./franchiseSettlements.js";
import { ensureOrderFinanceColumns, calcOrderFinance } from "./orderFinanceColumns.js";

const router: IRouter = Router();

// ─── DB Migration: ensure orders financial + misc columns ─────────────────────
async function ensureOrderColumns() {
  const cols = [
    // 原有
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_field_values TEXT`,
    // 成本與毛利
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_amount      NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_amount    NUMERIC(10,2) DEFAULT 0`,
    // 稅務
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount       NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_tax  NUMERIC(10,2) DEFAULT 0`,
    // 發票
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_no       TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date     DATE`,
    // 車隊結算
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_payout     NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_paid_at    TIMESTAMPTZ`,
  ];
  for (const sql of cols) {
    try { await pool.query(sql); } catch { /* column already exists */ }
  }
  console.log("[OrderMigration] orders column migration complete");
}
ensureOrderColumns().catch(console.error);
ensureOrderFinanceColumns().catch(console.error);

// ─── DB Trigger: auto-calculate order finance fields ──────────────────────────
// cost_amount   = rate_per_trip（司機實領）
// vat_amount    = total_fee / 1.05 × 0.05
// profit_amount = total_fee - cost_amount - vat_amount
// fleet_payout  = rate_per_trip × (1 - commission_rate / 100)  [車隊單才計算]
async function ensureOrderFinanceTrigger() {
  // 1. 觸發器函式
  await pool.query(`
    CREATE OR REPLACE FUNCTION calc_order_finance()
    RETURNS TRIGGER AS $$
    DECLARE
      v_rate   NUMERIC := 0;
      v_comm   NUMERIC := 0;
      v_vat    NUMERIC;
    BEGIN
      -- 從 route_prefix_rates 取得費率（優先 driver_pay_rate，fallback rate_per_trip）
      SELECT COALESCE(NULLIF(driver_pay_rate, 0), rate_per_trip, 0)
        INTO v_rate
        FROM route_prefix_rates
       WHERE prefix = NEW.route_prefix
       LIMIT 1;

      v_rate := COALESCE(v_rate, 0);

      -- 含稅反推銷項稅額（5%）；total_fee 為 NULL 時跳過損益計算
      IF NEW.total_fee IS NOT NULL AND NEW.total_fee > 0 THEN
        v_vat := ROUND((NEW.total_fee / 1.05 * 0.05)::NUMERIC, 2);
        NEW.vat_amount    := v_vat;
        NEW.cost_amount   := v_rate;
        NEW.profit_amount := ROUND((NEW.total_fee - v_rate - v_vat)::NUMERIC, 2);
      ELSE
        -- 無收費（蝦皮外包單）：只記成本，不算損益
        NEW.vat_amount    := 0;
        NEW.cost_amount   := v_rate;
        NEW.profit_amount := NULL;
      END IF;

      -- 車隊結算（有 fusingao_fleet_id 才計算）
      IF NEW.fusingao_fleet_id IS NOT NULL THEN
        SELECT COALESCE(commission_rate, 0)
          INTO v_comm
          FROM fusingao_fleets
         WHERE id = NEW.fusingao_fleet_id
         LIMIT 1;

        NEW.fleet_payout := ROUND(
          (v_rate * (1 - COALESCE(v_comm, 0) / 100))::NUMERIC, 2
        );
      ELSE
        NEW.fleet_payout := 0;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. 掛載觸發器（INSERT 或異動關鍵欄位時觸發）
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_order_finance ON orders;
    CREATE TRIGGER trg_order_finance
      BEFORE INSERT OR UPDATE OF total_fee, route_prefix, fusingao_fleet_id
      ON orders
      FOR EACH ROW EXECUTE FUNCTION calc_order_finance();
  `);

  // 3. 回填現有訂單（冪等；每次重啟執行，不覆蓋 invoice_no 等手動欄位）
  const { rowCount } = await pool.query(`
    UPDATE orders o
       SET cost_amount   = COALESCE(
                             (SELECT COALESCE(NULLIF(pr.driver_pay_rate,0), pr.rate_per_trip, 0)
                                FROM route_prefix_rates pr
                               WHERE pr.prefix = o.route_prefix
                               LIMIT 1), 0),
           -- 有 total_fee 才計算損益；蝦皮外包單無收費設 NULL
           vat_amount    = CASE
                             WHEN o.total_fee > 0
                             THEN ROUND((o.total_fee / 1.05 * 0.05)::NUMERIC, 2)
                             ELSE 0
                           END,
           profit_amount = CASE
                             WHEN o.total_fee > 0
                             THEN ROUND((
                               o.total_fee
                               - COALESCE((SELECT COALESCE(NULLIF(pr.driver_pay_rate,0), pr.rate_per_trip, 0)
                                             FROM route_prefix_rates pr WHERE pr.prefix = o.route_prefix LIMIT 1), 0)
                               - ROUND((o.total_fee / 1.05 * 0.05)::NUMERIC, 2)
                             )::NUMERIC, 2)
                             ELSE NULL
                           END,
           fleet_payout  = CASE
                             WHEN o.fusingao_fleet_id IS NOT NULL THEN
                               ROUND((
                                 COALESCE((SELECT COALESCE(NULLIF(pr.driver_pay_rate,0), pr.rate_per_trip, 0)
                                             FROM route_prefix_rates pr WHERE pr.prefix = o.route_prefix LIMIT 1), 0)
                                 * (1 - COALESCE((SELECT commission_rate FROM fusingao_fleets f WHERE f.id = o.fusingao_fleet_id LIMIT 1), 0) / 100)
                               )::NUMERIC, 2)
                             ELSE 0
                           END
     WHERE o.route_prefix IS NOT NULL OR o.total_fee > 0
  `);
  console.log(`[OrderFinance] trigger installed; ${rowCount} existing orders backfilled`);
}
ensureOrderFinanceTrigger().catch(console.error);

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

// ─── GET /orders/grab-pool — 司機搶單池（待接、未指派的訂單） ──────────────────
// 供司機 APP 顯示可搶訂單清單，每 15 秒輪詢一次
router.get("/orders/grab-pool", async (req, res) => {
  try {
    const { rows } = await pool.query<{
      id: number; pickup_address: string; delivery_address: string;
      cargo_description: string; customer_name: string; customer_phone: string;
      total_fee: number; suggested_price: number; pickup_time: string;
      required_vehicle_type: string; distance_km: number; created_at: string; notes: string;
    }>(`
      SELECT id, pickup_address, delivery_address, cargo_description,
             customer_name, customer_phone, total_fee, suggested_price, pickup_time,
             required_vehicle_type, distance_km, created_at, notes
      FROM orders
      WHERE status = 'pending'
        AND driver_id IS NULL
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ ok: true, orders: rows, fetchedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
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
        o.total_fee, o.base_price, o.extra_fee, o.driver_pay,
        o.required_vehicle_type, o.need_tailgate, o.need_hydraulic_pallet,
        o.source, o.created_at, o.updated_at,
        o.driver_id,
        o.atoms_synced_at, o.atoms_accepted_at, o.atoms_driver_name, o.atoms_driver_phone,
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
      .select({
        orders: ordersTable,
        drivers: driversTable,
        // atoms 欄位（ALTER TABLE 加的，不在 Drizzle schema）
        atomsSyncedAt:    sql<string | null>`orders.atoms_synced_at`,
        atomsAcceptedAt:  sql<string | null>`orders.atoms_accepted_at`,
        atomsDriverName:  sql<string | null>`orders.atoms_driver_name`,
        atomsDriverPhone: sql<string | null>`orders.atoms_driver_phone`,
        atomsDriverId:    sql<string | null>`orders.atoms_driver_id`,
      })
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
      atomsSyncedAt:    row.atomsSyncedAt    ?? null,
      atomsAcceptedAt:  row.atomsAcceptedAt  ?? null,
      atomsDriverName:  row.atomsDriverName  ?? null,
      atomsDriverPhone: row.atomsDriverPhone ?? null,
      atomsDriverId:    row.atomsDriverId    ?? null,
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
    if (body.driverPay !== undefined) updates.driverPay = body.driverPay ?? null;
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
    if (body.cargoQuantity !== undefined) updates.cargoQuantity = body.cargoQuantity ?? null;
    if (body.cargoWeight !== undefined) updates.cargoWeight = body.cargoWeight ?? null;
    if (body.cargoLengthM !== undefined) updates.cargoLengthM = body.cargoLengthM ?? null;
    if (body.cargoWidthM !== undefined) updates.cargoWidthM = body.cargoWidthM ?? null;
    if (body.cargoHeightM !== undefined) updates.cargoHeightM = body.cargoHeightM ?? null;
    if (body.cargoDescription !== undefined) updates.cargoDescription = body.cargoDescription ?? null;
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
      // 自動計算清算並推送 ATOMS 分潤數據
      setImmediate(() => autoCalculateSettlement(order.id).catch(() => {}));
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
          // ── 派單 Webhook 廣播（Atoms 等外部系統）──
          broadcastWebhook("order.assigned", {
            order_id:         order.id,
            status:           "assigned",
            customer_name:    order.customerName,
            customer_phone:   order.customerPhone,
            pickup_date:      order.pickupDate,
            pickup_time:      order.pickupTime,
            pickup_address:   order.pickupAddress,
            delivery_date:    order.deliveryDate,
            delivery_time:    order.deliveryTime,
            delivery_address: order.deliveryAddress,
            cargo_description: order.cargoDescription,
            total_fee:        order.totalFee,
            notes:            order.notes,
            driver_id:        driver?.id ?? null,
            driver_name:      driver?.name ?? null,
            driver_phone:     driver?.phone ?? null,
            driver_license:   driver?.licensePlate ?? null,
            driver_vehicle:   driver?.vehicleType ?? null,
            assigned_at:      new Date().toISOString(),
            // Callback URL: Atoms 接單後回傳此端點
            callback_url: `${process.env.APP_BASE_URL ?? ""}/api/v1/webhook/atoms-accept`,
          })
          .then(() => {
            // ── 廣播成功 → 標記 atoms_synced_at ──
            db.execute(sql`
              UPDATE orders SET atoms_synced_at = NOW(), updated_at = NOW()
              WHERE id = ${order.id} AND atoms_synced_at IS NULL
            `).catch(() => {});
          })
          .catch((e: Error) => log.warn({ err: e }, "[Webhook] order.assigned broadcast failed"));
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
      // 自動計算清算並推送 ATOMS 分潤數據
      setImmediate(() => autoCalculateSettlement(id).catch(() => {}));
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
      { header: "單號",     key: "id",            width: 8  },
      { header: "狀態",     key: "status",         width: 10 },
      { header: "資料來源", key: "source",         width: 14 },
      { header: "客戶名稱", key: "customerName",   width: 18 },
      { header: "客戶電話", key: "customerPhone",  width: 14 },
      { header: "司機",     key: "driver",         width: 12 },
      { header: "提貨日期", key: "pickupDate",     width: 12 },
      { header: "提貨時間", key: "pickupTime",     width: 10 },
      { header: "提貨地址", key: "pickupAddress",  width: 30 },
      { header: "到貨日期", key: "deliveryDate",   width: 12 },
      { header: "到貨時間", key: "deliveryTime",   width: 10 },
      { header: "到貨地址", key: "deliveryAddress",width: 30 },
      { header: "運費(元)", key: "totalFee",       width: 12 },
      { header: "收款狀態", key: "feeStatus",      width: 10 },
      { header: "備注",     key: "notes",          width: 24 },
      { header: "建單人員", key: "operatorName",   width: 14 },
      { header: "建單時間", key: "createdAt",      width: 20 },
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
        operatorName:    o.operatorName ?? "",
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
