import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { isYmd } from '@/lib/format';
import type {
  IrasCorrectionCommitInput,
  IrasCorrectionCommitResult,
  IrasCorrectionPreview,
  IrasDataCorrection,
  IrasDayEditorView,
} from '@dk/shared';

import { dsrKeys } from './useDsr';
import { irasDataKeys } from './useIrasData';

/**
 * The shift data editor's API surface.
 *
 * One read for the whole day, one write for every kind of change (including
 * reverts), and one read-only recompute. Kept apart from `useIrasData` because
 * that file is the read-only Vault and this one is the only place in the admin
 * that WRITES portal figures — a distinction worth being able to see in an import
 * list.
 */

/** The pending change set, i.e. a commit without its revision and reason. */
export type IrasPendingChanges = Omit<IrasCorrectionCommitInput, 'revision' | 'reason'>;

export const irasEditKeys = {
  all: ['irasEdits'] as const,
  day: (dealerId: string | undefined, businessDate: string | undefined) =>
    ['irasEdits', 'day', dealerId, businessDate] as const,
  history: (dealerId: string | undefined) => ['irasEdits', 'history', dealerId] as const,
};

/**
 * Everything the editor needs for one dealer-day.
 *
 * `staleTime: 0` on purpose. Every other Vault read is a cache-friendly view of
 * immutable capture data; this one carries the `revision` token a commit is
 * validated against, and a stale token means the operator's Apply fails with
 * "somebody else changed this day" when nobody did.
 */
export function useIrasDay(dealerId: string | undefined, businessDate: string | undefined) {
  return useQuery({
    queryKey: irasEditKeys.day(dealerId, businessDate),
    queryFn: () =>
      api.get<IrasDayEditorView>(`/iras-data/dealers/${dealerId}/days/${businessDate}`),
    enabled: !!dealerId && !!businessDate && isYmd(businessDate),
    staleTime: 0,
  });
}

/** Every correction this dealer has had made, newest day first. */
export function useDealerCorrections(dealerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: irasEditKeys.history(dealerId),
    queryFn: () =>
      api.get<{ corrections: IrasDataCorrection[] }>(
        `/iras-data/dealers/${dealerId}/corrections`,
        { limit: 100 },
      ),
    enabled: !!dealerId && enabled,
    staleTime: 30_000,
  });
}

/**
 * Recompute the day with the pending changes applied — persists nothing.
 *
 * A mutation rather than a query because it is driven by an explicit "review"
 * action over a body the operator is still assembling; caching it by that body
 * would be caching a keystroke.
 */
export function usePreviewIrasCorrections(dealerId: string, businessDate: string) {
  return useMutation({
    mutationFn: (changes: IrasPendingChanges) =>
      api.post<IrasCorrectionPreview>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/corrections/preview`,
        changes,
      ),
  });
}

/**
 * Apply a day's corrections. Invalidates the Vault (the rows changed), the DSR
 * (reports were flagged) and this day (a new revision token) — the commit is one
 * decision, so it refreshes everything that decision touched.
 */
export function useCommitIrasCorrections(dealerId: string, businessDate: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IrasCorrectionCommitInput) =>
      api.put<IrasCorrectionCommitResult>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/corrections`,
        body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasEditKeys.all });
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
    },
  });
}
