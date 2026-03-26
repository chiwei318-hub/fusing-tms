export const DIESEL_CO2_PER_LITER = 2.68;

// ─── 車型排放係數（kg CO₂ / km）────────────────────────────────────────────
export const VEHICLE_EMISSION_FACTOR: Record<string, number> = {
  "小貨車":      0.25,
  "箱型車":      0.30,
  "1.5T":        0.30,
  "廂型車":      0.35,
  "3.5T":        0.45,
  "3.5噸廂型車": 0.45,
  "5T":          0.62,
  "5噸貨車":     0.62,
  "冷藏車":      0.75,
  "尾門車":      0.65,
  "8T":          0.85,
  "10T":         0.95,
  "11T":         1.00,
  "17T":         1.20,
  "曳引車":      1.20,
  "鋼板車":      1.00,
  "吊車":        1.10,
};

// ─── 車型燃油效率（km / 公升）─────────────────────────────────────────────
// 公里 ÷ km/L = 用油量（公升）→ 用油量 × 2.68 = CO₂（kg）
export const VEHICLE_FUEL_EFFICIENCY: Record<string, number> = {
  "小貨車":      12,
  "箱型車":      10,
  "1.5T":        10,
  "廂型車":       9,
  "3.5T":         8,
  "3.5噸廂型車":  8,
  "5T":           6,
  "5噸貨車":      6,
  "冷藏車":       5,
  "尾門車":       5.5,
  "8T":           4.5,
  "10T":          4,
  "11T":          4,
  "17T":          3.5,
  "曳引車":       3.5,
  "鋼板車":       4,
  "吊車":         3.5,
};

const DEFAULT_FACTOR = 0.55;
const DEFAULT_EFFICIENCY = 7; // km/L

export function getEmissionFactor(vehicleType?: string | null): number {
  if (!vehicleType) return DEFAULT_FACTOR;
  for (const [key, factor] of Object.entries(VEHICLE_EMISSION_FACTOR)) {
    if (vehicleType.includes(key)) return factor;
  }
  return DEFAULT_FACTOR;
}

export function getFuelEfficiency(vehicleType?: string | null): number {
  if (!vehicleType) return DEFAULT_EFFICIENCY;
  for (const [key, eff] of Object.entries(VEHICLE_FUEL_EFFICIENCY)) {
    if (vehicleType.includes(key)) return eff;
  }
  return DEFAULT_EFFICIENCY;
}

// 公里 × 係數 → CO₂（估算法）
export function calcCarbonKg(
  distanceKm?: number | null,
  vehicleType?: string | null,
): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const factor = getEmissionFactor(vehicleType);
  return Math.round(distanceKm * factor * 10) / 10;
}

// 公里 ÷ km/L → 用油量（公升）
export function calcFuelLiters(
  distanceKm: number,
  kmPerLiter: number,
): number {
  if (kmPerLiter <= 0) return 0;
  return Math.round((distanceKm / kmPerLiter) * 100) / 100;
}

// 用油量（公升）× 2.68 → CO₂（實測法）
export function calcCarbonFromFuel(liters: number): number {
  return Math.round(liters * DIESEL_CO2_PER_LITER * 10) / 10;
}

// 公里 + km/L → CO₂（組合計算）
export function calcCarbonFromKmAndEfficiency(
  distanceKm: number,
  kmPerLiter: number,
): { liters: number; co2: number } {
  const liters = calcFuelLiters(distanceKm, kmPerLiter);
  const co2 = calcCarbonFromFuel(liters);
  return { liters, co2 };
}

export function carbonLabel(kg: number | null): string {
  if (kg === null) return "—";
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} 公噸`;
  return `${kg.toFixed(1)} kg`;
}

export function equivalentTrees(kg: number): number {
  return Math.round(kg / 21.77 * 10) / 10;
}
