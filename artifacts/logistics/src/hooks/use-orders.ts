import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { 
  useListOrders, 
  useCreateOrder, 
  useUpdateOrder, 
  useGetOrder,
  getListOrdersQueryKey,
  getGetOrderQueryKey
} from "@workspace/api-client-react";
import type { CreateOrderInput, UpdateOrderInput, ListOrdersParams } from "@workspace/api-client-react/src/generated/api.schemas";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export function useOrdersData(params?: ListOrdersParams) {
  return useListOrders(params);
}

export function useOrderDetail(id: number) {
  return useGetOrder(id, { query: { enabled: !!id } });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  return useCreateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      },
    },
  });
}

export function useUpdateOrderMutation() {
  const queryClient = useQueryClient();
  return useUpdateOrder({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(variables.id) });
      },
    },
  });
}

export function useDeleteOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(`${BASE_URL}/api/orders/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "刪除失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    },
  });
}

export function useDuplicateOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(`${BASE_URL}/api/orders/${id}/duplicate`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "複製失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders-all"],
    queryFn: async () => {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json() as Promise<any[]>;
    },
    refetchInterval: 30_000,
  });
}
