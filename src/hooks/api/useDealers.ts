import type { Dealer, Paginated, DealerStatus } from '@dk/shared';
import type { DealerCreateInput, DealerUpdateInput } from '@dk/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface DealerListParams {
  search?: string;
  status?: DealerStatus;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export function useDealersQuery(params: DealerListParams) {
  return useQuery({
    queryKey: ['dealers', params],
    queryFn: () =>
      api.get<Paginated<Dealer>>('/dealers', {
        search: params.search,
        status: params.status,
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useDealerQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['dealer', id],
    queryFn: () => api.get<Dealer>(`/dealers/${id}`),
    enabled: !!id,
  });
}

export function useCreateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DealerCreateInput) =>
      api.post<Dealer>('/dealers', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealers'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useUpdateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: DealerUpdateInput;
    }) => api.patch<Dealer>(`/dealers/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dealers'] });
      qc.setQueryData(['dealer', data.id], data);
      qc.invalidateQueries({ queryKey: ['dealerAudit', data.id] });
    },
  });
}

export function useDeleteDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/dealers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealers'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}
