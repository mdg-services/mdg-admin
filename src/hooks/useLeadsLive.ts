import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

import { leadsRoot } from './api/useLeads';

/**
 * At most one refresh this often. A WhatsApp campaign sends one status event
 * per recipient and each used to mean a refetch of every Leads query that was
 * open; the lists move slowly (the server works the clock out every two
 * minutes), so the first event of a quiet spell refreshes at once and the rest
 * of a burst is gathered into one refresh at the end.
 */
const REFRESH_THROTTLE_MS = 5000;

/**
 * Keep the Leads page, the lead drawer, the nav badge and the WhatsApp inbox's
 * lead line current: refetch them whenever the server says the alert list or a
 * WhatsApp chat changed, and whenever the app comes back to the foreground.
 *
 * There is no event of its own for leads yet (docs/specs/leads.md §9). Every
 * lead that needs somebody raises an alert, and every reply, "Call me" tap or
 * message we send moves a WhatsApp chat, so the two events that already exist
 * cover what a person can see change; the polls on the queries catch the rest.
 *
 * All of it hangs off one root key (`leadsRoot`), so one call covers every list,
 * the counts, an open lead and the inbox lookups. Mounted once, in the app
 * shell, beside the other live hooks: the badge is on every screen, and two
 * copies of this would refetch the same queries twice for one event. The socket
 * instance is rebuilt when the signed-in account changes, so the effect follows
 * the token.
 *
 * Coming back to the foreground has to ask again by itself: the page tells the
 * reader to go and call the person, which means leaving the app, and while it is
 * in the background the socket's events are lost, the poll does not tick, and
 * the app turns refetch-on-focus off globally.
 */
export function useLeadsLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: number | null = null;
    let lastRun = 0;
    const run = () => {
      timer = null;
      lastRun = Date.now();
      void qc.invalidateQueries({ queryKey: leadsRoot });
    };
    const onChanged = () => {
      if (timer !== null) return;
      const wait = lastRun + REFRESH_THROTTLE_MS - Date.now();
      if (wait <= 0) run();
      else timer = window.setTimeout(run, wait);
    };
    socket.on('alerts:changed', onChanged);
    socket.on('whatsapp:changed', onChanged);
    return () => {
      socket.off('alerts:changed', onChanged);
      socket.off('whatsapp:changed', onChanged);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [qc, token]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: leadsRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}
