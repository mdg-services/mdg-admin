import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type { Grievance, GrievanceList, GrievanceView } from '@dk/shared';

/** Every grievance query hangs off this prefix, so one invalidation refreshes them all. */
export const grievancesRoot = ['grievances'] as const;
export const grievancesKey = (view: GrievanceView) => ['grievances', view] as const;
/** The nav badge's own small request: counts only, under the same root. */
export const grievanceCountsKey = ['grievances', 'counts'] as const;

/**
 * What people have sent from the website's grievance page.
 *
 * `open` is what still needs a person; `all` is everything ever sent, newest
 * first, cut at the newest 500. The counts in the reply are true totals, so a
 * list the server has cut short still prints the right number on its tab.
 *
 * Kept fresh the way the alert list is, and for the same reason: a new grievance
 * raises an alert and the server says `alerts:changed` the moment it does, which
 * `useWebsiteIntakeLive` (mounted once, in the shell) turns into a refetch of
 * this list; coming back to a backgrounded phone refetches too; and the poll
 * covers a socket that dropped. The page sits behind `RequireSuperAdmin`, so
 * this is only ever asked for by someone the endpoint will answer.
 */
export function useGrievancesQuery(view: GrievanceView) {
  return useQuery({
    queryKey: grievancesKey(view),
    queryFn: () => api.get<GrievanceList>('/admin/grievances', { view }),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * Just the counts: the same endpoint with `limit=0`, which returns no rows and
 * the true totals. The nav badge is in the shell for every admin on every
 * screen, and it must not download up to 500 grievances, each with its full
 * message, to print one number.
 *
 * `enabled` is for that badge. The endpoint is super-admin only, so a plain
 * admin must never send the request — it would come back 403 on every poll,
 * for ever.
 */
export function useGrievanceCountsQuery(enabled = true) {
  return useQuery({
    queryKey: grievanceCountsKey,
    queryFn: () => api.get<GrievanceList>('/admin/grievances', { limit: 0 }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * What the nav badge shows: grievances nobody has resolved. Its own request
 * (`useGrievanceCountsQuery`), refreshed with the lists on every event, so
 * resolving one on the page takes the number down everywhere at once.
 */
export function useOpenGrievanceCount(): number {
  const isSuperAdmin = useIsSuperAdmin();
  return useGrievanceCountsQuery(isSuperAdmin).data?.counts.open ?? 0;
}

/**
 * Everything a resolve or a reopen changes: the lists and counts, and the
 * `grievance_open` alert that clears with it. Run on SETTLED rather than
 * success, so a failure (somebody else just resolved it) also pulls the screen
 * back to the truth.
 */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: grievancesRoot });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
}

/**
 * Close a grievance with a written note. The server refuses an empty note, and
 * does NOT tell the person: the note is for the team, and they are told by
 * phone or email.
 */
export function useResolveGrievance() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<Grievance>(`/admin/grievances/${id}/resolve`, { note }),
    onSettled: refresh,
  });
}

/** Put a resolved grievance back on the open list. */
export function useReopenGrievance() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<Grievance>(`/admin/grievances/${id}/reopen`),
    onSettled: refresh,
  });
}
