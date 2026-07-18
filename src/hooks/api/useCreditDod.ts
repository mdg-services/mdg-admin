import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
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
