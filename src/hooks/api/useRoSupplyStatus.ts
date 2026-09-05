import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { RoSupplyStatusSummary } from '@dk/shared';

/**
 * A dealer's RO supply status — whether SAP is blocking supply to their outlet,
 * and the RDB/SDMS compliance conditions behind it. Never 404s (the backend
 * returns an empty summary for a dealer that was never captured), so this drives
 * the Vault pane directly.
 *
 * `staleTime` is 30s rather than the minute this data actually changes in,
 * because the pane is opened deliberately by someone who wants to know NOW —
 * usually because a dealer just rang about a blocked indent.
 */
export function useRoSupplyStatus(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['roSupplyStatus', dealerId],
    enabled: !!dealerId,
    queryFn: () =>
      api.get<RoSupplyStatusSummary>(`/ro-supply-status/dealers/${dealerId}/summary`),
    staleTime: 30_000,
  });
}

/**
 * Capture the RO supply status now. Reuses the normal run machinery on the
 * backend; on success the summary is invalidated so the pane refreshes once the
 * capture lands.
 */
export function useCollectRoSupplyStatus(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ runId: string }>(`/ro-supply-status/dealers/${dealerId}/collect`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roSupplyStatus', dealerId] });
    },
  });
}
