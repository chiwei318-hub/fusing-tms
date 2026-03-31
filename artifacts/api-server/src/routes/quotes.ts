import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { quoteRequestsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { calculatePricingWithVehicle } from "./pricingEngine";

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
