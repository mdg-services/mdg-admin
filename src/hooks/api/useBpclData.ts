import { useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import { isYmd } from '@/lib/format';
import type { ProviderCrossCheck } from '@dk/shared';

/**
 * Query keys for BPCL outlets' data.
 *
 * They hang off the `['irasData']` prefix on purpose: a BPCL day is stored in the
 * same Vault snapshots as an Indian Oil one, and a re-collection already
 * invalidates that whole prefix — so the comparison with BPCL's page refreshes
 * with the day it was worked from, with nothing extra to remember.
 */
export const bpclDataKeys = {
  crossCheck: (dealerId: string | undefined, date: string | undefined) =>
    ['irasData', 'bpclCrossCheck', dealerId, date] as const,
};

/** A client error (a 404 for "no such day") never improves on a retry. */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return count < 1;
}

/**
 * Our report for one day set beside BPCL's own page for the same window.
 *
 * `date` is the REPORT's business day — see `crossCheckDateFor` for how a Vault
 * day maps onto it. The route answers 200 with `unavailableReason` set when
 * there is nothing to compare (no report yet, nothing stored from BPCL); that is
 * a normal state, not an error.
 *
 * Kept for a minute: the figures only move when the day is re-collected (which
 * invalidates this) or the report is regenerated.
 */
export function useBpclCrossCheck(
  dealerId: string | undefined,
  date: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: bpclDataKeys.crossCheck(dealerId, date),
    queryFn: () =>
      api.get<ProviderCrossCheck>(`/bpcl-data/${dealerId}/cross-check`, { date }),
    enabled: !!dealerId && isYmd(date) && (opts.enabled ?? true),
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}
