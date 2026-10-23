import { useQuery } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type { EnrolmentList } from '@dk/shared';

/**
 * Every enrolment query hangs off this prefix, so one invalidation refreshes
 * them all. The nav badge's count below is the only one left: the list of
 * registrations is the Onboarding page's board now (`useOnboarding.ts`), and
 * marking one "contacted" went with the old Registrations page. Approving or
 * closing a registration invalidates this root, so the badge follows.
 */
export const enrolmentsRoot = ['enrolments'] as const;
/** The nav badge's own small request: counts only, under the same root. */
export const enrolmentCountsKey = ['enrolments', 'counts'] as const;

/**
 * Just the counts: `/admin/enrolments` with `limit=0`, which returns no rows
 * and the true totals, so the nav badge does not download the list to print one
 * number. `enabled` is for that badge — the endpoint is super-admin only, and a
 * plain admin must never send the request.
 *
 * Kept fresh by `useWebsiteIntakeLive`, which refetches on the server's
 * `alerts:changed` and when a backgrounded phone comes back; the poll covers a
 * socket that dropped.
 */
export function useEnrolmentCountsQuery(enabled = true) {
  return useQuery({
    queryKey: enrolmentCountsKey,
    queryFn: () => api.get<EnrolmentList>('/admin/enrolments', { limit: 0 }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * What the Onboarding entry's badge shows: registrations nobody has dealt with
 * yet. Its own request (`useEnrolmentCountsQuery`), refreshed with the lists on
 * every event. Silent for a plain admin, who cannot read the endpoint.
 */
export function useNewEnrolmentCount(): number {
  const isSuperAdmin = useIsSuperAdmin();
  return useEnrolmentCountsQuery(isSuperAdmin).data?.counts.new ?? 0;
}
