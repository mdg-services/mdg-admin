import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  CreditDodLedgerResponse,
  CreditDodSnapshotRecord,
} from '@/types/creditDod';
import type {
  CreditDodShareResult,
  CreditDodSnapshot,
} from '@/types/serviceRun';

export function useCreditDodSnapshot(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ['creditDodSnapshot', snapshotId],
    queryFn: () =>
      api.get<CreditDodSnapshot>(`/credit-dod/snapshots/${snapshotId}`),
    enabled: !!snapshotId,
  });
}

/**
 * Shares the rendered Credit & DOD card with the dealer's chat. On success we
 * invalidate the snapshot (to reflect the `shared` state) and the owning run.
 */
export function useShareCreditDodSnapshot(
  snapshotId: string,
  runId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<CreditDodShareResult>(
        `/credit-dod/snapshots/${snapshotId}/share`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditDodSnapshot', snapshotId] });
      if (runId) qc.invalidateQueries({ queryKey: ['run', runId] });
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
