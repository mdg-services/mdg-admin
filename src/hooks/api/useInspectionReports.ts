import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { InspectionReportSummary } from '@dk/shared';

/**
 * A dealer's Inspection Reports summary — the latest few reports plus how many
 * more the portal holds. Never 404s (the backend returns an empty summary for a
 * dealer that was never captured), so this drives the Vault section directly.
 */
export function useInspectionSummary(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['inspectionSummary', dealerId],
    enabled: !!dealerId,
    queryFn: () =>
      api.get<InspectionReportSummary>(
        `/inspection-reports/dealers/${dealerId}/summary`,
      ),
    staleTime: 30_000,
  });
}

/**
 * Capture (re-capture) a dealer's inspection reports now. Reuses the normal run
 * machinery on the backend; on success we invalidate the summary so the section
 * refreshes once the capture lands.
 */
export function useCollectInspection(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ runId: string }>(
        `/inspection-reports/dealers/${dealerId}/generate`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inspectionSummary', dealerId] });
    },
  });
}
