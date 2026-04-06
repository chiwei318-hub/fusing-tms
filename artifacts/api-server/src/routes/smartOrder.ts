import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, driversTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, or, ne, inArray, not } from "drizzle-orm";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  sendDispatchNotification,
  sendCustomerDispatch,
} from "../lib/line.js";
import { getDistanceKm } from "../lib/distanceService";

export const smartOrderRouter = Router();

// ─── Constants & Types ─────────────────────────────────────────────────────────

const VEHICLE_TONNAGE: Record<string, number> = {
  "機車": 0.1, "1.75T": 1.75, "3.5T": 3.5, "5T": 5, "8.8T": 8.8,
  "10.5T": 10.5, "15T": 15, "17T": 17, "26T": 26, "35T": 35, "43T": 43,
  "箱型車": 3.5, "小貨車": 1.75, "貨車": 8.8,
};

const VEHICLE_BASES: Record<string, number> = {
  "機車": 300, "1.75T": 1500, "3.5T": 2000, "5T": 2800, "8.8T": 3500,
  "10.5T": 4200, "15T": 5500, "17T": 5000, "26T": 7000, "35T": 9000, "43T": 11000,
  "箱型車": 2000, "小貨車": 1500, "貨車": 3500,
};

interface DriverRow {
  id: number; name: string; phone: string; vehicleType: string;
  licensePlate: string; status: string; lat?: number | null; lng?: number | null;
  currentLocation?: string | null; maxLoadKg?: number | null;
  currentLoadKg?: number | null; todayKm?: number | null; todayRevenue?: number | null;
  lineUserId?: string | null; vehicleTonnage?: string | null;
  driverType?: string | null;
}

