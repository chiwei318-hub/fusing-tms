import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const VEHICLE_TYPES = ['1.75T', '3.5T', '5T', '8.8T', '17T', '26T', '35T', '43T'] as const;
type VehicleType = typeof VEHICLE_TYPES[number];

interface Tier { minVal: number; maxVal: number; surcharge: number; }
interface VehicleRule {
  basePrice: number;
  pricePerKm: number;
  weightTiers: Tier[];
  volumeTiers: Tier[];
  waitingFeePerHour: number;
  tollsFixed: number;
  taxRate: number;
  profitRate: number;
}
interface PricingRules {
  vehicles: Record<VehicleType, VehicleRule>;
  specialCargoes: { id: string; name: string; surcharge: number }[];
}

const DEFAULT_RULES: PricingRules = {
  vehicles: {
    '1.75T': {
      basePrice: 1500, pricePerKm: 15,
      weightTiers: [{ minVal: 0, maxVal: 800, surcharge: 0 }, { minVal: 800, maxVal: 1750, surcharge: 300 }],
      volumeTiers: [{ minVal: 0, maxVal: 6, surcharge: 0 }, { minVal: 6, maxVal: 9, surcharge: 300 }],
      waitingFeePerHour: 200, tollsFixed: 0, taxRate: 5, profitRate: 20,
    },
    '3.5T': {
      basePrice: 2000, pricePerKm: 18,
      weightTiers: [{ minVal: 0, maxVal: 1500, surcharge: 0 }, { minVal: 1500, maxVal: 3500, surcharge: 500 }],
      volumeTiers: [{ minVal: 0, maxVal: 10, surcharge: 0 }, { minVal: 10, maxVal: 18, surcharge: 500 }],
      waitingFeePerHour: 300, tollsFixed: 0, taxRate: 5, profitRate: 20,
    },
    '5T': {
      basePrice: 2800, pricePerKm: 20,
      weightTiers: [{ minVal: 0, maxVal: 2500, surcharge: 0 }, { minVal: 2500, maxVal: 5000, surcharge: 800 }],
      volumeTiers: [{ minVal: 0, maxVal: 15, surcharge: 0 }, { minVal: 15, maxVal: 25, surcharge: 800 }],
      waitingFeePerHour: 400, tollsFixed: 200, taxRate: 5, profitRate: 20,
    },
    '8.8T': {
      basePrice: 3500, pricePerKm: 22,
      weightTiers: [{ minVal: 0, maxVal: 4000, surcharge: 0 }, { minVal: 4000, maxVal: 8800, surcharge: 1200 }],
      volumeTiers: [{ minVal: 0, maxVal: 25, surcharge: 0 }, { minVal: 25, maxVal: 44, surcharge: 1200 }],
      waitingFeePerHour: 500, tollsFixed: 300, taxRate: 5, profitRate: 20,
    },
    '17T': {
      basePrice: 5000, pricePerKm: 25,
      weightTiers: [{ minVal: 0, maxVal: 8000, surcharge: 0 }, { minVal: 8000, maxVal: 17000, surcharge: 2000 }],
      volumeTiers: [{ minVal: 0, maxVal: 45, surcharge: 0 }, { minVal: 45, maxVal: 85, surcharge: 2000 }],
      waitingFeePerHour: 600, tollsFixed: 500, taxRate: 5, profitRate: 20,
    },
    '26T': {
      basePrice: 7000, pricePerKm: 30,
      weightTiers: [{ minVal: 0, maxVal: 13000, surcharge: 0 }, { minVal: 13000, maxVal: 26000, surcharge: 3000 }],
      volumeTiers: [{ minVal: 0, maxVal: 65, surcharge: 0 }, { minVal: 65, maxVal: 130, surcharge: 3000 }],
      waitingFeePerHour: 800, tollsFixed: 800, taxRate: 5, profitRate: 20,
    },
    '35T': {
      basePrice: 9000, pricePerKm: 35,
      weightTiers: [{ minVal: 0, maxVal: 18000, surcharge: 0 }, { minVal: 18000, maxVal: 35000, surcharge: 4000 }],
      volumeTiers: [{ minVal: 0, maxVal: 85, surcharge: 0 }, { minVal: 85, maxVal: 175, surcharge: 4000 }],
      waitingFeePerHour: 1000, tollsFixed: 1000, taxRate: 5, profitRate: 20,
    },
    '43T': {
      basePrice: 11000, pricePerKm: 40,
      weightTiers: [{ minVal: 0, maxVal: 22000, surcharge: 0 }, { minVal: 22000, maxVal: 43000, surcharge: 5000 }],
      volumeTiers: [{ minVal: 0, maxVal: 100, surcharge: 0 }, { minVal: 100, maxVal: 215, surcharge: 5000 }],
      waitingFeePerHour: 1200, tollsFixed: 1200, taxRate: 5, profitRate: 20,
    },
  },
  specialCargoes: [
    { id: '1', name: '易碎品', surcharge: 500 },
    { id: '2', name: '危險品', surcharge: 2000 },
    { id: '3', name: '冷藏貨品', surcharge: 1500 },
    { id: '4', name: '超長貨品(>3m)', surcharge: 800 },
    { id: '5', name: '超重機械', surcharge: 3000 },
  ],
};

