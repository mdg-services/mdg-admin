import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Dealer, Paginated, DealerStatus } from '@dk/shared';
import type { DealerCreateInput, DealerUpdateInput } from '@dk/shared/schemas';


export interface DealerListParams {
  search?: string;
  status?: DealerStatus;
  page?: number;
  pageSize?: number;
  sort?: string;
  /**
   * Surface archived (soft-deleted) dealers too. Server-side, not a client
   * filter — this list is paginated, so hiding rows locally would leave holes in
   * the page and a wrong total. The backend honours it for super-admins only.
   */
  includeArchived?: boolean;
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
        includeArchived: params.includeArchived ? true : undefined,
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

/**
 * Archiving or restoring a dealer moves it in and out of the roster, changes the
 * overview tiles, pauses its service attachments and gates its members' logins —
 * so refresh everything keyed on it rather than just the list.
 */
function invalidateAfterDealerLifecycle(
  qc: ReturnType<typeof useQueryClient>,
  dealer: Dealer,
) {
  qc.setQueryData(['dealer', dealer.id], dealer);
  qc.invalidateQueries({ queryKey: ['dealers'] });
  qc.invalidateQueries({ queryKey: ['dealerAudit', dealer.id] });
  qc.invalidateQueries({ queryKey: ['dealerServices', dealer.id] });
  qc.invalidateQueries({ queryKey: ['overview'] });
  qc.invalidateQueries({ queryKey: ['super-admin', 'users'] });
}

/**
 * Archive (soft-delete) a dealer: super-admin only, reversible, and it returns
 * the updated dealer rather than just an id so the detail page can re-render
 * from the response.
 */
export function useArchiveDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<Dealer>(`/dealers/${id}`),
    onSuccess: (data) => invalidateAfterDealerLifecycle(qc, data),
  });
}

/**
 * Restore an archived dealer. Status stays SUSPENDED and its services stay
 * PAUSED — restoring never silently resumes automation.
 */
export function useRestoreDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Dealer>(`/dealers/${id}/restore`),
    onSuccess: (data) => invalidateAfterDealerLifecycle(qc, data),
  });
}
