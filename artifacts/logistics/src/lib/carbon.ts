export const DIESEL_CO2_PER_LITER = 2.68;

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

const DEFAULT_FACTOR = 0.55;

export function getEmissionFactor(vehicleType?: string | null): number {
  if (!vehicleType) return DEFAULT_FACTOR;
  for (const [key, factor] of Object.entries(VEHICLE_EMISSION_FACTOR)) {
    if (vehicleType.includes(key)) return factor;
  }
  return DEFAULT_FACTOR;
}

export function calcCarbonKg(
  distanceKm?: number | null,
  vehicleType?: string | null,
): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const factor = getEmissionFactor(vehicleType);
  return Math.round(distanceKm * factor * 10) / 10;
}

export function calcCarbonFromFuel(liters: number): number {
  return Math.round(liters * DIESEL_CO2_PER_LITER * 10) / 10;
}

export function carbonLabel(kg: number | null): string {
  if (kg === null) return "—";
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} 公噸`;
  return `${kg.toFixed(1)} kg`;
}

export function equivalentTrees(kg: number): number {
  return Math.round(kg / 21.77 * 10) / 10;
}
