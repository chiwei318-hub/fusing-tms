import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

export const pricingRouter = Router();

// ── Pricing Config ────────────────────────────────────────────────────────────
const CFG = {
  baseFlat: 500,
  perKm: 35,
  freeWeightKg: 100,
  perExtraKg: 5,
  freeVolumeCbm: 1.0,
  perExtraCbm: 500,
  peakRatio: 0.20,
  nightRatio: 0.30,
  tailgateFee: 800,
  hydraulicFee: 600,
  fridgeFee: 1200,
  waitFreeMin: 30,
  waitPer30Min: 200,
  overweightPerKg: 8,
  excessItemFlat: 300,
};

const PRICE_LEVEL_LABELS: Record<string, string> = {
  standard: "標準",
  vip: "VIP",
  enterprise: "企業",
  custom: "自訂",
};

function getTimeSlot(pickupTime?: string | null): "peak" | "night" | "normal" {
  if (!pickupTime) return "normal";
  const h = parseInt(pickupTime.split(":")[0] ?? "12", 10);
  if ((h >= 7 && h < 9) || (h >= 17 && h < 19)) return "peak";
  if (h >= 22 || h < 6) return "night";
  return "normal";
}

// ── Customer Pricing Lookup ───────────────────────────────────────────────────
async function getCustomerPricing(customerPhone?: string | null): Promise<{
  customerId?: number;
  customerName?: string;
  priceLevel?: string;
  priceLevelLabel?: string;
  discountPct: number;
} | null> {
  if (!customerPhone) return null;
  try {
    const result = await db.execute(sql`
      SELECT id, name, price_level, discount_pct
      FROM customers
      WHERE phone = ${customerPhone} AND is_active = TRUE
      LIMIT 1
    `);
    const row = result.rows[0] as any;
    if (!row) return null;
    const discountPct = parseFloat(String(row.discount_pct ?? 0)) || 0;
    const priceLevel = row.price_level ?? "standard";
    return {
      customerId: row.id,
      customerName: row.name,
      priceLevel,
      priceLevelLabel: PRICE_LEVEL_LABELS[priceLevel] ?? priceLevel,
      discountPct,
    };
  } catch { return null; }
}

// ── Core Pricing Function ─────────────────────────────────────────────────────
export function calculatePricing(params: {
  distanceKm?: number | null;
  cargoWeight?: number | null;
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  pickupTime?: string | null;
  needTailgate?: string | null;
  needHydraulicPallet?: string | null;
  specialRequirements?: string | null;
  waitMinutes?: number | null;
  overweightKg?: number;
  excessItems?: number;
  discountPct?: number;
}) {
  const dist = params.distanceKm ?? 0;
  const weight = params.cargoWeight ?? 0;
  const vol = (params.cargoLengthM ?? 0) * (params.cargoWidthM ?? 0) * (params.cargoHeightM ?? 0);
  const wait = params.waitMinutes ?? 0;
  const slot = getTimeSlot(params.pickupTime);
  const sr = (params.specialRequirements ?? "").toLowerCase();

  const base = CFG.baseFlat + dist * CFG.perKm;
  const weightFee = Math.max(0, weight - CFG.freeWeightKg) * CFG.perExtraKg;
  const volumeFee = vol > CFG.freeVolumeCbm ? (vol - CFG.freeVolumeCbm) * CFG.perExtraCbm : 0;

  const timeFee =
    slot === "peak"
      ? Math.round(base * CFG.peakRatio)
      : slot === "night"
      ? Math.round(base * CFG.nightRatio)
      : 0;

  let specialFee = 0;
  const specialItems: string[] = [];
  if (params.needTailgate === "yes") { specialFee += CFG.tailgateFee; specialItems.push(`尾門+${CFG.tailgateFee}`); }
  if (params.needHydraulicPallet === "yes") { specialFee += CFG.hydraulicFee; specialItems.push(`油壓板+${CFG.hydraulicFee}`); }
  if (sr.includes("冷藏") || sr.includes("cold")) { specialFee += CFG.fridgeFee; specialItems.push(`冷藏+${CFG.fridgeFee}`); }

  const extraWaitUnits = Math.max(0, Math.ceil((wait - CFG.waitFreeMin) / 30));
  const waitFee = extraWaitUnits * CFG.waitPer30Min;
  const overweightFee = (params.overweightKg ?? 0) * CFG.overweightPerKg;
  const excessFee = Math.ceil((params.excessItems ?? 0) / 10) * CFG.excessItemFlat;
  const anomalyFee = waitFee + overweightFee + excessFee;

  const anomalyItems: string[] = [];
  if (waitFee > 0) anomalyItems.push(`等候${wait}分鐘+${waitFee}`);
  if (overweightFee > 0) anomalyItems.push(`超重${params.overweightKg}kg+${overweightFee}`);
  if (excessFee > 0) anomalyItems.push(`超件+${excessFee}`);

  const subtotal = base + weightFee + volumeFee + timeFee + specialFee;

  // Customer discount applied on subtotal (before anomaly fees)
  const discountPct = Math.max(0, Math.min(100, params.discountPct ?? 0));
  const discountAmount = discountPct > 0 ? Math.round(subtotal * discountPct / 100) : 0;

  const total = Math.round(subtotal - discountAmount + anomalyFee);

  return {
    distanceKm: dist,
    base: Math.round(base),
    weightFee: Math.round(weightFee),
    volumeFee: Math.round(volumeFee),
    timeFee,
    timeSlot: slot,
    specialFee: Math.round(specialFee),
    specialItems,
    anomalyFee: Math.round(anomalyFee),
    anomalyItems,
    subtotal: Math.round(subtotal),
    discountPct,
    discountAmount,
    total,
  };
}

