/**
 * 模組 3：智慧報價引擎
 * POST /api/smart-quote/calculate
 * POST /api/smart-quote/detect-zone
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const smartQuoteRouter = Router();

// ── 地點分類定義 ──────────────────────────────────────────────────────────────

const ZONE_RULES = [
  {
    zone: "mountain",
    label: "山區",
    multiplier: 1.3,
    flat: 0,
    keywords: [
      "南投","仁愛","信義","魚池","廬山","清境","合歡","太平山","梨山",
      "阿里山","玉山","台東山","花蓮山","瑞穗","光復","鳳林","壽豐",
      "秀林","萬榮","卓溪","玉里","富里","台東縣延平","海端","池上",
      "鹿野","關山","太麻里","達仁","大武","金峰","牡丹","獅子",
    ],
  },
  {
    zone: "science_park",
    label: "科學園區",
    multiplier: 1.0,
    flat: 300,
    keywords: ["竹科","新竹科學園區","中科","台中科學園區","南科","台南科學園區","桃科"],
  },
  {
    zone: "port",
    label: "港口",
    multiplier: 1.0,
    flat: 500,
    keywords: ["基隆港","台中港","高雄港","台北港","花蓮港","蘇澳港","安平港","布袋港"],
  },
  {
    zone: "remote_island",
    label: "離島",
    multiplier: 2.0,
    flat: 2000,
    keywords: ["金門","馬祖","澎湖","綠島","蘭嶼","小琉球","七美","望安"],
  },
  {
    zone: "warehouse",
    label: "進倉",
    multiplier: 1.0,
    flat: 800,
    keywords: ["倉庫","物流中心","配送中心","分撥","機場","海關"],
  },
];

function detectZones(address: string): { zone: string; label: string; multiplier: number; flat: number; keyword: string }[] {
  const found: { zone: string; label: string; multiplier: number; flat: number; keyword: string }[] = [];
  for (const rule of ZONE_RULES) {
    for (const kw of rule.keywords) {
      if (address.includes(kw)) {
        found.push({ zone: rule.zone, label: rule.label, multiplier: rule.multiplier, flat: rule.flat, keyword: kw });
        break;
      }
    }
  }
  return found;
}

async function getDistanceKm(origin: string, destination: string): Promise<{ distance_km: number; duration_min: number; source: string }> {
  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&language=zh-TW&key=${apiKey}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const d = await r.json() as any;
      const el = d?.rows?.[0]?.elements?.[0];
      if (el?.status === "OK") {
        return {
          distance_km: el.distance.value / 1000,
          duration_min: Math.round(el.duration.value / 60),
          source: "google",
        };
      }
    } catch { /* fall through */ }
  }

  // 備援：Haversine 估算
  const geocodeKw: Record<string, [number, number]> = {
    "台北": [25.048, 121.517], "新北": [25.012, 121.465], "桃園": [24.993, 121.301],
    "新竹": [24.814, 120.967], "台中": [24.138, 120.686], "台南": [22.999, 120.212],
    "高雄": [22.627, 120.301], "花蓮": [23.991, 121.601], "台東": [22.755, 121.143],
    "基隆": [25.128, 121.740], "嘉義": [23.480, 120.448], "屏東": [22.676, 120.487],
    "宜蘭": [24.751, 121.753], "苗栗": [24.566, 120.819], "彰化": [24.082, 120.538],
    "南投": [23.912, 120.684], "雲林": [23.708, 120.541], "澎湖": [23.571, 119.579],
  };
  const findLatLng = (addr: string): [number, number] => {
    for (const [k, v] of Object.entries(geocodeKw)) {
      if (addr.includes(k)) return v;
    }
    return [25.048, 121.517]; // 預設台北
  };
  const [lat1, lon1] = findLatLng(origin);
  const [lat2, lon2] = findLatLng(destination);
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance_km = straight * 1.35;
  return { distance_km, duration_min: Math.round(distance_km * 1.5), source: "haversine" };
}

// ── POST /api/smart-quote/detect-zone ────────────────────────────────────────

smartQuoteRouter.post("/smart-quote/detect-zone", (req, res) => {
  const { address } = req.body as { address?: string };
  if (!address) return res.status(400).json({ ok: false, error: "需要 address" });
  const zones = detectZones(address);
  res.json({ ok: true, address, zones, is_mountain: zones.some(z => z.zone === "mountain") });
});

// ── POST /api/smart-quote/calculate ──────────────────────────────────────────

