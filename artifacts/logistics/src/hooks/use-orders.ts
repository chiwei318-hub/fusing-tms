import { useQueryClient } from "@tanstack/react-query";
import { 
  useListOrders, 
  useCreateOrder, 
  useUpdateOrder, 
  useGetOrder,
  getListOrdersQueryKey,
  getGetOrderQueryKey
} from "@workspace/api-client-react";
import type { CreateOrderInput, UpdateOrderInput, ListOrdersParams } from "@workspace/api-client-react/src/generated/api.schemas";

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
