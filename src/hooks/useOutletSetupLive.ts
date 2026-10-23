import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

import { onboardingRoot, outletSetupRoot } from './api/useOnboarding';

/**
 * Refetch the Onboarding board and every open outlet setup whenever the server
 * says an outlet's setup moved (`outletSetup:changed`: services chosen, billing
 * saved, a bill sent or paid, a login saved, services started), and whenever the
 * app comes back to the foreground.
 *
 * The event carries only the outlet's id and every admin socket gets it, so
 * this does not try to patch one row: both roots are invalidated and each mounted
 * query reads its own scoped answer again. Nothing is fetched for a page that is
 * not open, because an invalidated query with no observer just goes stale.
 *
 * Mounted once, in the app shell, beside the other live listeners, for the same
 * reason `useWebsiteIntakeLive` is: two copies would refetch twice for one event.
 * The socket instance is rebuilt when the signed-in account changes, so the
 * effect follows the token.
 *
 * The visibility refetch is for the same reason as the Registrations page had it:
 * the page tells the reader to go and call someone, which means leaving the app,
 * and while it is in the background the socket's events are lost and the app has
 * refetch-on-focus switched off globally.
 */
export function useOutletSetupLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => {
      void qc.invalidateQueries({ queryKey: onboardingRoot });
      void qc.invalidateQueries({ queryKey: outletSetupRoot });
    };
    socket.on('outletSetup:changed', onChanged);
    return () => {
      socket.off('outletSetup:changed', onChanged);
    };
  }, [qc, token]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: onboardingRoot });
        void qc.invalidateQueries({ queryKey: outletSetupRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}