smartQuoteRouter.post("/smart-quote/calculate", async (req, res) => {
  try {
    const {
      partner_id,
      pickup_address,
      delivery_address,
      vehicle_type = "3.5t",
      equipment = [] as string[],
      is_mountain,
      is_warehouse_in,
    } = req.body as {
      partner_id?: number | string;
      pickup_address: string;
      delivery_address: string;
      vehicle_type?: string;
      equipment?: string[];
      is_mountain?: boolean;
      is_warehouse_in?: boolean;
    };

    if (!pickup_address || !delivery_address) {
      return res.status(400).json({ ok: false, error: "需要 pickup_address 和 delivery_address" });
    }

    // 1. 廠商合約費率
    const partnerRow = partner_id
      ? await pool.query(`SELECT * FROM partners WHERE id = $1 AND is_active = true LIMIT 1`, [partner_id])
      : null;

    const partner = partnerRow?.rows[0] ?? {
      name: "標準報價", base_price: 800, km_rate: 25, profit_margin: 15,
      park_fee: 300, mountain_fee: 500, special_zone_fee: 500, remote_fee: 1000,
    };
    const basePrice       = Number(partner.base_price       ?? 800);
    const kmRate          = Number(partner.km_rate          ?? 25);
    const profitMargin    = Number(partner.profit_margin    ?? 15);
    const partnerParkFee  = Number(partner.park_fee         ?? 300);
    const partnerMtnFee   = Number(partner.mountain_fee     ?? 500);
    const partnerZoneFee  = Number(partner.special_zone_fee ?? 500);
    const partnerRemoteFee= Number(partner.remote_fee       ?? 1000);

    // 2. Google Maps 距離
    const dist = await getDistanceKm(pickup_address, delivery_address);
    const km   = dist.distance_km;

    // 3. base = 廠商起步 + 里程費
    const base = basePrice + km * kmRate;

    // 4. 車型權重
    const vtRow = await pool.query(
      `SELECT weight_factor, base_surcharge FROM vehicle_type_matrix WHERE type_code = $1 LIMIT 1`,
      [vehicle_type]
    );
    const vt = vtRow.rows[0] ?? { weight_factor: 1.0, base_surcharge: 0 };
    const weightFactor = Number(vt.weight_factor);
    const vehiclePrice = base * weightFactor + Number(vt.base_surcharge);

    // 5. 設備加成（依序套用：先乘數再加定額）
    let equipmentPrice = vehiclePrice;
    const appliedEquipment: { code: string; name: string; surcharge: number; multiplier: number }[] = [];

    if (equipment.length > 0) {
      const eqRows = await pool.query(
        `SELECT * FROM vehicle_equipment WHERE code = ANY($1)`,
        [equipment]
      );
      for (const eq of eqRows.rows) {
        equipmentPrice = equipmentPrice * Number(eq.multiplier) + Number(eq.surcharge);
        appliedEquipment.push({
          code: eq.code, name: eq.name,
          surcharge: Number(eq.surcharge), multiplier: Number(eq.multiplier),
        });
      }
    }

    // 6. 區域加成
    const deliveryZones = detectZones(delivery_address);
    let areaMultiplier = 1;
    let areaFlat = 0;
    const appliedZones: typeof deliveryZones = [];

    // 手動指定（使用廠商個人費率）
    if (is_mountain) {
      areaMultiplier = Math.max(areaMultiplier, 1.3);
      appliedZones.push({ zone: "mountain", label: "山區", multiplier: 1.3, flat: partnerMtnFee, keyword: "手動指定" });
      areaFlat += partnerMtnFee;
    }
    if (is_warehouse_in) {
      areaFlat += partnerParkFee;
      appliedZones.push({ zone: "warehouse", label: "進倉", multiplier: 1.0, flat: partnerParkFee, keyword: "手動指定" });
    }

    // 自動偵測（zone 乘數來自 ZONE_RULES，flat 替換為廠商費率）
    const zoneFeeMap: Record<string, number> = {
      mountain:     partnerMtnFee,
      science_park: partnerZoneFee,
      port:         partnerZoneFee,
      remote_island:partnerRemoteFee,
      warehouse:    partnerParkFee,
    };
    for (const z of deliveryZones) {
      if (!appliedZones.find(a => a.zone === z.zone)) {
        const flat = zoneFeeMap[z.zone] ?? z.flat;
        areaMultiplier = Math.max(areaMultiplier, z.multiplier);
        areaFlat += flat;
        appliedZones.push({ ...z, flat });
      }
    }

    const areaPrice   = (equipmentPrice * areaMultiplier) + areaFlat - equipmentPrice;
    const totalQuote  = Math.round(equipmentPrice * areaMultiplier + areaFlat);

    // 7. 財務分拆
    const platformRevenue = Math.round(totalQuote * profitMargin / 100);
    const driverPay       = totalQuote - platformRevenue;

    res.json({
      ok: true,
      distance_km:       Math.round(km * 10) / 10,
      duration_min:      dist.duration_min,
      distance_source:   dist.source,
      base_price:        Math.round(base),
      vehicle_surcharge: Math.round(vehiclePrice - base),
      equipment_surcharge: Math.round(equipmentPrice - vehiclePrice),
      area_surcharge:    Math.round(areaPrice),
      total_quote:       totalQuote,
      partner_price:     totalQuote,
      platform_revenue:  platformRevenue,
      driver_pay:        driverPay,
      breakdown: {
        partner:         { name: partner.name, base_price: basePrice, km_rate: kmRate, profit_margin: profitMargin },
        distance:        { km: Math.round(km * 10) / 10, fee: Math.round(km * kmRate) },
        vehicle:         { type_code: vehicle_type, weight_factor: weightFactor, price: Math.round(vehiclePrice) },
        equipment:       appliedEquipment,
        zones:           appliedZones,
        area_multiplier: areaMultiplier,
        area_flat:       areaFlat,
      },
    });
  } catch (err: any) {
    console.error("[SmartQuote]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});
