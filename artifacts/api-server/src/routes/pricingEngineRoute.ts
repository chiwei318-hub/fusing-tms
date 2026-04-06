/**
 * Pricing Engine Route — 透明公式報價引擎 API
 * 對應 Python LogisticsPricing 類別完整移植 + 後台設定參數
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const pricingEngineRoute = Router();

// ─── 讀取設定 ────────────────────────────────────────────────────────────────
async function getPEConfig() {
  const rows = await db.execute(sql`
    SELECT key, value FROM pricing_config WHERE key LIKE 'pe_%'
  `);
  const cfg: Record<string, string> = {};
  for (const r of rows.rows as { key: string; value: string }[]) cfg[r.key] = r.value;
  return {
    base_fee:          Number(cfg.pe_base_fee          ?? 500),
    per_km_cold:       Number(cfg.pe_per_km_cold       ?? 35),
    per_km_dry:        Number(cfg.pe_per_km_dry        ?? 25),
    urgent_multiplier: Number(cfg.pe_urgent_multiplier ?? 1.2),
    commission_pct:    Number(cfg.pe_commission_pct    ?? 15),
    min_distance_km:   Number(cfg.pe_min_distance_km   ?? 5),
    remote_threshold:  Number(cfg.pe_remote_threshold  ?? 100),
    remote_surcharge:  Number(cfg.pe_remote_surcharge  ?? 500),
  };
}

// ─── 核心計算（TypeScript 版 Python LogisticsPricing） ────────────────────────
function computeQuote(
  distance_km: number,
  is_cold_chain: boolean,
  is_urgent: boolean,
  cfg: Awaited<ReturnType<typeof getPEConfig>>,
  override_commission_pct?: number,
) {
  const km = Math.max(distance_km, cfg.min_distance_km);
  const unit_price = is_cold_chain ? cfg.per_km_cold : cfg.per_km_dry;

  // Step 1 ── 起步價 + 里程費
  const base_fare   = cfg.base_fee;
  const mileage_fee = Math.round(km * unit_price);
  let subtotal = base_fare + mileage_fee;

  // Step 2 ── 偏遠地區附加費
  const remote_surcharge = distance_km > cfg.remote_threshold ? cfg.remote_surcharge : 0;
  subtotal += remote_surcharge;

  // Step 3 ── 急單加成
  const subtotal_before_urgent = subtotal;
  let urgent_surcharge = 0;
  if (is_urgent) {
    urgent_surcharge = Math.round(subtotal * (cfg.urgent_multiplier - 1));
    subtotal = Math.round(subtotal * cfg.urgent_multiplier);
  }

  // Step 4 ── 平台抽成
  const commission_pct = override_commission_pct ?? cfg.commission_pct;
  const platform_revenue = Math.round(subtotal * commission_pct / 100);
  const driver_pay = subtotal - platform_revenue;

  // Step 5 ── 含稅 (5%)
  const total_with_tax = Math.round(subtotal * 1.05);

  return {
    inputs: { distance_km: km, is_cold_chain, is_urgent },
    formula: {
      // Python 輸出欄位對應
      step1: `NT$${base_fare} + (${km}km × NT$${unit_price}) = NT$${base_fare + mileage_fee}`,
      step2: remote_surcharge > 0 ? `偏遠加收 +NT$${remote_surcharge}` : null,
      step3: is_urgent ? `急單加成 ×${cfg.urgent_multiplier}：NT$${subtotal_before_urgent + remote_surcharge} → NT$${subtotal}` : null,
      step4: `平台抽成 ${commission_pct}%：NT$${platform_revenue}`,
    },
    steps: {
      base_fare, unit_price, mileage_fee,
      subtotal_before_urgent: subtotal_before_urgent,
      remote_surcharge, urgent_surcharge,
      urgent_multiplier: is_urgent ? cfg.urgent_multiplier : null,
      commission_pct,
    },
    result: {
      total_quote: Math.round(subtotal),        // Python: total_quote
      driver_pay,                                // Python: driver_pay
      platform_revenue,                          // Python: platform_revenue
      total_with_tax,
    },
  };
}

// ─── GET /api/pe/config ───────────────────────────────────────────────────────
pricingEngineRoute.get("/config", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT key, value, label FROM pricing_config WHERE key LIKE 'pe_%' ORDER BY id
  `);
  const cfg = await getPEConfig();
  res.json({ params: rows.rows, config: cfg });
});

// ─── PUT /api/pe/config ───────────────────────────────────────────────────────
pricingEngineRoute.put("/config", async (req, res) => {
  const updates = req.body as Record<string, string | number>;
  for (const [key, val] of Object.entries(updates)) {
    if (!key.startsWith("pe_")) continue;
    await db.execute(sql`
      UPDATE pricing_config SET value = ${String(val)}, updated_at = NOW()
      WHERE key = ${key}
    `);
  }
  res.json({ ok: true, config: await getPEConfig() });
});

// ─── POST /api/pe/calculate ───────────────────────────────────────────────────
pricingEngineRoute.post("/calculate", async (req, res) => {
  const { distance_km, is_cold_chain = true, is_urgent = false, commission_pct } = req.body;
  if (distance_km === undefined || isNaN(Number(distance_km))) {
    return res.status(400).json({ ok: false, error: "distance_km 必填" });
  }
  const cfg = await getPEConfig();
  const out = computeQuote(
    Number(distance_km), Boolean(is_cold_chain), Boolean(is_urgent), cfg,
    commission_pct !== undefined ? Number(commission_pct) : undefined,
  );
  res.json({ ok: true, ...out, config: cfg });
});

// ─── POST /api/pe/simulate ─── 批次報價試算表 ─────────────────────────────────
pricingEngineRoute.post("/simulate", async (req, res) => {
  const {
    distance_steps = [10, 20, 50, 100, 150, 200, 300],
  } = req.body;
  const cfg = await getPEConfig();

  const table = (distance_steps as number[]).map(km => ({
    distance_km: km,
    cold_normal: computeQuote(km, true, false, cfg).result,
    cold_urgent: computeQuote(km, true, true, cfg).result,
    dry_normal:  computeQuote(km, false, false, cfg).result,
    dry_urgent:  computeQuote(km, false, true, cfg).result,
  }));

  res.json({ ok: true, config: cfg, table });
});
