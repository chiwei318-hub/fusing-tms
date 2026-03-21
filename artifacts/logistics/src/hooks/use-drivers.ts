import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  useListDrivers, 
  useCreateDriver, 
  useUpdateDriver, 
  useDeleteDriver,
  getListDriversQueryKey
} from "@workspace/api-client-react";

export function useDriversData() {
  return useListDrivers();
}

export function useCreateDriverMutation() {
  const queryClient = useQueryClient();
  return useCreateDriver({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      },
    },
  });
}

export function useUpdateDriverMutation() {
  const queryClient = useQueryClient();
  return useUpdateDriver({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      },
    },
  });
}

export function useDeleteDriverMutation() {
  const queryClient = useQueryClient();
  return useDeleteDriver({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      },
    },
  });
}

// ─── Convenience aliases (used in fleet management) ───────────────────────────
const DRIVERS_KEY = ["drivers-fleet"];

export function useDrivers() {
  return useQuery({
    queryKey: DRIVERS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/drivers");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json() as Promise<any[]>;
    },
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const res = await fetch(`/api/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      qc.invalidateQueries({ queryKey: getListDriversQueryKey() });
    },
  });
}
