import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { DealerWorkList, EffectiveWorkItem } from '@dk/shared';
import type { UpdateDealerWorkListInput } from '@dk/shared/schemas';

export const dealerWorkListKey = (dealerId: string | undefined) =>
  ['dealerWorkList', dealerId] as const;

export const effectiveWorkItemsKey = (dealerId: string | undefined) =>
  ['effectiveWorkItems', dealerId] as const;

/** The dealer's overlay on the global catalog: hidden default codes + customs. */
export function useDealerWorkListQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: dealerWorkListKey(dealerId),
    queryFn: () =>
      api.get<DealerWorkList>(`/dealers/${dealerId}/staff/work-list`),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/** The dealer's EFFECTIVE work list — what workers actually see (defaults minus hidden, plus customs). */
export function useEffectiveWorkItems(dealerId: string | undefined) {
  return useQuery({
    queryKey: effectiveWorkItemsKey(dealerId),
    queryFn: () =>
      api.get<EffectiveWorkItem[]>(`/dealers/${dealerId}/work-items`),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/** Full-replace the dealer's work-list overlay ({ hiddenCodes, customItems }). */
export function useUpdateDealerWorkList(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDealerWorkListInput) =>
      api.put<DealerWorkList>(`/dealers/${dealerId}/staff/work-list`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealerWorkListKey(dealerId) });
      qc.invalidateQueries({ queryKey: effectiveWorkItemsKey(dealerId) });
      // The effective list feeds the award picker + roster point math.
      qc.invalidateQueries({ queryKey: ['staff', 'overview', dealerId] });
    },
  });
}
