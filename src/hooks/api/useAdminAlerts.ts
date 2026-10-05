import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { AdminAlert, AdminAlertList } from '@dk/shared';

/** The three lists the Alerts page shows. `open` is also what the bell counts. */
export type AlertView = 'open' | 'dismissed' | 'cleared';

export const adminAlertsKey = (view: AlertView) => ['admin-alerts', view] as const;

/**
 * One view of the alert list.
 *
 * Kept fresh three ways, because an alert is only useful while it is current:
 * the server says `alerts:changed` over the socket the moment anything is
 * raised, cleared or hidden (`useAlertsLive`); coming back to a backgrounded
 * phone refetches; and a two-minute poll covers a socket that dropped.
 */
export function useAdminAlertsQuery(view: AlertView) {
  return useQuery({
    queryKey: adminAlertsKey(view),
    queryFn: () => api.get<AdminAlertList>('/admin-alerts', { view }),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** What the bell and the nav badge show. Shares the page's cache entry, so no second request. */
export function useOpenAlertCount(): number {
  return useAdminAlertsQuery('open').data?.counts.open ?? 0;
}

/**
 * Listen for the server's "the list changed" and refetch every view.
 *
 * Mounted once, in the app shell, so the bell is live on every screen — not
 * only while the Alerts page is open. The socket instance is rebuilt when the
 * signed-in account changes, so the effect follows the token.
 */
export function useAlertsLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    socket.on('alerts:changed', onChanged);
    return () => {
      socket.off('alerts:changed', onChanged);
    };
  }, [qc, token]);

  // The admin app is a WebView that is backgrounded every time the phone
  // locks, and the app turns refetch-on-focus off globally. Coming back to a
  // stale "nothing to do" is the one failure a to-do list must not have.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}

function useAlertAction(action: 'dismiss' | 'restore') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminAlert>(`/admin-alerts/${id}/${action}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-alerts'] }),
  });
}

/** Hide an alert while its problem still stands, or mark an event as seen. */
export function useDismissAlert() {
  return useAlertAction('dismiss');
}

/** Put a hidden alert back on the list. */
export function useRestoreAlert() {
  return useAlertAction('restore');
}
