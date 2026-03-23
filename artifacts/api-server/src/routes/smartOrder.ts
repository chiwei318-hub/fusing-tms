import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, driversTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, isNull, or, ne } from "drizzle-orm";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  sendDispatchNotification,
  sendCustomerDispatch,
  sendCustomerStatusUpdate,
} from "../lib/line.js";

export const smartOrderRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig(): Promise<Record<string, string>> {
  const rows = await db.execute(sql`SELECT key, value FROM pricing_config`);
  const cfg: Record<string, string> = {};
  for (const row of rows.rows as { key: string; value: string }[]) cfg[row.key] = row.value;
  return cfg;
}

function getPeakMultiplier(cfg: Record<string, string>, pickupTime?: string): number {
  if (!pickupTime) return 1;
  const h = parseInt(pickupTime.split(":")[0] ?? "12", 10);
  const peakHours = cfg.peak_hours ?? "7-9,17-19";
  const nightHours = cfg.night_hours ?? "22-6";
  for (const range of peakHours.split(",")) {
    const [s, e] = range.split("-").map(Number);
    if (s !== undefined && e !== undefined && h >= s && h < e) return parseFloat(cfg.peak_multiplier ?? "1.2");
  }
  const [ns, ne2] = nightHours.split("-").map(Number);
  if (ns !== undefined && ne2 !== undefined && (h >= ns || h < ne2)) return parseFloat(cfg.night_multiplier ?? "1.3");
  return 1;
}

function calcBasePrice(params: {
  distanceKm?: number;
  cargoWeightKg?: number;
  cargoVolumeCbm?: number;
  vehicleType?: string;
  needTailgate?: boolean;
  needHydraulicPallet?: boolean;
  waitingHours?: number;
  cfg: Record<string, string>;
}): number {
  const dist = params.distanceKm ?? 0;
  const weight = params.cargoWeightKg ?? 0;
  const vol = params.cargoVolumeCbm ?? 0;

  // Vehicle base prices
  const vehicleBases: Record<string, number> = {
    "1.75T": 1500, "3.5T": 2000, "5T": 2800, "8.8T": 3500,
    "10.5T": 4200, "15T": 5500, "17T": 5000, "26T": 7000,
    "35T": 9000, "43T": 11000,
  };
  const vBase = params.vehicleType ? (vehicleBases[params.vehicleType] ?? 2000) : 2000;
  const perKm = params.vehicleType?.includes("T") ? Math.max(18, parseFloat(params.vehicleType) * 1.5) : 20;

  let price = vBase + dist * perKm;
  if (weight > 1000) price += (weight - 1000) * 0.5;
  if (vol > 5) price += (vol - 5) * 200;
  if (params.needTailgate) price += 800;
  if (params.needHydraulicPallet) price += 600;
  if (params.waitingHours && params.waitingHours > 1) price += (params.waitingHours - 1) * 500;

  return Math.round(price);
}

// ─── POST /api/smart-quote ─────────────────────────────────────────────────────

