import { useQueryClient } from "@tanstack/react-query";
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
