import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { quoteRequestsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import {
  calculatePricingWithVehicle,
  loadFuelSurcharge,
  invalidateFuelSurchargeCache,
  type FuelSurchargeConfig,
} from "./pricingEngine";

export const quotesRouter = Router();

function genToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// POST /api/quotes/estimate — public, no auth required
// Returns a real-time price breakdown without saving
quotesRouter.post("/quotes/estimate", async (req, res) => {
  try {
    const body = req.body ?? {};
    const breakdown = await calculatePricingWithVehicle(body);
    return res.json({ ok: true, breakdown });
  } catch (e) {
    console.error("[quotes/estimate]", e);
    return res.status(500).json({ error: "報價計算失敗" });
  }
});

// POST /api/quotes — save a quote (public, generates token)
quotesRouter.post("/quotes", async (req, res) => {
  try {
    const body = req.body ?? {};
    const breakdown = await calculatePricingWithVehicle(body);

    const token = genToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min default

    // read quote_expires_minutes from config
    try {
      const cfgRows = await db.execute(
        sql`SELECT value FROM pricing_config WHERE key='quote_expires_minutes' LIMIT 1`
      );
      const minutes = parseInt((cfgRows.rows[0] as any)?.value ?? "30", 10);
      expiresAt.setTime(Date.now() + minutes * 60 * 1000);
    } catch {}

    const specialCargoes = Array.isArray(body.specialCargoes)
      ? body.specialCargoes.join(",")
      : body.specialCargoes ?? null;

    await db.insert(quoteRequestsTable).values({
      token,
      customerName: body.customerName ?? null,
      customerPhone: body.customerPhone ?? null,
      customerEmail: body.customerEmail ?? null,
      companyName: body.companyName ?? null,
      vehicleType: body.vehicleType ?? "3.5T",
      cargoName: body.cargoName ?? null,
      cargoWeight: body.cargoWeight ?? null,
      cargoLengthM: body.cargoLengthM ?? null,
      cargoWidthM: body.cargoWidthM ?? null,
      cargoHeightM: body.cargoHeightM ?? null,
      volumeCbm: body.volumeCbm ?? null,
      distanceKm: body.distanceKm ?? null,
      fromAddress: body.fromAddress ?? null,
      toAddress: body.toAddress ?? null,
      pickupDate: body.pickupDate ?? null,
      pickupTime: body.pickupTime ?? null,
      specialCargoes,
      needColdChain: body.needColdChain ?? false,
      coldChainTemp: body.coldChainTemp ?? null,
      waitingHours: body.waitingHours ?? 0,
      tollsFixed: body.tollsFixed ?? 0,
      basePrice: breakdown.basePrice,
      distanceCharge: breakdown.distanceCharge,
      weightSurcharge: breakdown.weightSurcharge,
      volumeSurcharge: breakdown.volumeSurcharge,
      specialSurcharge: breakdown.specialSurcharge,
      coldChainFee: breakdown.coldChainFee,
      waitingFee: breakdown.waitingFee,
      taxAmount: breakdown.taxAmount,
      profitAmount: breakdown.profitAmount,
      totalAmount: breakdown.totalAmount,
      breakdown: JSON.stringify(breakdown),
      status: "pending",
      expiresAt,
      source: body.source ?? "web",
      notes: body.notes ?? null,
    });

    return res.json({ ok: true, token, breakdown, expiresAt });
  } catch (e) {
    console.error("[quotes/save]", e);
    return res.status(500).json({ error: "儲存報價失敗" });
  }
});

// GET /api/quotes/:token — retrieve a quote by public token
quotesRouter.get("/quotes/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [quote] = await db
      .select()
      .from(quoteRequestsTable)
      .where(eq(quoteRequestsTable.token, token))
      .limit(1);
    if (!quote) return res.status(404).json({ error: "找不到報價" });
    return res.json({ ok: true, quote });
  } catch (e) {
    console.error("[quotes/get]", e);
    return res.status(500).json({ error: "查詢失敗" });
  }
});

// GET /api/quotes — admin list (requires auth via middleware on main router)
quotesRouter.get("/quotes", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(quoteRequestsTable)
      .orderBy(sql`${quoteRequestsTable.createdAt} DESC`)
      .limit(100);
    return res.json({ ok: true, quotes: rows });
  } catch (e) {
    console.error("[quotes/list]", e);
    return res.status(500).json({ error: "查詢失敗" });
  }
});

// PATCH /api/quotes/:token — update status (admin: convert, cancel, etc.)
quotesRouter.patch("/quotes/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { status, convertedOrderId, notes } = req.body ?? {};
    await db
      .update(quoteRequestsTable)
      .set({
        status: status ?? undefined,
        convertedOrderId: convertedOrderId ?? undefined,
        notes: notes ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(quoteRequestsTable.token, token));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[quotes/patch]", e);
    return res.status(500).json({ error: "更新失敗" });
  }
});

// ── 車型預設費率表（可被前端 /pricing/vehicle-rates 覆寫） ─────────────────────
const VEHICLE_PRESETS: Record<string, { mpg: number; maintRate: number; depreRate: number; driverPay: number }> = {
  "1.75T": { mpg: 10.0, maintRate: 2.0,  depreRate: 3.0,  driverPay: 800  },
  "3.5T":  { mpg: 7.0,  maintRate: 3.5,  depreRate: 4.8,  driverPay: 1200 },
  "11T":   { mpg: 4.5,  maintRate: 6.0,  depreRate: 6.75, driverPay: 2000 },
  "26T":   { mpg: 2.8,  maintRate: 10.0, depreRate: 11.25,driverPay: 3000 },
};