// ── GET /api/orders/:id/customer-pricing ──────────────────────────────────────
// 查詢訂單客戶的批價設定
pricingRouter.get("/:id/customer-pricing", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const pricing = await getCustomerPricing(order.customerPhone);
    return res.json(pricing ?? { discountPct: 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/orders/:id/calculate-price ──────────────────────────────────────
pricingRouter.post("/:id/calculate-price", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const overrides = req.body ?? {};

    // Determine discount: explicit override > customer lookup > 0
    let discountPct = 0;
    let customerInfo = null;
    if (overrides.discountPct !== undefined) {
      discountPct = parseFloat(String(overrides.discountPct)) || 0;
    } else {
      customerInfo = await getCustomerPricing(order.customerPhone);
      discountPct = customerInfo?.discountPct ?? 0;
    }

    const breakdown = calculatePricing({
      distanceKm: overrides.distanceKm ?? order.distanceKm,
      cargoWeight: overrides.cargoWeight ?? order.cargoWeight,
      cargoLengthM: overrides.cargoLengthM ?? order.cargoLengthM,
      cargoWidthM: overrides.cargoWidthM ?? order.cargoWidthM,
      cargoHeightM: overrides.cargoHeightM ?? order.cargoHeightM,
      pickupTime: overrides.pickupTime ?? order.pickupTime,
      needTailgate: overrides.needTailgate ?? order.needTailgate,
      needHydraulicPallet: overrides.needHydraulicPallet ?? order.needHydraulicPallet,
      specialRequirements: overrides.specialRequirements ?? order.specialRequirements,
      waitMinutes: overrides.waitMinutes ?? order.waitMinutes,
      overweightKg: overrides.overweightKg ?? 0,
      excessItems: overrides.excessItems ?? 0,
      discountPct,
    });

    if (overrides.save) {
      const distKm = overrides.distanceKm ?? order.distanceKm;
      await db.update(ordersTable).set({
        distanceKm: distKm ?? undefined,
        basePrice: breakdown.base,
        extraFee: breakdown.anomalyFee,
        totalFee: breakdown.total,
        pricingBreakdown: JSON.stringify(breakdown),
        surchargeAmount: breakdown.anomalyFee,
        surchargeReason: breakdown.anomalyItems.join(", ") || null,
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, id));
    }

    return res.json({
      breakdown,
      customerPricing: customerInfo ?? (overrides.discountPct !== undefined ? { discountPct } : null),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/orders/:id/notify-arrival ───────────────────────────────────────
pricingRouter.post("/:id/notify-arrival", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const now = new Date();
    await db.update(ordersTable).set({
      arrivalNotifiedAt: now,
      updatedAt: now,
    }).where(eq(ordersTable.id, id));

    console.log(`[Arrival Notify] Order #${id} → ${order.customerPhone} · Driver arriving at ${order.pickupAddress}`);

    return res.json({
      success: true,
      notifiedAt: now.toISOString(),
      message: `已通知客戶（${order.customerPhone}）司機即將抵達`,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/orders/:id/lock-price ───────────────────────────────────────────
pricingRouter.post("/:id/lock-price", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const lockedBy: string = req.body?.lockedBy ?? "admin";
    const now = new Date();
    await db.update(ordersTable).set({
      priceLocked: true,
      priceLockedAt: now,
      priceLockedBy: lockedBy,
      updatedAt: now,
    }).where(eq(ordersTable.id, id));

    return res.json({ success: true, lockedAt: now.toISOString(), lockedBy });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/orders/:id/add-surcharge ────────────────────────────────────────
pricingRouter.post("/:id/add-surcharge", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.priceLocked) return res.status(400).json({ error: "Price is locked" });

    const { amount, reason, waitMinutes, overweightKg, excessItems } = req.body ?? {};

    const existing = parseFloat(String(order.surchargeAmount ?? 0));
    const add = parseFloat(String(amount ?? 0));
    const newSurcharge = existing + add;

    const reasons = [order.surchargeReason, reason].filter(Boolean).join(", ");
    const newTotal = (order.totalFee ?? order.basePrice ?? 0) + add;

    await db.update(ordersTable).set({
      surchargeAmount: newSurcharge,
      surchargeReason: reasons || null,
      totalFee: newTotal,
      waitMinutes: waitMinutes ?? order.waitMinutes,
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id));

    return res.json({
      success: true,
      surchargeAmount: newSurcharge,
      totalFee: newTotal,
      reason: reasons,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});
