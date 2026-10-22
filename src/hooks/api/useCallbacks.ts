import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type { CallbackList, CallbackRequest, CallbackView } from '@dk/shared';

/** Every call-back query hangs off this prefix, so one invalidation refreshes them all. */
export const callbacksRoot = ['callbacks'] as const;
export const callbacksKey = (view: CallbackView) => ['callbacks', view] as const;
/** The nav badge's own small request: counts only, under the same root. */
export const callbackCountsKey = ['callbacks', 'counts'] as const;

/**
 * Everyone who asked for a call on the website: the film pages' "we'll call
 * you", the home page's "Leave my number", the Khata Kavach page and the site
 * assistant's fallback.
 *
 * `new` is who nobody has called yet; `all` is everything, newest first, cut at
 * the newest 500. Kept fresh as the Registrations list is (`useWebsiteIntakeLive`).
 */
export function useCallbacksQuery(view: CallbackView) {
  return useQuery({
    queryKey: callbacksKey(view),
    queryFn: () => api.get<CallbackList>('/admin/callbacks', { view }),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** Just the counts (`limit=0`), for the nav badge. Super-admin only: never sent for anyone else. */
export function useCallbackCountsQuery(enabled = true) {
  return useQuery({
    queryKey: callbackCountsKey,
    queryFn: () => api.get<CallbackList>('/admin/callbacks', { limit: 0 }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** What the nav badge shows: people waiting for the call they asked for. */
export function useNewCallbackCount(): number {
  const isSuperAdmin = useIsSuperAdmin();
  return useCallbackCountsQuery(isSuperAdmin).data?.counts.new ?? 0;
}

/** The lists, the counts and the `callback_new` alert that clears with a change. On SETTLED, so a failure also pulls the screen back to the truth. */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: callbacksRoot });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
}

/** Record that somebody at MDG has called them. The note is optional. */
export function useMarkCallbackCalled() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.post<CallbackRequest>(`/admin/callbacks/${id}/called`, note ? { note } : {}),
    onSettled: refresh,
  });
}

/** Back to NEW. For a request marked called by mistake. */
export function useReopenCallback() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<CallbackRequest>(`/admin/callbacks/${id}/reopen`),
    onSettled: refresh,
  });
}