smartOrderRouter.post("/smart-quote", async (req, res) => {
  try {
    const schema = z.object({
      distanceKm: z.coerce.number().min(0).optional(),
      cargoWeightKg: z.coerce.number().min(0).optional(),
      cargoLengthM: z.coerce.number().min(0).optional(),
      cargoWidthM: z.coerce.number().min(0).optional(),
      cargoHeightM: z.coerce.number().min(0).optional(),
      vehicleType: z.string().optional(),
      needTailgate: z.boolean().optional(),
      needHydraulicPallet: z.boolean().optional(),
      waitingHours: z.coerce.number().min(0).optional(),
      pickupTime: z.string().optional(),
      pickupAddress: z.string().optional(),
      deliveryAddress: z.string().optional(),
    });
    const p = schema.parse(req.body);
    const cfg = await getConfig();

    const vol = (p.cargoLengthM ?? 0) * (p.cargoWidthM ?? 0) * (p.cargoHeightM ?? 0);
    const baseRaw = calcBasePrice({
      distanceKm: p.distanceKm, cargoWeightKg: p.cargoWeightKg,
      cargoVolumeCbm: vol, vehicleType: p.vehicleType,
      needTailgate: p.needTailgate, needHydraulicPallet: p.needHydraulicPallet,
      waitingHours: p.waitingHours, cfg,
    });

    const profitRate = parseFloat(cfg.base_profit_rate ?? "25") / 100;
    const minProfitRate = parseFloat(cfg.min_profit_rate ?? "10") / 100;
    const peakMult = getPeakMultiplier(cfg, p.pickupTime);

    const suggestedPrice = Math.round(baseRaw * (1 + profitRate));
    const minPrice = Math.round(baseRaw * (1 + minProfitRate));
    const peakPrice = peakMult > 1 ? Math.round(suggestedPrice * peakMult) : null;

    const expiresAt = new Date(Date.now() + parseInt(cfg.quote_expires_minutes ?? "30") * 60000);

    const breakdown = {
      base: baseRaw,
      profitMargin: Math.round(baseRaw * profitRate),
      suggested: suggestedPrice,
      min: minPrice,
      peak: peakPrice,
      peakMultiplier: peakMult,
      isPeakHour: peakMult > 1,
      taxRate: 5,
      withTax: Math.round(suggestedPrice * 1.05),
      expiresAt: expiresAt.toISOString(),
      expiresMinutes: parseInt(cfg.quote_expires_minutes ?? "30"),
    };

    return res.json({ breakdown });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// ─── GET /api/pricing-config ───────────────────────────────────────────────────

smartOrderRouter.get("/pricing-config", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT id, key, value, label, updated_at FROM pricing_config ORDER BY id`);
    return res.json(rows.rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/pricing-config ───────────────────────────────────────────────────

smartOrderRouter.put("/pricing-config", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await db.execute(sql`
        UPDATE pricing_config SET value = ${value}, updated_at = NOW() WHERE key = ${key}
      `);
    }
    const rows = await db.execute(sql`SELECT id, key, value, label FROM pricing_config ORDER BY id`);
    return res.json(rows.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/orders/:id/process-payment ─────────────────────────────────────

smartOrderRouter.post("/orders/:id/process-payment", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      method: z.enum(["cash", "bank_transfer", "line_pay", "credit_card"]),
      amount: z.coerce.number().positive(),
      transactionId: z.string().optional(),
      note: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const now = new Date();

    // Record payment
    await db.insert(paymentsTable).values({
      orderId: id,
      amount: data.amount,
      method: data.method,
      note: data.note ?? null,
      receiptNumber: data.transactionId ?? `TXN-${Date.now()}`,
    });

    // Update order payment status
    await db.update(ordersTable).set({
      feeStatus: "paid",
      paymentConfirmedAt: now,
      paymentGateway: data.method,
      paymentTransactionId: data.transactionId ?? `TXN-${Date.now()}`,
      totalFee: data.amount,
      updatedAt: now,
    } as any).where(eq(ordersTable.id, id));

    const updatedOrder = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1).then(r => r[0]);

    // Auto-dispatch if enabled
    let dispatchResult = null;
    const cfg = await getConfig();
    if (cfg.auto_dispatch === "true") {
      dispatchResult = await runAutoDispatch(id, updatedOrder, cfg);
    }

    return res.json({
      success: true,
      paymentMethod: data.method,
      amount: data.amount,
      confirmedAt: now.toISOString(),
      autoDispatch: dispatchResult,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message ?? "Payment failed" });
  }
});

// ─── POST /api/orders/:id/auto-dispatch ───────────────────────────────────────

smartOrderRouter.post("/orders/:id/auto-dispatch", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const cfg = await getConfig();
    const result = await runAutoDispatch(id, order, cfg);
    return res.json(result);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message ?? "Dispatch failed" });
  }
});

// ─── Core auto-dispatch logic ──────────────────────────────────────────────────

async function runAutoDispatch(
  orderId: number,
  order: any,
  cfg: Record<string, string>,
): Promise<{ success: boolean; driverId?: number; driverName?: string; reason?: string }> {
  try {
    // Get active drivers not currently assigned
    const drivers = await db.select().from(driversTable);

    // Find available drivers (not assigned to active orders)
    const busyDriverIds = await db
      .select({ driverId: ordersTable.driverId })
      .from(ordersTable)
      .where(and(
        or(eq(ordersTable.status, "assigned"), eq(ordersTable.status, "in_transit")),
        ne(ordersTable.id, orderId),
      ))
      .then(rows => new Set(rows.map(r => r.driverId).filter(Boolean)));

    const available = drivers.filter(d => {
      if (busyDriverIds.has(d.id)) return false;
      if ((d as any).status === "inactive" || (d as any).status === "offline") return false;
      return true;
    });

    if (available.length === 0) {
      // Log failed attempt
      await db.execute(sql`
        INSERT INTO dispatch_log (order_id, action, reason) VALUES (${orderId}, 'failed', '無可用司機')
      `);
      await db.update(ordersTable).set({
        dispatchAttempts: (order.dispatchAttempts ?? 0) + 1,
        updatedAt: new Date(),
      } as any).where(eq(ordersTable.id, orderId));
      return { success: false, reason: "無可用司機，請手動指派或稍後重試" };
    }

    // Score each driver
    const required = (order.requiredVehicleType ?? "").toLowerCase();
    const scored = available.map(d => {
      let score = 50; // base score
      const dType = ((d as any).vehicleType ?? "").toLowerCase();
      if (required && dType === required) score += 40;
      else if (required && dType.includes(required.replace(/[^0-9.]/g, ""))) score += 20;
      else if (!required) score += 20;
      // Prefer drivers with fewer recent orders (lower workload)
      score += Math.random() * 10; // tie-break with small random factor
      return { driver: d, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;

    const now = new Date();
    await db.update(ordersTable).set({
      driverId: best.driver.id,
      status: "assigned",
      autoDispatchedAt: now,
      dispatchAttempts: (order.dispatchAttempts ?? 0) + 1,
      updatedAt: now,
    } as any).where(eq(ordersTable.id, orderId));

    // Log success
    await db.execute(sql`
      INSERT INTO dispatch_log (order_id, driver_id, action, reason, score)
      VALUES (${orderId}, ${best.driver.id}, 'assigned', '自動派車', ${best.score})
    `);

    // Notifications (fire and forget)
    setImmediate(async () => {
      try {
        const driverLineId = (best.driver as any).lineUserId;
        if (driverLineId) {
          await sendDispatchNotification(driverLineId, {
            id: orderId,
            pickupAddress: order.pickupAddress,
            deliveryAddress: order.deliveryAddress,
            cargoDescription: order.cargoDescription,
            customerName: order.customerName,
            customerPhone: order.customerPhone ?? undefined,
          });
        }
        const customerLineId = null; // Would need customer LINE ID
        if (customerLineId) {
          await sendCustomerDispatch(customerLineId, {
            orderId,
            driverName: (best.driver as any).name ?? "司機",
            driverPhone: (best.driver as any).phone ?? "",
            vehicleType: (best.driver as any).vehicleType ?? "",
            plateNumber: (best.driver as any).plateNumber ?? "",
          });
        }
      } catch { /* LINE not configured */ }
    });

    return {
      success: true,
      driverId: best.driver.id,
      driverName: (best.driver as any).name ?? "司機",
    };
  } catch (e: any) {
    console.error("[AutoDispatch]", e);
    return { success: false, reason: e.message };
  }
}

// ─── GET /api/smart-orders (pipeline view) ────────────────────────────────────

smartOrderRouter.get("/smart-orders", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .orderBy(ordersTable.createdAt);

    const result = rows.map(r => ({
      ...r.orders,
      driver: r.drivers ?? null,
      pipeline: getPipelineStage(r.orders),
    }));
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/dispatch-log ─────────────────────────────────────────────────────

smartOrderRouter.get("/dispatch-log", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT dl.*, d.name as driver_name, o.customer_name, o.pickup_address, o.delivery_address
      FROM dispatch_log dl
      LEFT JOIN drivers d ON dl.driver_id = d.id
      LEFT JOIN orders o ON dl.order_id = o.id
      ORDER BY dl.created_at DESC
      LIMIT 100
    `);
    return res.json(rows.rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

function getPipelineStage(order: any): string {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "delivered") return "completed";
  if (order.status === "in_transit") return "in_transit";
  if (order.status === "assigned") return "dispatched";
  if (order.feeStatus === "paid") return "paid";
  if (order.totalFee || order.suggestedPrice) return "quoted";
  return "new";
}
