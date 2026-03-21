import { useQueryClient } from "@tanstack/react-query";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";

export function useCustomersData() {
  return useListCustomers();
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();
  return useCreateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
    },
  });
}

export function useUpdateCustomerMutation() {
  const queryClient = useQueryClient();
  return useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
    },
  });
}

export function useDeleteCustomerMutation() {
  const queryClient = useQueryClient();
  return useDeleteCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
    },
  });
}