// POST /api/quotes/net-profit — 精準淨利計算（對應 calculateNetProfit 函式）
// Body: { orderData: { distance, quote, driverPay? }, vehicleData: { mpg, maintRate, depreRate }, fuelPrice? }
// 或:   { orderData: { distance, quote, vehicleType? }, fuelPrice? }  ← 使用預設費率
quotesRouter.post("/quotes/net-profit", (req, res) => {
  const { orderData, vehicleData: rawVehicle, fuelPrice = 28.5 } = req.body ?? {};

  if (!orderData?.distance) {
    return res.status(400).json({ error: "需要 orderData.distance" });
  }

  const { distance, quote = 0, driverPay, vehicleType } = orderData;

  // 取得車型參數：優先 body 傳入，否則用 preset
  const preset = VEHICLE_PRESETS[vehicleType ?? "3.5T"] ?? VEHICLE_PRESETS["3.5T"];
  const vd = { ...preset, ...(rawVehicle ?? {}) };
  const { mpg, maintRate, depreRate } = vd;
  const dp = driverPay ?? vd.driverPay;

  if (!mpg || mpg <= 0) {
    return res.status(400).json({ error: "vehicleData.mpg 必須大於 0" });
  }

  // ── calculateNetProfit 核心公式（忠實移植） ─────────────────────────────────
  const variableCost       = (distance * fuelPrice) / mpg;   // 油費
  const maintenanceBuffer  = distance * maintRate;            // 維修緩衝
  const depreciation       = distance * depreRate;            // 每km折舊
  const totalCost          = variableCost + maintenanceBuffer + depreciation + dp;
  const netProfit          = quote - totalCost;
  const marginPct          = quote > 0 ? (netProfit / quote) * 100 : 0;

  // 最低建議報價（目標 20% 利潤率）
  const minQuote20 = totalCost / 0.80;

  const verdict =
    marginPct >= 20 && netProfit > 1500 ? "accept"
    : netProfit > 0                     ? "marginal"
    :                                     "reject";

  return res.json({
    ok: true,
    netProfit:   Math.round(netProfit),
    totalCost:   Math.round(totalCost),
    marginPct:   Math.round(marginPct * 10) / 10,
    minQuote20:  Math.round(minQuote20),
    verdict,
    breakdown: {
      variableCost:      Math.round(variableCost),
      maintenanceBuffer: Math.round(maintenanceBuffer),
      depreciation:      Math.round(depreciation),
      driverPay:         Math.round(dp),
    },
    inputs: { distance, fuelPrice, mpg, maintRate, depreRate, driverPay: dp },
  });
});

// GET /api/quotes/net-profit/presets — 車型預設費率（供前端使用）
quotesRouter.get("/quotes/net-profit/presets", (_req, res) => {
  return res.json({ ok: true, presets: VEHICLE_PRESETS });
});

// GET /api/pricing/vehicle-rates — get per-vehicle rate cards (public read)
quotesRouter.get("/pricing/vehicle-rates", async (req, res) => {
  try {
    const rows = await db.execute(
      sql`SELECT value FROM pricing_config WHERE key = 'vehicle_rate_cards' LIMIT 1`
    );
    const row = rows.rows[0] as any;
    if (row?.value) {
      return res.json({ ok: true, rates: JSON.parse(row.value) });
    }
    return res.json({ ok: true, rates: null });
  } catch (e) {
    console.error("[pricing/vehicle-rates]", e);
    return res.status(500).json({ error: "讀取費率失敗" });
  }
});

// PUT /api/pricing/vehicle-rates — save per-vehicle rate cards (admin)
quotesRouter.put("/pricing/vehicle-rates", async (req, res) => {
  try {
    const rates = req.body;
    const value = JSON.stringify(rates);
    await db.execute(
      sql`INSERT INTO pricing_config (key, value, label, updated_at)
          VALUES ('vehicle_rate_cards', ${value}, '車型費率卡', NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("[pricing/vehicle-rates PUT]", e);
    return res.status(500).json({ error: "儲存費率失敗" });
  }
});

// GET /api/pricing/fuel-surcharge — 讀取燃油附加費設定（公開）
quotesRouter.get("/pricing/fuel-surcharge", async (_req, res) => {
  try {
    const cfg = await loadFuelSurcharge();
    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error("[pricing/fuel-surcharge GET]", e);
    return res.status(500).json({ error: "讀取燃油附加費設定失敗" });
  }
});

// PUT /api/pricing/fuel-surcharge — 更新燃油附加費設定（管理員）
quotesRouter.put("/pricing/fuel-surcharge", async (req, res) => {
  try {
    const body = req.body as Partial<FuelSurchargeConfig>;
    const current = await loadFuelSurcharge();
    const updated: FuelSurchargeConfig = {
      ...current,
      ...body,
      lastUpdated: new Date().toISOString(),
    };
    const value = JSON.stringify(updated);
    await db.execute(
      sql`INSERT INTO pricing_config (key, value, label, updated_at)
          VALUES ('fuel_surcharge', ${value}, '燃油附加費設定', NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`
    );
    invalidateFuelSurchargeCache();
    return res.json({ ok: true, config: updated });
  } catch (e) {
    console.error("[pricing/fuel-surcharge PUT]", e);
    return res.status(500).json({ error: "儲存燃油附加費設定失敗" });
  }
});
