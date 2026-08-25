import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { kavachKeys } from '@/hooks/api/useKavach';
import { api } from '@/lib/api';
import type { DealerKavachList, EffectiveKavachItem } from '@dk/shared';
import type { UpdateDealerKavachListInput } from '@dk/shared/schemas';

export const dealerKavachListKey = (dealerId: string | undefined) =>
  ['dealerKavachList', dealerId] as const;

export const effectiveKavachItemsKey = (dealerId: string | undefined) =>
  ['effectiveKavachItems', dealerId] as const;

/** This dealer's overlay on the global catalog: hidden codes, customs, overrides. */
export function useDealerKavachListQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: dealerKavachListKey(dealerId),
    queryFn: () =>
      api.get<DealerKavachList>(`/dealers/${dealerId}/kavach/work-list`),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/** The resolved list this dealer is actually scored against — catalog + overlay. */
export function useEffectiveKavachItems(dealerId: string | undefined) {
  return useQuery({
    queryKey: effectiveKavachItemsKey(dealerId),
    queryFn: () =>
      api.get<EffectiveKavachItem[]>(
        `/dealers/${dealerId}/kavach/work-list/effective`,
      ),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/**
 * Full-replace the overlay. One PUT rather than a call per change: the server
 * also reconciles this dealer's state rows and rescores them, so a half-applied
 * overlay would leave the score describing a task list that no longer exists.
 */
export function useUpdateDealerKavachList(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDealerKavachListInput) =>
      api.put<DealerKavachList>(`/dealers/${dealerId}/kavach/work-list`, input),
    onSuccess: (data) => {
      qc.setQueryData(dealerKavachListKey(dealerId), data);
      qc.invalidateQueries({ queryKey: effectiveKavachItemsKey(dealerId) });
      // Adding or hiding a task creates or pauses a state row and moves the
      // score, so the tab that shows both is stale the moment this returns.
      qc.invalidateQueries({ queryKey: kavachKeys.items(dealerId) });
      qc.invalidateQueries({ queryKey: kavachKeys.programme(dealerId) });
      qc.invalidateQueries({ queryKey: kavachKeys.workQueue });
      qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    },
  });
}
