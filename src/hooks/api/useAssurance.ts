import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dsrKeys } from '@/hooks/api/useDsr';
import { api, ApiError } from '@/lib/api';
import type {
  AssuranceOverrideInput,
  AssuranceOverrideResult,
  AssuranceReportVerdict,
} from '@/lib/assurance';

import { assuranceKeys } from './useAssuranceQueue';

/**
 * The pre-send correctness gate, per report.
 *
 * WHY THIS IS A REQUEST AND NOT `report.assurance`. The stored verdict on the
 * report is what was true at generate time. `stale` is set on an EXISTING report
 * long afterwards — 1E's report was flagged by a re-baseline hours after it was
 * built — and a check added or tightened tomorrow would never apply to anything
 * already written. So the server re-evaluates on demand and takes the worse of
 * the two, and the admin has to read that answer, not the stored one.
 */

// The key namespace lives in `useAssuranceQueue.ts` and is re-exported here so
// either import path works. Declaring a second object under the same name is
// what this replaces.
export { assuranceKeys };

/** A 4xx here is an answer, not a blip — a deleted report will not reappear. */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return count < 1;
}

/**
 * One report's verdict, evaluated now.
 *
 * `staleTime` is short on purpose, and shorter than the report itself
 * (`useDsrReport` holds for five minutes). A report is immutable until it is
 * regenerated, but its VERDICT is not: a correction elsewhere in the admin can
 * flag it stale while this panel is open, and the gate reads `stale` live.
 */
export function useAssuranceReport(reportId: string | undefined) {
  return useQuery({
    queryKey: assuranceKeys.report(reportId),
    queryFn: () => api.get<AssuranceReportVerdict>(`/assurance/reports/${reportId}`),
    enabled: !!reportId,
    retry: retryUnlessClientError,
    staleTime: 30_000,
  });
}

/**
 * Release a held report by hand.
 *
 * The server refuses anything that does not name EVERY holding finding code and
 * pins the permission to the exact figures it was granted against, so this is
 * never a blanket "send it anyway".
 *
 * Both prefixes are invalidated on success, and both are needed: the verdict
 * feeds the panel, and the Share button that the verdict gates is rendered from
 * the DSR report itself. Invalidating one would leave the panel saying
 * "released" above a button still refusing to send. `dsrKeys.all` rather than
 * one report key is the convention every other DSR mutation follows here — the
 * same report is on screen as `latest` on the Vault tab and as `report` in the
 * history selector, and they must not disagree.
 */
export function useOverrideAssurance(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssuranceOverrideInput) =>
      api.post<AssuranceOverrideResult>(
        `/assurance/reports/${reportId}/override`,
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assuranceKeys.all });
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
    },
  });
}
