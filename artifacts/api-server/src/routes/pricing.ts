import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const pricingRouter = Router();

// ── Pricing Config ────────────────────────────────────────────────────────────
const CFG = {
  baseFlat: 500,           // NTD base flat
  perKm: 35,               // NTD per km
  freeWeightKg: 100,       // free weight
  perExtraKg: 5,           // NTD per extra kg
  freeVolumeCbm: 1.0,      // free volume (cbm)
  perExtraCbm: 500,        // NTD per extra cbm
  peakRatio: 0.20,         // peak surcharge ratio
  nightRatio: 0.30,        // night surcharge ratio
  tailgateFee: 800,
  hydraulicFee: 600,
  fridgeFee: 1200,
  waitFreeMin: 30,         // free wait minutes
  waitPer30Min: 200,       // NTD per 30 min over free
  overweightPerKg: 8,      // NTD per kg over declared
  excessItemFlat: 300,     // NTD per 10 items over declared
};

function getTimeSlot(pickupTime?: string | null): "peak" | "night" | "normal" {
  if (!pickupTime) return "normal";
  const h = parseInt(pickupTime.split(":")[0] ?? "12", 10);
  if ((h >= 7 && h < 9) || (h >= 17 && h < 19)) return "peak";
  if (h >= 22 || h < 6) return "night";
  return "normal";
}

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
  const total = Math.round(subtotal + anomalyFee);

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
    total,
  };
}

// POST /api/orders/:id/calculate-price
pricingRouter.post("/:id/calculate-price", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const overrides = req.body ?? {};
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

    return res.json({ breakdown });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/orders/:id/notify-arrival
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

    // In production: send LINE/SMS here using order.customerPhone
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

// POST /api/orders/:id/lock-price
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

// POST /api/orders/:id/add-surcharge
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
