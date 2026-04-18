/**
 * 台灣貨運報價計算引擎
 * 對應 calculate_taiwan_freight() Python 函式，並升級為：
 *   - DB 可調費率表（車型、公里單價、財務分帳比例）
 *   - 偏遠地區關鍵字自動加成
 *   - 附加服務清單（搬運上樓、卸貨吊車、冷鏈等）
 *   - 使用現有 distanceService（Google Maps + Haversine 備援）
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { getDistanceKm, geocodeTW, isGoogleMapsConfigured } from "../lib/distanceService";

export const freightQuoteRouter = Router();

// ── DB 初始化 ────────────────────────────────────────────────────────────────

export async function ensureFreightRateTables() {
  // 車型費率主表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS freight_rate_config (
      id             SERIAL PRIMARY KEY,
      car_type       VARCHAR(50)  NOT NULL UNIQUE,
      label          VARCHAR(100) NOT NULL,
      base_price     NUMERIC      NOT NULL DEFAULT 500,
      km_rate        NUMERIC      NOT NULL DEFAULT 25,
      platform_pct   NUMERIC      NOT NULL DEFAULT 10,
      driver_pct     NUMERIC      NOT NULL DEFAULT 90,
      sort_order     INTEGER      DEFAULT 0,
      active         BOOLEAN      DEFAULT true,
      created_at     TIMESTAMPTZ  DEFAULT NOW(),
      updated_at     TIMESTAMPTZ  DEFAULT NOW()
    )
  `);

  // 附加服務費用表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS freight_surcharge_config (
      id              SERIAL PRIMARY KEY,
      key             VARCHAR(50)  NOT NULL UNIQUE,
      label           VARCHAR(100) NOT NULL,
      amount          NUMERIC      NOT NULL DEFAULT 0,
      pct_multiplier  NUMERIC      NOT NULL DEFAULT 0,
      description     TEXT,
      active          BOOLEAN      DEFAULT true,
      created_at      TIMESTAMPTZ  DEFAULT NOW()
    )
  `);

  // 偏遠地區關鍵字表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS freight_remote_areas (
      id          SERIAL PRIMARY KEY,
      keyword     VARCHAR(50) NOT NULL UNIQUE,
      label       VARCHAR(100),
      multiplier  NUMERIC NOT NULL DEFAULT 1.3,
      active      BOOLEAN DEFAULT true
    )
  `);

  // 預設車型費率（Python base_rates 對應）
  await pool.query(`
    INSERT INTO freight_rate_config (car_type, label, base_price, km_rate, platform_pct, driver_pct, sort_order)
    VALUES
      ('3.5t',         '3.5噸貨車',   500,   25, 10, 90, 1),
      ('6.2t',         '6.2噸貨車',   900,   30, 10, 90, 2),
      ('10t',          '10噸貨車',    1500,  35, 10, 90, 3),
      ('17t',          '17噸貨車',    2500,  45, 10, 90, 4),
      ('refrigerator', '冷藏車',      800,   30, 10, 90, 5),
      ('van',          '箱型車',      400,   20, 10, 90, 6),
      ('motorcycle',   '機車快遞',    150,   12, 10, 90, 7)
    ON CONFLICT (car_type) DO NOTHING
  `);

  // 預設附加服務
  await pool.query(`
    INSERT INTO freight_surcharge_config (key, label, amount, pct_multiplier, description)
    VALUES
      ('upstairs',       '搬運上樓（每層）', 500,  0,    '搬運至指定樓層，每層加收'),
      ('hydraulic',      '油壓板車',         800,  0,    '需要油壓板車卸貨'),
      ('tailgate',       '尾板服務',         600,  0,    '尾板升降卸貨'),
      ('cold_chain',     '冷鏈全程監控',     300,  0,    '溫度記錄儀 + 全程追蹤'),
      ('wait_over30',    '等候超時（30分/次）', 300, 0,  '等候超過30分鐘加收'),
      ('night_delivery', '夜間配送（22:00後）', 0,  0.2, '標準費用加成 20%'),
      ('holiday',        '假日加成',         0,    0.3,  '假日加成 30%')
    ON CONFLICT (key) DO NOTHING
  `);

  // 預設偏遠地區
  await pool.query(`
    INSERT INTO freight_remote_areas (keyword, label, multiplier)
    VALUES
      ('台東',   '台東縣',   1.3),
      ('花蓮',   '花蓮縣',   1.3),
      ('澎湖',   '澎湖縣',   1.5),
      ('金門',   '金門縣',   1.5),
      ('馬祖',   '馬祖',     1.5),
      ('山區',   '山區地帶', 1.3),
      ('阿里山', '阿里山區', 1.3),
      ('合歡山', '合歡山區', 1.3),
      ('廬山',   '廬山地區', 1.3),
      ('埔里',   '埔里地區', 1.2),
      ('蘭嶼',   '蘭嶼',     1.6),
      ('綠島',   '綠島',     1.6)
    ON CONFLICT (keyword) DO NOTHING
  `);

  console.log("[FreightQuote] tables ensured");
}

// ── 偏遠地區檢查 ──────────────────────────────────────────────────────────────
async function detectRemoteArea(address: string): Promise<{ isRemote: boolean; keyword: string | null; multiplier: number }> {
  const { rows } = await pool.query<{ keyword: string; label: string; multiplier: number }>(
    `SELECT keyword, label, multiplier FROM freight_remote_areas WHERE active = true`
  );
  for (const row of rows) {
    if (address.includes(row.keyword)) {
      return { isRemote: true, keyword: row.label || row.keyword, multiplier: Number(row.multiplier) };
    }
  }
  return { isRemote: false, keyword: null, multiplier: 1 };
}

// ── GET /api/freight-quote/config ─────────────────────────────────────────────
// 取得所有費率設定（供前端計算機和設定頁使用）
freightQuoteRouter.get("/freight-quote/config", async (_req, res) => {
  try {
    const [rates, surcharges, remoteAreas] = await Promise.all([
      pool.query(`SELECT * FROM freight_rate_config ORDER BY sort_order, id`),
      pool.query(`SELECT * FROM freight_surcharge_config ORDER BY id`),
      pool.query(`SELECT * FROM freight_remote_areas ORDER BY id`),
    ]);
    res.json({
      ok: true,
      rates: rates.rows,
      surcharges: surcharges.rows,
      remoteAreas: remoteAreas.rows,
      googleMapsAvailable: isGoogleMapsConfigured(),
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/freight-quote/calculate ─────────────────────────────────────────
// 核心報價計算
// 計算順序（對應 get_quote_engine + calculate_taiwan_freight）：
//   subtotal = (base_price + dist_km × km_rate) × car_multiplier × remote_multiplier
//   + flat surcharges  → × pct surcharges
//   profit = subtotal × platform_pct%;  driver = subtotal × driver_pct%
freightQuoteRouter.post("/freight-quote/calculate", async (req, res) => {
  try {
    const {
      pickup_address,
      delivery_address,
      car_type = "3.5t",
      has_elevator = true,        // false → 自動套用「無電梯搬樓梯費 +500」
      services = {},              // { upstairs: 2, hydraulic: true, night_delivery: true, ... }
      custom_km_rate,
      custom_platform_pct,
    } = req.body as {
      pickup_address: string;
      delivery_address: string;
      car_type?: string;
      has_elevator?: boolean;
      services?: Record<string, number | boolean>;
      custom_km_rate?: number;
      custom_platform_pct?: number;
    };

    if (!pickup_address || !delivery_address) {
      return res.status(400).json({ ok: false, error: "需要 pickup_address 和 delivery_address" });
    }

    // 1. 取得車型費率（含 car_multiplier）
    const rateRow = await pool.query<{
      base_price: string; km_rate: string; platform_pct: string; driver_pct: string;
      label: string; car_multiplier: string;
    }>(`SELECT * FROM freight_rate_config WHERE car_type = $1 AND active = true LIMIT 1`, [car_type]);

    const rate = rateRow.rows[0] ?? {
      base_price: "500", km_rate: "25", platform_pct: "10", driver_pct: "90",
      label: car_type, car_multiplier: "1.0",
    };
    const basePrice      = Number(rate.base_price);
    const kmRate         = custom_km_rate     ?? Number(rate.km_rate);
    const platformPct    = custom_platform_pct ?? Number(rate.platform_pct);
    const driverPct      = 100 - platformPct;
    const carMultiplier  = Number(rate.car_multiplier ?? 1);

    // 2. 距離計算（使用現有 distanceService）
    const distResult = await getDistanceKm(pickup_address, delivery_address);
    const distKm = distResult.distance_km;
    const distFee = Math.round(distKm * kmRate);

    // 3. 套用車型係數（get_quote_engine：整體乘以 car_multiplier）
    let subtotal = (basePrice + distFee) * carMultiplier;

    // 4. 偏遠地區加成（calculate_taiwan_freight：×1.3 偏遠地區）
    const remote = await detectRemoteArea(delivery_address);
    subtotal = subtotal * remote.multiplier;

    // 5. has_elevator = false → 自動加入「無電梯搬樓梯費」
    const servicesWithElevator: Record<string, number | boolean> = { ...services };
    if (!has_elevator) {
      servicesWithElevator["no_elevator"] = true;
    }

    // 6. 附加服務費用
    const surchargeRows = await pool.query<{
      key: string; label: string; amount: string; pct_multiplier: string;
    }>(`SELECT * FROM freight_surcharge_config WHERE active = true`);

    const appliedSurcharges: { key: string; label: string; amount: number; pct: number }[] = [];
    let pctSurchargeMultiplier = 1;

    for (const s of surchargeRows.rows) {
      const val = servicesWithElevator[s.key];
      if (!val) continue;

      const qty = typeof val === "number" ? val : 1;
      const flatAmount = Number(s.amount) * qty;
      const pctAdd = Number(s.pct_multiplier);

      if (flatAmount > 0) {
        subtotal += flatAmount;
        appliedSurcharges.push({ key: s.key, label: s.label, amount: flatAmount, pct: 0 });
      }
      if (pctAdd > 0) {
        pctSurchargeMultiplier += pctAdd;
        appliedSurcharges.push({ key: s.key, label: s.label, amount: 0, pct: Math.round(pctAdd * 100) });
      }
    }

    // 百分比加成在最後一次性計算（避免複利）
    subtotal = subtotal * pctSurchargeMultiplier;

    // 7. 財務分帳
    const totalQuote   = Math.round(subtotal);
    const profit       = Math.round(subtotal * platformPct / 100);
    const driverPayout = Math.round(subtotal * driverPct / 100);

    res.json({
      ok: true,
      quote: {
        total_quote:    totalQuote,
        driver_payout:  driverPayout,
        your_profit:    profit,
        platform_pct:   platformPct,
        driver_pct:     driverPct,
      },
      breakdown: {
        base_price:       basePrice,
        distance_km:      distKm,
        km_rate:          kmRate,
        distance_fee:     distFee,
        car_type:         car_type,
        car_label:        rate.label,
        car_multiplier:   carMultiplier,
        has_elevator:     has_elevator,
        remote_area:      remote.isRemote ? remote.keyword : null,
        remote_multiplier: remote.isRemote ? remote.multiplier : 1,
        surcharges:       appliedSurcharges,
        pct_surcharge_added: Math.round((pctSurchargeMultiplier - 1) * 100),
      },
      distance_source: distResult.source,
      duration_min:    distResult.duration_min ?? null,
    });
  } catch (err: any) {
    console.error("[FreightQuote]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /api/freight-quote/config/rate/:id ────────────────────────────────────
freightQuoteRouter.put("/freight-quote/config/rate/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { base_price, km_rate, platform_pct, label, active, car_multiplier } = req.body;
    const driver_pct = 100 - Number(platform_pct);
    await pool.query(`
      UPDATE freight_rate_config
      SET base_price=$1, km_rate=$2, platform_pct=$3, driver_pct=$4, label=$5, active=$6,
          car_multiplier=$7, updated_at=NOW()
      WHERE id=$8
    `, [base_price, km_rate, platform_pct, driver_pct, label, active ?? true, car_multiplier ?? 1, id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/freight-quote/fuyong-calculate ─────────────────────────────────
// 直接對應 get_fuyong_quote() Python 函式
// 梯度計費：≤10km = $800；>10km = $800 + (km-10)×$25
// 特殊節點：科學園區 +300、機場 +500
// 假日加成：×1.2
freightQuoteRouter.post("/freight-quote/fuyong-calculate", async (req, res) => {
  try {
    const {
      origin,
      destination,
      is_holiday = false,
    }: { origin: string; destination: string; is_holiday?: boolean } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ ok: false, error: "需要 origin（取貨）和 destination（送達）地址" });
    }

    // 1. 取得精準里程（串接 Google API，無 key 時 Haversine 備援）
    const distResult = await getDistanceKm(origin, destination);
    const km = distResult.distance_km;

    // 2. 富詠專屬級距計費（與 Python 完全一致：不中途 round，最終 round(final_price)）
    let base_price: number;
    let tier_label: string;
    if (km <= 10) {
      base_price = 800;
      tier_label = `短程（≤10km）固定 $800`;
    } else {
      base_price = 800 + (km - 10) * 25; // 保留浮點，最後才 round
      tier_label = `$800 + (${km.toFixed(1)}km - 10km) × $25`;
    }

    // 3. 台灣特殊節點自動判斷
    const SPECIAL_NODES: { keyword: string; label: string; amount: number }[] = [
      { keyword: "科學園區", label: "科學園區附加費", amount: 300 },
      { keyword: "機場",     label: "機場附加費",     amount: 500 },
    ];
    const appliedNodes = SPECIAL_NODES.filter(n => destination.includes(n.keyword));
    const surcharge = appliedNodes.reduce((sum, n) => sum + n.amount, 0);

    // 4. 小計 + 假日加成
    let subtotal = base_price + surcharge;
    const before_holiday = subtotal;
    if (is_holiday) subtotal = subtotal * 1.2;

    const total_price = Math.round(subtotal);

    res.json({
      ok: true,
      quote: { total_price },
      breakdown: {
        distance_km:   km,
        distance_source: distResult.source,
        duration_min:  distResult.duration_min ?? null,
        tier_label,
        base_price: Math.round(base_price),
        special_nodes: appliedNodes,
        surcharge,
        subtotal_before_holiday: Math.round(before_holiday),
        is_holiday,
        holiday_multiplier: is_holiday ? 1.2 : 1,
        total_price,
      },
    });
  } catch (err: any) {
    console.error("[FuyongQuote]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /api/freight-quote/config/surcharge/:id ───────────────────────────────
freightQuoteRouter.put("/freight-quote/config/surcharge/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { label, amount, pct_multiplier, active } = req.body;
    await pool.query(`
      UPDATE freight_surcharge_config
      SET label=$1, amount=$2, pct_multiplier=$3, active=$4
      WHERE id=$5
    `, [label, amount, pct_multiplier, active ?? true, id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});