const COLD_CHAIN_FEES: Record<string, number> = {
  '冷凍(-18°C以下)': 3000,
  '冷藏(0~5°C)': 2000,
  '恆溫(15~25°C)': 1200,
};

let _rulesCache: PricingRules | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30_000; // 30s

async function loadRules(): Promise<PricingRules> {
  if (_rulesCache && Date.now() - _cacheTime < CACHE_TTL) return _rulesCache;
  try {
    const rows = await db.execute(
      sql`SELECT value FROM pricing_config WHERE key = 'vehicle_rate_cards' LIMIT 1`
    );
    const row = rows.rows[0] as any;
    if (row?.value) {
      _rulesCache = { ...DEFAULT_RULES, ...JSON.parse(row.value) };
      _cacheTime = Date.now();
      return _rulesCache;
    }
  } catch (e) {
    console.error("[pricingEngine] loadRules error", e);
  }
  _rulesCache = DEFAULT_RULES;
  _cacheTime = Date.now();
  return _rulesCache;
}

function applyTiers(tiers: Tier[], value: number): number {
  let surcharge = 0;
  for (const t of tiers) {
    if (value > t.minVal) {
      surcharge = t.surcharge;
    }
  }
  return surcharge;
}

export async function calculatePricingWithVehicle(params: {
  vehicleType?: string;
  distanceKm?: number;
  cargoWeight?: number;
  cargoLengthM?: number;
  cargoWidthM?: number;
  cargoHeightM?: number;
  volumeCbm?: number;
  pickupTime?: string;
  waitingHours?: number;
  tollsFixed?: number;
  needColdChain?: boolean;
  coldChainTemp?: string;
  specialCargoes?: string[] | string;
}) {
  const rules = await loadRules();

  const vt = (params.vehicleType ?? "3.5T") as VehicleType;
  const rule = rules.vehicles[vt] ?? rules.vehicles["3.5T"];

  const dist = params.distanceKm ?? 0;
  const weight = params.cargoWeight ?? 0;
  const vol =
    params.volumeCbm ??
    (params.cargoLengthM ?? 0) * (params.cargoWidthM ?? 0) * (params.cargoHeightM ?? 0);
  const waitHours = params.waitingHours ?? 0;
  const tolls = params.tollsFixed ?? rule.tollsFixed;

  const basePrice = rule.basePrice;
  const distanceCharge = Math.round(dist * rule.pricePerKm);
  const weightSurcharge = applyTiers(rule.weightTiers, weight);
  const volumeSurcharge = applyTiers(rule.volumeTiers, vol);

  const waitingFee = Math.round(waitHours * rule.waitingFeePerHour);

  // Cold chain fee
  let coldChainFee = 0;
  if (params.needColdChain) {
    const temp = params.coldChainTemp ?? "";
    coldChainFee = COLD_CHAIN_FEES[temp] ?? 1500;
  }

  // Special cargoes
  let specialSurcharge = 0;
  const specialList = Array.isArray(params.specialCargoes)
    ? params.specialCargoes
    : typeof params.specialCargoes === "string" && params.specialCargoes
    ? params.specialCargoes.split(",")
    : [];
  for (const name of specialList) {
    const found = rules.specialCargoes.find(
      (s) => s.name === name.trim() || s.id === name.trim()
    );
    if (found) specialSurcharge += found.surcharge;
    else if (name.trim().includes("冷藏") && !params.needColdChain) {
      coldChainFee = Math.max(coldChainFee, 1500);
    }
  }

  const subtotal =
    basePrice + distanceCharge + weightSurcharge + volumeSurcharge +
    coldChainFee + specialSurcharge + waitingFee + tolls;

  const taxAmount = Math.round(subtotal * (rule.taxRate / 100));
  const subtotalWithTax = subtotal + taxAmount;
  const profitAmount = Math.round(subtotalWithTax * (rule.profitRate / 100));
  const totalAmount = subtotalWithTax + profitAmount;

  return {
    vehicleType: vt,
    distanceKm: dist,
    cargoWeight: weight,
    volumeCbm: vol,
    basePrice,
    distanceCharge,
    weightSurcharge,
    volumeSurcharge,
    coldChainFee,
    specialSurcharge,
    waitingFee,
    tolls,
    subtotal,
    taxRate: rule.taxRate,
    taxAmount,
    profitRate: rule.profitRate,
    profitAmount,
    totalAmount,
    specialCargoes: specialList,
    needColdChain: params.needColdChain ?? false,
    coldChainTemp: params.coldChainTemp ?? null,
    pricePerKm: rule.pricePerKm,
    waitingFeePerHour: rule.waitingFeePerHour,
  };
}

export function invalidatePricingCache() {
  _rulesCache = null;
  _cacheTime = 0;
}
