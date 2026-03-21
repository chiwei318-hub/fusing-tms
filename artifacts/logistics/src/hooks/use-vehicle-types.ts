import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface VehicleType {
  id: number;
  name: string;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  volumeM3: number | null;
  maxWeightKg: number | null;
  palletCount: number | null;
  hasTailgate: boolean | null;
  hasRefrigeration: boolean | null;
  hasDumpBody: boolean | null;
  heightLimitM: number | null;
  weightLimitKg: number | null;
  cargoTypes: string | null;
  notes: string | null;
  baseFee: number | null;
}

export type VehicleTypeInput = Omit<VehicleType, "id">;

const API = "/api/vehicle-types";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const KEY = ["vehicle-types"];

export function useVehicleTypes() {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<VehicleType[]>(API) });
}

export function useCreateVehicleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleTypeInput) =>
      apiFetch<VehicleType>(API, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateVehicleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VehicleTypeInput> }) =>
      apiFetch<VehicleType>(`${API}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteVehicleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<VehicleType>(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function matchVehicleType(
  vts: VehicleType[],
  weightKg: number,
  volumeM3: number,
  needTailgate = false,
  needRefrig = false,
): { best: VehicleType | null; overWeight: boolean; overVolume: boolean } {
  const candidates = vts.filter((v) => {
    if (needTailgate && !v.hasTailgate) return false;
    if (needRefrig && !v.hasRefrigeration) return false;
    return true;
  });

  const fits = candidates.filter((v) => {
    const wOk = v.maxWeightKg == null || weightKg <= v.maxWeightKg;
    const vOk = v.volumeM3 == null || volumeM3 <= v.volumeM3;
    return wOk && vOk;
  });

  fits.sort((a, b) => {
    const aScore = (a.maxWeightKg ?? 99999) + (a.volumeM3 ?? 999) * 10;
    const bScore = (b.maxWeightKg ?? 99999) + (b.volumeM3 ?? 999) * 10;
    return aScore - bScore;
  });

  const best = fits[0] ?? null;
  const overWeight = best == null && candidates.some((v) => v.maxWeightKg != null && weightKg > v.maxWeightKg!);
  const overVolume = best == null && candidates.some((v) => v.volumeM3 != null && volumeM3 > v.volumeM3!);

  return { best, overWeight, overVolume };
}
