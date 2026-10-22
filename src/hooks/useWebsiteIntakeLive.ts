import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

import { callbacksRoot } from './api/useCallbacks';
import { enrolmentsRoot } from './api/useEnrolments';
import { grievancesRoot } from './api/useGrievances';

/**
 * Refetch the grievance and registration lists, and the counts the nav badges
 * read, whenever the server says the alert list changed, and whenever the app
 * comes back to the foreground.
 *
 * Both are invalidated by the same root key (`grievancesRoot`, `enrolmentsRoot`):
 * the lists and the badge's `limit=0` count request each hang off it under their
 * own key, so one call covers every one of them.
 *
 * Mounted once, in the app shell, beside the alert and ticket listeners — and
 * not inside the hooks — because the nav badges are on every screen. Two copies
 * of this listener would refetch the same queries twice for one event, and a
 * listener that lived only in the pages would leave the badge stale everywhere
 * else.
 *
 * A grievance and a registration each raise an alert, so `alerts:changed` is
 * the event: there is no separate one. The socket instance is rebuilt when the
 * signed-in account changes, so the effect follows the token.
 *
 * For a plain admin both invalidations find nothing to refresh and do nothing:
 * the lists and the counts are only ever requested by a super-admin.
 */
export function useWebsiteIntakeLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => {
      void qc.invalidateQueries({ queryKey: grievancesRoot });
      void qc.invalidateQueries({ queryKey: enrolmentsRoot });
      void qc.invalidateQueries({ queryKey: callbacksRoot });
    };
    socket.on('alerts:changed', onChanged);
    return () => {
      socket.off('alerts:changed', onChanged);
    };
  }, [qc, token]);

  // The page tells the reader to go and call the person, which means leaving
  // the app. While it is in the background the socket's events are lost and the
  // poll does not tick, and the app turns refetch-on-focus off globally — so
  // coming back has to ask again, or the list is the one from before the call.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: grievancesRoot });
        void qc.invalidateQueries({ queryKey: enrolmentsRoot });
        void qc.invalidateQueries({ queryKey: callbacksRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}
