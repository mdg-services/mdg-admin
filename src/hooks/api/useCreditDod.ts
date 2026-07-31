import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  CreditDodLedgerResponse,
  CreditDodQuota,
  CreditDodSnapshotRecord,
} from '@/types/creditDod';
import type { CreditDodShareResult } from '@/types/serviceRun';

export function useCreditDodSnapshot(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ['creditDodSnapshot', snapshotId],
    queryFn: () =>
      api.get<CreditDodSnapshotRecord>(`/credit-dod/snapshots/${snapshotId}`),
    enabled: !!snapshotId,
  });
}

/**
 * Shares the rendered Credit & DOD card with the dealer's chat. On success we
 * invalidate the snapshot, the dealer's snapshot list (so the Shared column in
 * Report history updates) and the owning run.
 */
export function useShareCreditDodSnapshot(
  snapshotId: string,
  { runId, dealerId }: { runId?: string; dealerId?: string } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<CreditDodShareResult>(
        `/credit-dod/snapshots/${snapshotId}/share`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['creditDodSnapshot', snapshotId] });
      // Prefix match — the list key carries a `limit` we don't know here.
      void qc.invalidateQueries({ queryKey: ['creditDodSnapshots', dealerId] });
      if (runId) void qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
}

/**
 * Paginated maintained PAD ledger for a dealer. Rows are newest-first; older
 * rows are fetched by passing the smallest loaded `seq` as `beforeSeq`.
 */
export function useCreditDodLedger(
  dealerId: string | undefined,
  { limit = 50 }: { limit?: number } = {},
) {
  return useInfiniteQuery({
    queryKey: ['creditDodLedger', dealerId, limit],
    enabled: !!dealerId,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CreditDodLedgerResponse>(
        `/credit-dod/dealers/${dealerId}/ledger`,
        { limit, beforeSeq: pageParam },
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.rows.length < limit) return undefined;
      // Page older rows by the smallest loaded seq (rows are newest-first).
      return Math.min(...lastPage.rows.map((r) => r.seq));
    },
  });
}

/** Snapshot (report) history for a dealer, newest-first. */
export function useCreditDodSnapshots(
  dealerId: string | undefined,
  { limit = 50 }: { limit?: number } = {},
) {
  return useQuery({
    queryKey: ['creditDodSnapshots', dealerId, limit],
    enabled: !!dealerId,
    queryFn: () =>
      api.get<CreditDodSnapshotRecord[]>(
        `/credit-dod/dealers/${dealerId}/snapshots`,
        { limit },
      ),
  });
}

/**
 * How many manual generations this dealer has left. Refetched after a run is
 * triggered so the counter is honest without a page reload.
 */
export function useCreditDodQuota(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['creditDodQuota', dealerId],
    enabled: !!dealerId,
    queryFn: () =>
      api.get<CreditDodQuota>(`/credit-dod/dealers/${dealerId}/quota`),
    // The window is ROLLING, so an exhausted quota heals on its own. Poll while
    // it is empty; otherwise the Generate button stays disabled for an admin
    // sitting on the tab until they reload the page.
    refetchInterval: (query) =>
      query.state.data && !query.state.data.exempt && query.state.data.remaining === 0
        ? 60_000
        : false,
  });
}
