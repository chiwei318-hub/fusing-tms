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

  // 合約客戶費率表（對應 Python auto_quote_engine / generate_auto_quote 的 partner_config）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_contract_config (
      id                SERIAL PRIMARY KEY,
      partner_id        VARCHAR(50)  NOT NULL UNIQUE,
      partner_name      VARCHAR(100) NOT NULL,
      tier              VARCHAR(20)  NOT NULL DEFAULT '一般',
      base_price        NUMERIC      NOT NULL DEFAULT 800,
      rate_per_km       NUMERIC      NOT NULL DEFAULT 25,
      park_fee          NUMERIC      NOT NULL DEFAULT 300,
      mountain_fee      NUMERIC      NOT NULL DEFAULT 500,
      special_zone_fee  NUMERIC      NOT NULL DEFAULT 500,
      remote_fee        NUMERIC      NOT NULL DEFAULT 1000,
      profit_margin     NUMERIC      NOT NULL DEFAULT 0.15,
      notes             TEXT,
      active            BOOLEAN      DEFAULT true,
      created_at        TIMESTAMPTZ  DEFAULT NOW(),
      updated_at        TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  // 老資料補欄位（idempotent）
  await pool.query(`ALTER TABLE partner_contract_config ADD COLUMN IF NOT EXISTS special_zone_fee NUMERIC NOT NULL DEFAULT 500`);
  await pool.query(`ALTER TABLE partner_contract_config ADD COLUMN IF NOT EXISTS remote_fee        NUMERIC NOT NULL DEFAULT 1000`);
  await pool.query(`ALTER TABLE partner_contract_config ADD COLUMN IF NOT EXISTS profit_margin     NUMERIC NOT NULL DEFAULT 0.15`);
  // 預設示範合約客戶
  await pool.query(`
    INSERT INTO partner_contract_config (partner_id, partner_name, tier, base_price, rate_per_km, park_fee, mountain_fee, notes)
    VALUES
      ('VIP001',  '台積電物流部', 'VIP',   600, 20, 200, 400, 'VIP 長約：起步折扣、低公里費'),
      ('STD001',  '富貿貿易',     '一般',  800, 25, 300, 500, '標準合約'),
      ('FRN001',  '全台快遞加盟', '加盟商', 900, 28, 350, 600, '加盟商費率較高')
    ON CONFLICT (partner_id) DO NOTHING
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

// ── 科學園區偵測 ───────────────────────────────────────────────────────────────
// 對應 Python: is_science_park(destination)
const SCIENCE_PARK_KEYWORDS = ["科學園區", "科學工業園區", "科技園區", "南科", "中科", "竹科", "龍潭科學城"];
function detectSciencePark(address: string): string | null {
  return SCIENCE_PARK_KEYWORDS.find(k => address.includes(k)) ?? null;
}

// ── 山區偵測 ───────────────────────────────────────────────────────────────────
// 對應 Python: is_mountain_area(destination)
const MOUNTAIN_KEYWORDS = ["山區", "山地鄉", "清境", "梨山", "武陵", "司馬庫斯", "奧萬大", "霧社", "信義鄉", "仁愛鄉", "三地門", "茂林", "桃源鄉", "那瑪夏", "宜蘭南澳"];
function detectMountainArea(address: string): string | null {
  return MOUNTAIN_KEYWORDS.find(k => address.includes(k)) ?? null;
}

// ── 特殊進倉區偵測 ─────────────────────────────────────────────────────────────
// 對應 Python: is_special_zone(destination)  → 進場費 / 進倉費
// generate_auto_quote: if is_special_zone(destination): surcharge = 500
// Python: if any(keyword in destination for keyword in ["倉", "碼頭", "機場"])
const SPECIAL_ZONE_KEYWORDS = ["進倉", "倉庫", "物流中心", "配送中心", "貨運站", "轉運站", "工業區倉儲", "集散站", "保稅倉", "保稅區", "自由貿易港", "碼頭", "貨運碼頭", "機場", "國際機場", "國際貨站"];
function detectSpecialZone(address: string): string | null {
  return SPECIAL_ZONE_KEYWORDS.find(k => address.includes(k)) ?? null;
}

// ── 合約客戶專用偏遠地區關鍵字偵測 ──────────────────────────────────────────────
// 對應 Python: is_remote_area(destination) → remote_fee（離島/偏鄉加成）
// 使用關鍵字陣列（同 detectSciencePark / detectMountainArea 模式）
const REMOTE_AREA_KEYWORDS = ["離島", "金門", "馬祖", "澎湖", "綠島", "蘭嶼", "琉球", "小琉球", "七美", "望安", "偏遠鄉", "部落", "台東池上", "台東關山", "東河", "海端", "延平鄉", "達仁", "花蓮秀林"];
function detectRemoteKw(address: string): string | null {
  return REMOTE_AREA_KEYWORDS.find(k => address.includes(k)) ?? null;
}

// ── GET /api/freight-quote/partners ──────────────────────────────────────────
freightQuoteRouter.get("/freight-quote/partners", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM partner_contract_config ORDER BY tier, id`);
    res.json({ ok: true, partners: rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/freight-quote/partners ─────────────────────────────────────────
freightQuoteRouter.post("/freight-quote/partners", async (req, res) => {
  try {
    const { partner_id, partner_name, tier = "一般", base_price = 800, rate_per_km = 25, park_fee = 300, mountain_fee = 500, special_zone_fee = 500, remote_fee = 1000, profit_margin = 0.15, notes = "" } = req.body;
    if (!partner_id || !partner_name) return res.status(400).json({ ok: false, error: "需要 partner_id 和 partner_name" });
    await pool.query(
      `INSERT INTO partner_contract_config (partner_id, partner_name, tier, base_price, rate_per_km, park_fee, mountain_fee, special_zone_fee, remote_fee, profit_margin, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [partner_id, partner_name, tier, base_price, rate_per_km, park_fee, mountain_fee, special_zone_fee, remote_fee, profit_margin, notes]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── PUT /api/freight-quote/partners/:id ──────────────────────────────────────
freightQuoteRouter.put("/freight-quote/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { partner_name, tier, base_price, rate_per_km, park_fee, mountain_fee, special_zone_fee = 500, remote_fee = 1000, profit_margin = 0.15, notes, active } = req.body;
    await pool.query(
      `UPDATE partner_contract_config SET partner_name=$1, tier=$2, base_price=$3, rate_per_km=$4,
       park_fee=$5, mountain_fee=$6, special_zone_fee=$7, remote_fee=$8, profit_margin=$9,
       notes=$10, active=$11, updated_at=NOW() WHERE id=$12`,
      [partner_name, tier, base_price, rate_per_km, park_fee, mountain_fee, special_zone_fee, remote_fee, profit_margin, notes, active ?? true, id]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── DELETE /api/freight-quote/partners/:id ───────────────────────────────────
freightQuoteRouter.delete("/freight-quote/partners/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM partner_contract_config WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/freight-quote/partner-calculate ─────────────────────────────────
// 對應 auto_quote_engine() + generate_auto_quote() — 三種地點自動偵測
// 邏輯：從 DB 讀取合約費率 → 距離計算 → 科學園區/山區/進倉區加成 → 回傳 price + detail
freightQuoteRouter.post("/freight-quote/partner-calculate", async (req, res) => {
  try {
    const { partner_id, origin, destination, car_type = "3.5t" } = req.body as {
      partner_id: string; origin: string; destination: string; car_type?: string;
    };
    if (!partner_id || !origin || !destination) {
      return res.status(400).json({ ok: false, error: "需要 partner_id、origin、destination" });
    }

    // 1. 從 DB 抓取合約等級配置（對應 Python: db.collection("Partners").document(partner_id).get()）
    const partnerRow = await pool.query<{
      partner_id: string; partner_name: string; tier: string;
      base_price: string; rate_per_km: string;
      park_fee: string; mountain_fee: string; special_zone_fee: string;
      remote_fee: string; profit_margin: string; notes: string;
    }>(`SELECT * FROM partner_contract_config WHERE partner_id=$1 AND active=true LIMIT 1`, [partner_id]);

    if (!partnerRow.rows[0]) {
      return res.status(404).json({ ok: false, error: `找不到合約客戶：${partner_id}，請先至後台新增` });
    }
    const p = partnerRow.rows[0];
    const basePrice       = Number(p.base_price);
    const ratePerKm       = Number(p.rate_per_km);
    const parkFee         = Number(p.park_fee);
    const mountainFee     = Number(p.mountain_fee);
    const specialZoneFee  = Number(p.special_zone_fee ?? 500);
    // 對應 Python: settings.get('remote_fee', 1000) 和 settings.get('profit_margin', 0.15)
    const remoteFee       = Number(p.remote_fee ?? 1000);
    const profitMargin    = Number(p.profit_margin ?? 0.15);

    // 2. 取得精準公里數（串接 Google API，對應 Python: get_real_road_distance(origin, destination)）
    const distResult = await getDistanceKm(origin, destination);
    const km = distResult.distance_km;

    // 3. 全方位地點偵測（對應 Python: is_science_park / is_mountain_area / is_special_zone / is_remote_area）
    const parkKw        = detectSciencePark(destination);
    const mountainKw    = detectMountainArea(destination);
    const specialZoneKw = detectSpecialZone(destination);
    const remoteKw      = detectRemoteKw(destination);

    let surcharge = 0;
    const appliedSurcharges: { type: string; label: string; keyword: string; amount: number }[] = [];
    const tags: string[] = [];  // Python: tags = []

    if (parkKw) {
      surcharge += parkFee;
      appliedSurcharges.push({ type: "science_park", label: "科學園區費", keyword: parkKw, amount: parkFee });
      tags.push("科學園區費");
    }
    if (mountainKw) {
      surcharge += mountainFee;
      appliedSurcharges.push({ type: "mountain", label: "山區費", keyword: mountainKw, amount: mountainFee });
      tags.push("山區加成");
    }
    if (specialZoneKw) {
      // 對應 Python: if any(keyword in destination for keyword in ["倉", "碼頭", "機場"]): surcharge += warehouse_fee
      surcharge += specialZoneFee;
      appliedSurcharges.push({ type: "special_zone", label: "進倉服務費", keyword: specialZoneKw, amount: specialZoneFee });
      tags.push("進倉服務費");
    }
    if (remoteKw) {
      // 對應 Python: if is_remote_area(destination): surcharge += remote_fee; tags.append("偏鄉加成")
      surcharge += remoteFee;
      appliedSurcharges.push({ type: "remote", label: "偏鄉加成", keyword: remoteKw, amount: remoteFee });
      tags.push("偏鄉加成");
    }

    // 4. 根據客戶等級計算總價
    //    Python: total_quote = base_price + (distance_km * rate_per_km) + surcharge; return round(total_quote)
    const distFee   = km * ratePerKm;
    const subtotal  = basePrice + distFee;
    const total     = Math.round(subtotal + surcharge);

    // 5. 利潤計算 對應 Python: platform_profit = total_quote * settings.get('profit_margin', 0.15)
    const profit    = Math.round(total * profitMargin);

    // 6. Python 格式的 detail 字串
    const detail = `里程 ${km.toFixed(1)}km × $${ratePerKm} + 起步 $${basePrice}${surcharge > 0 ? ` + 特殊加成 $${surcharge}` : ""}`;

    res.json({
      ok: true,
      // Python get_automated_quote() 完整回傳格式
      client_name:       p.partner_name,
      quote:             total,
      profit,
      distance:          `${km.toFixed(1)} km`,
      applied_surcharges: tags,
      // Python generate_auto_quote() 兼容格式
      price:  total,
      detail,
      // 完整前端結構
      partner: { partner_id: p.partner_id, partner_name: p.partner_name, tier: p.tier },
      breakdown: {
        distance_km:     km,
        distance_source: distResult.source,
        duration_min:    distResult.duration_min ?? null,
        base_price:      basePrice,
        rate_per_km:     ratePerKm,
        distance_fee:    Math.round(distFee),
        surcharges:      appliedSurcharges,
        surcharge_total: surcharge,
        profit_margin:   profitMargin,
        profit,
        total_price:     total,
        detail,
      },
    });
  } catch (err: any) {
    console.error("[PartnerQuote]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
