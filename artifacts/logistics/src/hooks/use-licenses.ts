import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface VehicleLicense {
  id: number;
  driverId: number | null;
  licenseType: string;
  licenseNumber: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  vehiclePlate: string | null;
  issuedDate: string | null;
  expiryDate: string;
  notes: string | null;
  createdAt: string;
}

export type VehicleLicenseInput = Omit<VehicleLicense, "id" | "createdAt">;

const API = "/api/licenses";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const KEY = ["licenses"];

export function useLicenses() {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<VehicleLicense[]>(API) });
}

export function useCreateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleLicenseInput) =>
      apiFetch<VehicleLicense>(API, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VehicleLicenseInput }) =>
      apiFetch<VehicleLicense>(`${API}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ ok: boolean }>(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ─── Expiry helpers ────────────────────────────────────────────────────────────
export type LicenseStatus = "valid" | "expiring" | "expired";

export function getLicenseStatus(expiryDate: string): LicenseStatus {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "valid";
}

export function getDaysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