interface ScoreBreakdown {
  driverId: number; driverName: string; phone: string;
  vehicleType: string; licensePlate: string; status: string;
  totalScore: number;
  distanceScore: number; vehicleScore: number; profitScore: number; timeScore: number;
  carpoolBonus: number; returnTripBonus: number;
  estimatedDistanceKm: number;
  estimatedRevenue: number; estimatedCost: number; estimatedProfit: number;
  isCarpool: boolean; isReturnTrip: boolean;
  savingsKm: number;
  reason: string; reasonDetail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig(): Promise<Record<string, string>> {
  const rows = await db.execute(sql`SELECT key, value FROM pricing_config`);
  const cfg: Record<string, string> = {};
  for (const row of rows.rows as { key: string; value: string }[]) cfg[row.key] = row.value;
  return cfg;
}

/** Haversine distance in km */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough geocode from address keyword (Taiwan cities) */
function geocodeAddress(addr: string): { lat: number; lng: number } | null {
  const locations: [string[], number, number][] = [
    [["台北", "信義", "中正", "大安", "松山", "內湖", "南港"], 25.048, 121.517],
    [["新北", "板橋", "中和", "永和", "新莊", "三重", "土城"], 25.010, 121.466],
    [["桃園", "中壢", "楊梅", "平鎮"], 24.993, 121.301],
    [["新竹", "湖口", "竹北", "竹東"], 24.803, 120.968],
    [["台中", "西屯", "北屯", "南屯", "豐原"], 24.148, 120.674],
    [["彰化", "員林", "鹿港"], 24.074, 120.536],
    [["嘉義", "朴子", "水上"], 23.480, 120.449],
    [["台南", "永康", "東區", "南區", "安平"], 22.999, 120.226],
    [["高雄", "三民", "苓雅", "左營", "鳳山", "楠梓"], 22.627, 120.302],
    [["屏東", "潮州", "東港"], 22.670, 120.487],
    [["基隆", "七堵", "暖暖"], 25.128, 121.740],
    [["宜蘭", "羅東", "礁溪"], 24.757, 121.753],
    [["花蓮", "吉安", "壽豐"], 23.992, 121.602],
    [["台東", "成功", "關山"], 22.755, 121.144],
  ];
  for (const [keywords, lat, lng] of locations) {
    if (keywords.some(k => addr.includes(k))) return { lat, lng };
  }
  return null;
}

function getPeakMultiplier(cfg: Record<string, string>, pickupTime?: string): number {
  if (!pickupTime) return 1;
  const h = parseInt(pickupTime.split(":")[0] ?? "12", 10);
  for (const range of (cfg.peak_hours ?? "7-9,17-19").split(",")) {
    const [s, e] = range.split("-").map(Number);
    if (s !== undefined && e !== undefined && h >= s && h < e)
      return parseFloat(cfg.peak_multiplier ?? "1.2");
  }
  const [ns, ne2] = (cfg.night_hours ?? "22-6").split("-").map(Number);
  if (ns !== undefined && ne2 !== undefined && (h >= ns || h < ne2))
    return parseFloat(cfg.night_multiplier ?? "1.3");
  return 1;
}

function calcBasePrice(distanceKm: number, vehicleType: string, weightKg = 0, extras = 0): number {
  const vBase = VEHICLE_BASES[vehicleType] ?? 2000;
  const ton = VEHICLE_TONNAGE[vehicleType] ?? 3.5;
  const perKm = Math.max(15, ton * 1.8);
  let price = vBase + distanceKm * perKm;
  if (weightKg > 1000) price += (weightKg - 1000) * 0.5;
  return Math.round(price + extras);
}

function calcDriverCost(distanceKm: number, vehicleType: string): number {
  const ton = VEHICLE_TONNAGE[vehicleType] ?? 3.5;
  const fuelPerKm = ton * 0.4; // rough L/km
  const fuelPrice = 30; // NT$/L
  const salaryPerKm = 8;
  return Math.round(distanceKm * (fuelPerKm * fuelPrice + salaryPerKm) + 500);
}

/** Score a driver against an order */
function scoreDriver(
  driver: DriverRow,
  order: any,
  allOrders: any[],
  cfg: Record<string, string>,
  pickupLoc: { lat: number; lng: number } | null,
): ScoreBreakdown {
  const wDist = parseFloat(cfg.w_distance ?? "30");
  const wVehicle = parseFloat(cfg.w_vehicle ?? "25");
  const wProfit = parseFloat(cfg.w_profit ?? "30");
  const wTime = parseFloat(cfg.w_time ?? "15");
  const carpoolBonus = parseFloat(cfg.carpool_bonus ?? "25");
  const returnBonus = parseFloat(cfg.return_bonus ?? "30");
  const maxDispatchKm = parseFloat(cfg.max_dispatch_km ?? "80");
  const carpoolRadiusKm = parseFloat(cfg.carpool_radius_km ?? "20");

  // ── Distance Score ──
  let estimatedDistanceKm = 25; // default estimate
  let distanceScore = 50;
  let savingsKm = 0;

  if (driver.lat && driver.lng && pickupLoc) {
    estimatedDistanceKm = haversine(driver.lat, driver.lng, pickupLoc.lat, pickupLoc.lng);
    distanceScore = Math.max(0, Math.round(100 - (estimatedDistanceKm / maxDispatchKm) * 100));
  } else if (driver.currentLocation) {
    const driverLoc = geocodeAddress(driver.currentLocation);
    if (driverLoc && pickupLoc) {
      estimatedDistanceKm = haversine(driverLoc.lat, driverLoc.lng, pickupLoc.lat, pickupLoc.lng);
      distanceScore = Math.max(0, Math.round(100 - (estimatedDistanceKm / maxDispatchKm) * 100));
    }
  }

  // ── Vehicle Score ──
  const requiredTon = VEHICLE_TONNAGE[order.requiredVehicleType ?? ""] ?? 0;
  const driverTon = VEHICLE_TONNAGE[driver.vehicleTonnage ?? driver.vehicleType ?? ""] ?? 3.5;
  let vehicleScore = 0;
  const orderVehicle = order.requiredVehicleType ?? "";

  if (!orderVehicle) {
    vehicleScore = 80; // no requirement
  } else if (driver.vehicleType === orderVehicle || driver.vehicleTonnage === orderVehicle) {
    vehicleScore = 100; // exact match
  } else if (driverTon >= requiredTon && driverTon <= requiredTon * 1.5) {
    vehicleScore = 75; // slightly oversized (ok, small waste)
  } else if (driverTon > requiredTon * 1.5) {
    vehicleScore = 40; // too big (cost inefficient)
  } else if (driverTon >= requiredTon * 0.8) {
    vehicleScore = 30; // slightly undersized (risky)
  } else {
    vehicleScore = 0; // cannot do
  }

  // ── Profit Score ──
  const orderFee = order.totalFee ?? order.suggestedPrice ?? calcBasePrice(estimatedDistanceKm, driver.vehicleType ?? "箱型車");
  const driverCost = calcDriverCost(estimatedDistanceKm, driver.vehicleType ?? "箱型車");
  const profit = orderFee - driverCost;
  const profitRate = orderFee > 0 ? profit / orderFee : 0;
  const profitScore = Math.max(0, Math.min(100, Math.round(profitRate * 200))); // 50% margin = 100 score

  // ── Time Score ──
  let timeScore = 70; // default
  if (order.pickupDate && order.pickupTime) {
    const pickupDt = new Date(`${order.pickupDate}T${order.pickupTime}`);
    const now = new Date();
    const hoursUntil = (pickupDt.getTime() - now.getTime()) / 3600000;
    if (hoursUntil < 1) timeScore = 100;
    else if (hoursUntil < 3) timeScore = 85;
    else if (hoursUntil < 8) timeScore = 70;
    else if (hoursUntil < 24) timeScore = 55;
    else timeScore = 40;
  }

  // ── Return Trip Detection ──
  let isReturnTrip = false;
  let returnTripBonusScore = 0;
  const driverActiveOrder = allOrders.find(
    o => o.driverId === driver.id &&
      (o.status === "assigned" || o.status === "in_transit") &&
      o.id !== order.id
  );
  if (driverActiveOrder && pickupLoc) {
    const deliveryLoc = geocodeAddress(driverActiveOrder.deliveryAddress ?? "");
    if (deliveryLoc) {
      const dist = haversine(deliveryLoc.lat, deliveryLoc.lng, pickupLoc.lat, pickupLoc.lng);
      if (dist < carpoolRadiusKm) {
        isReturnTrip = true;
        returnTripBonusScore = returnBonus;
        savingsKm = dist;
      }
    }
  }

  // ── Carpool Detection ──
  let isCarpool = false;
  let carpoolBonusScore = 0;
  if (driverActiveOrder && order.deliveryAddress) {
    const delivLoc1 = geocodeAddress(driverActiveOrder.deliveryAddress ?? "");
    const delivLoc2 = geocodeAddress(order.deliveryAddress ?? "");
    if (delivLoc1 && delivLoc2) {
      const dist = haversine(delivLoc1.lat, delivLoc1.lng, delivLoc2.lat, delivLoc2.lng);
      if (dist < carpoolRadiusKm * 1.5) {
        const driverLoad = driver.currentLoadKg ?? 0;
        const maxLoad = driver.maxLoadKg ?? driverTon * 1000;
        const orderWeight = order.cargoWeight ?? 500;
        if (driverLoad + orderWeight <= maxLoad * 0.9) {
          isCarpool = true;
          carpoolBonusScore = carpoolBonus;
          savingsKm = Math.max(savingsKm, estimatedDistanceKm * 0.3);
        }
      }
    }
  }

  // ── Total Score ──
  const totalScore = Math.round(
    (distanceScore * wDist + vehicleScore * wVehicle + profitScore * wProfit + timeScore * wTime) / 100
    + returnTripBonusScore + carpoolBonusScore
  );

  // ── Reason text ──
  const reasons: string[] = [];
  if (distanceScore >= 70) reasons.push(`近距離 ${Math.round(estimatedDistanceKm)}km`);
  if (vehicleScore === 100) reasons.push("車型完全符合");
  else if (vehicleScore >= 75) reasons.push("車型相容");
  if (profitScore >= 60) reasons.push(`高毛利 ${Math.round(profitRate * 100)}%`);
  if (isReturnTrip) reasons.push(`回頭車省 ${Math.round(savingsKm)}km`);
  if (isCarpool) reasons.push("可拼車");
  if (timeScore >= 85) reasons.push("緊急訂單優先");

  const reasonDetail = [
    `距離評分 ${distanceScore}分（司機距取貨點約 ${Math.round(estimatedDistanceKm)}km）`,
    `車型評分 ${vehicleScore}分（司機：${driver.vehicleType}，需求：${order.requiredVehicleType ?? "無限制"}）`,
    `收益評分 ${profitScore}分（預估收益 NT$${Math.round(profit).toLocaleString()}，毛利率 ${Math.round(profitRate * 100)}%）`,
    `時效評分 ${timeScore}分`,
    isReturnTrip ? `✅ 回頭車加分 +${returnBonus}（省 ${Math.round(savingsKm)}km）` : "",
    isCarpool ? `✅ 拼車加分 +${carpoolBonus}（可與現有訂單同路）` : "",
  ].filter(Boolean).join("；");

  return {
    driverId: driver.id,
    driverName: driver.name,
    phone: driver.phone,
    vehicleType: driver.vehicleType,
    licensePlate: driver.licensePlate,
    status: driver.status,
    totalScore,
    distanceScore, vehicleScore, profitScore, timeScore,
    carpoolBonus: carpoolBonusScore, returnTripBonus: returnTripBonusScore,
    estimatedDistanceKm: Math.round(estimatedDistanceKm * 10) / 10,
    estimatedRevenue: Math.round(orderFee),
    estimatedCost: Math.round(driverCost),
    estimatedProfit: Math.round(profit),
    isCarpool, isReturnTrip,
    savingsKm: Math.round(savingsKm * 10) / 10,
    reason: reasons.join("、") || "系統最佳配對",
    reasonDetail,
  };
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

    const extras = (p.needTailgate ? 800 : 0) + (p.needHydraulicPallet ? 600 : 0)
      + (p.waitingHours && p.waitingHours > 1 ? (p.waitingHours - 1) * 500 : 0);
    const baseRaw = calcBasePrice(p.distanceKm ?? 20, p.vehicleType ?? "箱型車", p.cargoWeightKg ?? 0, extras);

    const profitRate = parseFloat(cfg.base_profit_rate ?? "25") / 100;
    const minProfitRate = parseFloat(cfg.min_profit_rate ?? "10") / 100;
    const peakMult = getPeakMultiplier(cfg, p.pickupTime);

    const suggestedPrice = Math.round(baseRaw * (1 + profitRate));
    const minPrice = Math.round(baseRaw * (1 + minProfitRate));
    const peakPrice = peakMult > 1 ? Math.round(suggestedPrice * peakMult) : null;

    const expiresAt = new Date(Date.now() + parseInt(cfg.quote_expires_minutes ?? "30") * 60000);

    return res.json({
      breakdown: {
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
      },
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// ─── GET /api/pricing-config ───────────────────────────────────────────────────

smartOrderRouter.get("/pricing-config", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT id, key, value, label, updated_at FROM pricing_config ORDER BY id`);
    return res.json(rows.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── PUT /api/pricing-config ───────────────────────────────────────────────────

smartOrderRouter.put("/pricing-config", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await db.execute(sql`UPDATE pricing_config SET value = ${value}, updated_at = NOW() WHERE key = ${key}`);
    }
    const rows = await db.execute(sql`SELECT id, key, value, label FROM pricing_config ORDER BY id`);
    return res.json(rows.rows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── POST /api/orders/:id/analyze-dispatch ── (preview candidates) ─────────────

smartOrderRouter.post("/orders/:id/analyze-dispatch", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const cfg = await getConfig();
    const { candidates, busyIds } = await findCandidates(id, order, cfg);

    return res.json({
      orderId: id,
      candidates: candidates.slice(0, 5),
      excluded: busyIds.length,
      cfg: {
        wDistance: cfg.w_distance, wVehicle: cfg.w_vehicle,
        wProfit: cfg.w_profit, wTime: cfg.w_time,
      },
    });
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
    await db.insert(paymentsTable).values({
      orderId: id, amount: data.amount, method: data.method,
      note: data.note ?? null,
      receiptNumber: data.transactionId ?? `TXN-${Date.now()}`,
    });
    await db.update(ordersTable).set({
      feeStatus: "paid", paymentConfirmedAt: now,
      paymentGateway: data.method,
      paymentTransactionId: data.transactionId ?? `TXN-${Date.now()}`,
      totalFee: data.amount, updatedAt: now,
    } as any).where(eq(ordersTable.id, id));

    const updatedOrder = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1).then(r => r[0]);

    let dispatchResult = null;
    const cfg = await getConfig();
    if (cfg.auto_dispatch === "true") {
      dispatchResult = await runAutoDispatch(id, updatedOrder, cfg);
    }

    return res.json({
      success: true, paymentMethod: data.method, amount: data.amount,
      confirmedAt: now.toISOString(), autoDispatch: dispatchResult,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Payment failed" });
  }
});

// ─── POST /api/orders/:id/auto-dispatch ───────────────────────────────────────

smartOrderRouter.post("/orders/:id/auto-dispatch", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body as { driverId?: number };
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const cfg = await getConfig();

    // Manual override: specific driver
    if (body.driverId) {
      const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, body.driverId)).limit(1);
      if (!driver) return res.status(404).json({ error: "Driver not found" });
      const result = await assignDriver(id, order, driver as DriverRow, cfg, true);
      return res.json(result);
    }

    const result = await runAutoDispatch(id, order, cfg);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Dispatch failed" });
  }
});

// ─── GET /api/drivers/availability ────────────────────────────────────────────

smartOrderRouter.get("/drivers/availability", async (_req, res) => {
  try {
    const drivers = await db.select().from(driversTable);
    const activeOrders = await db.select().from(ordersTable)
      .where(or(eq(ordersTable.status, "assigned"), eq(ordersTable.status, "in_transit")));

    const driverOrderMap: Record<number, any[]> = {};
    for (const o of activeOrders) {
      if (o.driverId) {
        if (!driverOrderMap[o.driverId]) driverOrderMap[o.driverId] = [];
        driverOrderMap[o.driverId]!.push(o);
      }
    }

    const result = drivers.map(d => ({
      ...d,
      activeOrders: driverOrderMap[d.id] ?? [],
      isBusy: (driverOrderMap[d.id]?.length ?? 0) > 0,
      orderCount: driverOrderMap[d.id]?.length ?? 0,
    }));
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ─── PUT /api/drivers/:id/location ────────────────────────────────────────────

smartOrderRouter.put("/drivers/:id/location", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { lat, lng, currentLocation } = req.body as { lat?: number; lng?: number; currentLocation?: string };
    await db.execute(sql`
      UPDATE drivers SET lat=${lat ?? null}, lng=${lng ?? null},
      current_location=${currentLocation ?? null} WHERE id=${id}
    `);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── GET /api/revenue-stats ────────────────────────────────────────────────────

smartOrderRouter.get("/revenue-stats", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS total_orders,
        COUNT(*) FILTER (WHERE fee_status='paid') AS paid_orders,
        COALESCE(SUM(total_fee) FILTER (WHERE fee_status='paid'), 0) AS total_revenue,
        COUNT(*) FILTER (WHERE auto_dispatched_at IS NOT NULL) AS auto_dispatched,
        COUNT(*) FILTER (WHERE driver_id IS NULL AND status NOT IN ('cancelled','delivered')) AS unassigned,
        COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL) AS active_drivers
      FROM orders
    `);
    const carpoolRows = await db.execute(sql`
      SELECT COUNT(*) AS carpool_count FROM dispatch_log WHERE is_carpool=true
    `);
    const returnRows = await db.execute(sql`
      SELECT COUNT(*) AS return_count FROM dispatch_log WHERE is_return_trip=true
    `);
    const savingsRows = await db.execute(sql`
      SELECT COALESCE(SUM(savings_km),0) AS total_savings_km FROM dispatch_log
    `);

    const stats = rows.rows[0] as any;
    const totalOrders = parseInt(stats.total_orders ?? "0");
    const unassigned = parseInt(stats.unassigned ?? "0");
    const emptyRate = totalOrders > 0 ? 0 : 0; // would need trip data for real empty rate

    return res.json({
      ...stats,
      carpool_count: (carpoolRows.rows[0] as any)?.carpool_count ?? 0,
      return_trip_count: (returnRows.rows[0] as any)?.return_count ?? 0,
      total_savings_km: (savingsRows.rows[0] as any)?.total_savings_km ?? 0,
    });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/smart-orders ─────────────────────────────────────────────────────

smartOrderRouter.get("/smart-orders", async (_req, res) => {
  try {
    const rows = await db.select().from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id));
    const result = rows.map(r => ({
      ...r.orders, driver: r.drivers ?? null,
      pipeline: getPipelineStage(r.orders),
    }));
    return res.json(result);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/dispatch-log ─────────────────────────────────────────────────────

smartOrderRouter.get("/dispatch-log", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT dl.*, d.name AS driver_name, d.vehicle_type,
             o.customer_name, o.pickup_address, o.delivery_address, o.total_fee
      FROM dispatch_log dl
      LEFT JOIN drivers d ON dl.driver_id = d.id
      LEFT JOIN orders o ON dl.order_id = o.id
      ORDER BY dl.created_at DESC LIMIT 100
    `);
    return res.json(rows.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Core functions ────────────────────────────────────────────────────────────

async function findCandidates(
  orderId: number,
  order: any,
  cfg: Record<string, string>,
): Promise<{ candidates: ScoreBreakdown[]; busyIds: number[] }> {
  const allDrivers = await db.select().from(driversTable);
  const allOrders = await db.select().from(ordersTable);

  const busyDriverIds = new Set(
    allOrders
      .filter(o => (o.status === "assigned" || o.status === "in_transit") && o.id !== orderId && o.driverId)
      .map(o => o.driverId!)
  );

  const pickupLoc = order.pickupAddress ? geocodeAddress(order.pickupAddress) : null;

  const available = allDrivers.filter(d => {
    if (d.status === "offline") return false;
    return true; // busy drivers can be considered (they might be doing carpool/return)
  });

  const scored = available.map(d =>
    scoreDriver(d as DriverRow, order, allOrders, cfg, pickupLoc)
  );

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return { candidates: scored, busyIds: Array.from(busyDriverIds) };
}

async function assignDriver(
  orderId: number,
  order: any,
  driver: DriverRow,
  cfg: Record<string, string>,
  isManual = false,
): Promise<{ success: boolean; driverId?: number; driverName?: string; reason?: string; score?: ScoreBreakdown }> {
  const allOrders = await db.select().from(ordersTable);
  const pickupLoc = order.pickupAddress ? geocodeAddress(order.pickupAddress) : null;
  const score = scoreDriver(driver, order, allOrders, cfg, pickupLoc);

  const now = new Date();
  await db.update(ordersTable).set({
    driverId: driver.id, status: "assigned",
    autoDispatchedAt: now, updatedAt: now,
  } as any).where(eq(ordersTable.id, orderId));

  await db.execute(sql`
    INSERT INTO dispatch_log
      (order_id, driver_id, action, reason, reason_detail, score,
       score_breakdown, estimated_revenue, estimated_cost, estimated_profit,
       is_carpool, is_return_trip, savings_km, distance_km, dispatch_weights)
    VALUES (
      ${orderId}, ${driver.id},
      ${isManual ? "manual_assign" : "auto_assign"},
      ${score.reason}, ${score.reasonDetail}, ${score.totalScore},
      ${JSON.stringify({ dist: score.distanceScore, vehicle: score.vehicleScore, profit: score.profitScore, time: score.timeScore })},
      ${score.estimatedRevenue}, ${score.estimatedCost}, ${score.estimatedProfit},
      ${score.isCarpool}, ${score.isReturnTrip}, ${score.savingsKm}, ${score.estimatedDistanceKm},
      ${JSON.stringify({ w_distance: cfg.w_distance, w_vehicle: cfg.w_vehicle, w_profit: cfg.w_profit, w_time: cfg.w_time })}
    )
  `);

  setImmediate(async () => {
    try {
      if (driver.lineUserId) {
        await sendDispatchNotification(driver.lineUserId, {
          id: orderId, pickupAddress: order.pickupAddress,
          deliveryAddress: order.deliveryAddress, cargoDescription: order.cargoDescription,
          customerName: order.customerName, customerPhone: order.customerPhone ?? undefined,
        });
      }
    } catch { /* silent */ }
  });

  return {
    success: true, driverId: driver.id, driverName: driver.name,
    reason: score.reason, score,
  };
}

async function runAutoDispatch(
  orderId: number,
  order: any,
  cfg: Record<string, string>,
): Promise<{ success: boolean; driverId?: number; driverName?: string; reason?: string; score?: ScoreBreakdown }> {
  try {
    const { candidates } = await findCandidates(orderId, order, cfg);

    // Filter out offline drivers for auto dispatch
    const eligible = candidates.filter(c => c.status !== "offline" && c.vehicleScore > 0);
    if (eligible.length === 0) {
      await db.execute(sql`
        INSERT INTO dispatch_log (order_id, action, reason) VALUES (${orderId}, 'failed', '無符合條件司機')
      `);
      return { success: false, reason: "無可用司機，請手動指派或稍後重試" };
    }

    const best = eligible[0]!;
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, best.driverId)).limit(1);
    if (!driver) return { success: false, reason: "司機資料異常" };

    return await assignDriver(orderId, order, driver as DriverRow, cfg, false);
  } catch (e: any) {
    console.error("[AutoDispatch]", e);
    return { success: false, reason: e.message };
  }
}

// ─── POST /api/smart-quote (enhanced) ─────────────────────────────────────────
// Override the existing smart-quote with richer historical + address analysis
smartOrderRouter.post("/smart-quote/v2", async (req, res) => {
  try {
    const schema = z.object({
      distanceKm: z.coerce.number().min(0).optional(),
      cargoWeightKg: z.coerce.number().min(0).optional(),
      vehicleType: z.string().optional(),
      needTailgate: z.boolean().optional(),
      needHydraulicPallet: z.boolean().optional(),
      waitingHours: z.coerce.number().min(0).optional(),
      isColdChain: z.boolean().optional(),
      urgencyFactor: z.number().min(1).max(3).optional(),
      pickupAddress: z.string().optional(),
      deliveryAddress: z.string().optional(),
      pickupTime: z.string().optional(),
    });
    const p = schema.parse(req.body);
    const cfg = await getConfig();

    // Estimate distance from addresses if distanceKm not given
    // 優先呼叫 Google Maps（有 API Key）；否則 Haversine 直線 × 1.25 估算路程
    let distKm = p.distanceKm ?? 20;
    let distanceSource: "google" | "haversine" | "provided" = p.distanceKm ? "provided" : "haversine";
    if (!p.distanceKm && p.pickupAddress && p.deliveryAddress) {
      const result = await getDistanceKm(p.pickupAddress, p.deliveryAddress);
      if (result.distance_km > 0) {
        distKm = result.source === "haversine"
          ? Math.round(result.distance_km * 1.25 * 10) / 10  // 直線 → 路程補正
          : result.distance_km;
        distanceSource = result.source;
      }
    }

    const extras = (p.needTailgate ? 800 : 0) + (p.needHydraulicPallet ? 600 : 0)
      + (p.waitingHours && p.waitingHours > 1 ? (p.waitingHours - 1) * 500 : 0)
      + (p.isColdChain ? 1500 : 0);

    const baseRaw = calcBasePrice(distKm, p.vehicleType ?? "箱型車", p.cargoWeightKg ?? 0, extras);
    const profitRate = parseFloat(cfg.base_profit_rate ?? "25") / 100;
    const minProfitRate = parseFloat(cfg.min_profit_rate ?? "10") / 100;
    const peakMult = getPeakMultiplier(cfg, p.pickupTime);
    const urgencyMult = p.urgencyFactor ?? 1;

    const suggestedPrice = Math.round(baseRaw * (1 + profitRate) * urgencyMult);
    const minPrice = Math.round(baseRaw * (1 + minProfitRate));
    const peakPrice = (peakMult > 1 || urgencyMult > 1)
      ? Math.round(suggestedPrice * Math.max(peakMult, urgencyMult))
      : null;
    const coldChainSurcharge = p.isColdChain ? 1500 : 0;

    // Historical price comparison: similar orders ±30% distance, same vehicle type
    const histRows = await db.execute(sql`
      SELECT total_fee, suggested_price, distance_km, created_at, pickup_address, delivery_address
      FROM orders
      WHERE status NOT IN ('cancelled')
        AND (total_fee > 0 OR suggested_price > 0)
        AND vehicle_type = ${p.vehicleType ?? "箱型車"}
        AND distance_km BETWEEN ${distKm * 0.7} AND ${distKm * 1.3}
        AND created_at > NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    const histPrices = (histRows.rows as any[])
      .map(r => Number(r.total_fee ?? r.suggested_price))
      .filter(v => v > 0);
    const histAvg = histPrices.length > 0
      ? Math.round(histPrices.reduce((a, b) => a + b, 0) / histPrices.length)
      : null;
    const histMin = histPrices.length > 0 ? Math.min(...histPrices) : null;
    const histMax = histPrices.length > 0 ? Math.max(...histPrices) : null;

    // Market position analysis
    let marketPosition: "below" | "market" | "above" | null = null;
    if (histAvg) {
      if (suggestedPrice < histAvg * 0.9) marketPosition = "below";
      else if (suggestedPrice > histAvg * 1.1) marketPosition = "above";
      else marketPosition = "market";
    }

    return res.json({
      estimatedDistanceKm: distKm,
      distanceSource,
      breakdown: {
        base: baseRaw,
        coldChainSurcharge,
        urgencyMultiplier: urgencyMult,
        peakMultiplier: peakMult,
        isPeakHour: peakMult > 1,
        profitMargin: Math.round(baseRaw * profitRate),
        suggested: suggestedPrice,
        min: minPrice,
        peak: peakPrice,
        withTax: Math.round(suggestedPrice * 1.05),
        expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      },
      historical: histPrices.length > 0 ? {
        count: histPrices.length,
        avg: histAvg,
        min: histMin,
        max: histMax,
        marketPosition,
      } : null,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// ─── GET /api/smart-dispatch/nearby-drivers ───────────────────────────────────

smartOrderRouter.get("/smart-dispatch/nearby-drivers", async (req, res) => {
  try {
    const { lat, lng, orderId, radiusKm = "15" } = req.query as {
      lat?: string; lng?: string; orderId?: string; radiusKm?: string;
    };

    const radius = parseFloat(radiusKm);
    let pickupLat: number | null = lat ? parseFloat(lat) : null;
    let pickupLng: number | null = lng ? parseFloat(lng) : null;
    let pickupAddressStr: string | null = null;

    // If orderId is given, get pickup coords from order
    if (orderId && (!pickupLat || !pickupLng)) {
      const [order] = await db.execute(sql`
        SELECT pickup_address, vehicle_type FROM orders WHERE id = ${parseInt(orderId)}
      `);
      const orderRow = (order as any)?.rows?.[0];
      if (orderRow?.pickup_address) {
        pickupAddressStr = orderRow.pickup_address;
        const loc = geocodeAddress(orderRow.pickup_address);
        if (loc) { pickupLat = loc.lat; pickupLng = loc.lng; }
      }
    }

    // Get all available drivers
    const driversResult = await db.execute(sql`
      SELECT id, name, phone, vehicle_type, license_plate, status,
             lat, lng, current_location, commission_rate
      FROM drivers
      WHERE status IN ('available', 'assigned')
      ORDER BY name
    `);

    const drivers = (driversResult.rows as any[]).map(d => {
      let driverLat = d.lat ? parseFloat(d.lat) : null;
      let driverLng = d.lng ? parseFloat(d.lng) : null;

      // Fallback: geocode current_location
      if ((!driverLat || !driverLng) && d.current_location) {
        const loc = geocodeAddress(d.current_location);
        if (loc) { driverLat = loc.lat; driverLng = loc.lng; }
      }

      let distanceKm: number | null = null;
      if (pickupLat && pickupLng && driverLat && driverLng) {
        distanceKm = Math.round(haversine(driverLat, driverLng, pickupLat, pickupLng) * 10) / 10;
      }

      const withinRadius = distanceKm !== null ? distanceKm <= radius : null;

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        vehicleType: d.vehicle_type,
        licensePlate: d.license_plate,
        status: d.status,
        lat: driverLat,
        lng: driverLng,
        currentLocation: d.current_location,
        distanceKm,
        withinRadius,
        hasLocation: driverLat !== null && driverLng !== null,
        commissionRate: d.commission_rate ? parseFloat(d.commission_rate) : 15,
      };
    });

    // Sort: within radius first (by distance), then those without location
    const sorted = [
      ...drivers.filter(d => d.withinRadius).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)),
      ...drivers.filter(d => d.withinRadius === false).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)),
      ...drivers.filter(d => d.withinRadius === null),
    ];

    // Return trip opportunities: drivers with orders ending near pickup
    const returnOpportunities = await db.execute(sql`
      SELECT DISTINCT d.id, d.name, o.delivery_address, o.id AS order_id
      FROM drivers d
      JOIN orders o ON o.driver_id = d.id
      WHERE o.status = 'in_transit'
        AND d.status = 'assigned'
      LIMIT 10
    `);

    return res.json({
      pickupLat,
      pickupLng,
      pickupAddress: pickupAddressStr,
      radiusKm: radius,
      drivers: sorted,
      nearbyCount: sorted.filter(d => d.withinRadius).length,
      noLocationCount: sorted.filter(d => !d.hasLocation).length,
      returnOpportunities: (returnOpportunities.rows as any[]).map(r => ({
        driverId: r.id,
        driverName: r.name,
        currentDeliveryAddress: r.delivery_address,
        orderId: r.order_id,
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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
