import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type { Enrolment, EnrolmentList, EnrolmentView } from '@dk/shared';

/** Every enrolment query hangs off this prefix, so one invalidation refreshes them all. */
export const enrolmentsRoot = ['enrolments'] as const;
export const enrolmentsKey = (view: EnrolmentView) => ['enrolments', view] as const;
/** The nav badge's own small request: counts only, under the same root. */
export const enrolmentCountsKey = ['enrolments', 'counts'] as const;

/**
 * What people have sent through "Register your pump", on the website and in the
 * Dealer Kavach app's sign-up screen.
 *
 * `new` is what nobody has been in touch about yet; `all` is everything, newest
 * first, cut at the newest 500. The counts in the reply are true totals.
 *
 * Kept fresh exactly as `useGrievancesQuery` is: `useWebsiteIntakeLive` refetches
 * on the server's `alerts:changed` and when a backgrounded phone comes back, and
 * the poll covers a socket that dropped. The page sits behind `RequireSuperAdmin`.
 */
export function useEnrolmentsQuery(view: EnrolmentView) {
  return useQuery({
    queryKey: enrolmentsKey(view),
    queryFn: () => api.get<EnrolmentList>('/admin/enrolments', { view }),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * Just the counts: the same endpoint with `limit=0`, which returns no rows and
 * the true totals, so the nav badge does not download the list to print one
 * number. `enabled` is for that badge — the endpoint is super-admin only, and a
 * plain admin must never send the request.
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
 * What the nav badge shows: registrations nobody has been in touch about. Its
 * own request (`useEnrolmentCountsQuery`), refreshed with the lists on every
 * event.
 */
export function useNewEnrolmentCount(): number {
  const isSuperAdmin = useIsSuperAdmin();
  return useEnrolmentCountsQuery(isSuperAdmin).data?.counts.new ?? 0;
}

/**
 * Everything marking one contacted, or putting it back, changes: the lists and
 * counts, and the `enrolment_new` alert that clears with it. Run on SETTLED so a
 * failure also pulls the screen back to the truth.
 */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: enrolmentsRoot });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
}

/** Record that somebody at MDG has been in touch. The note is optional. */
export function useMarkEnrolmentContacted() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.post<Enrolment>(`/admin/enrolments/${id}/contacted`, note ? { note } : {}),
    onSettled: refresh,
  });
}

/** Back to NEW, clearing who and when. For a registration marked contacted by mistake. */
export function useReopenEnrolment() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<Enrolment>(`/admin/enrolments/${id}/reopen`),
    onSettled: refresh,
  });
}
