import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

import { heldMessagesRoot } from './api/useHeldMessages';
import { onboardingRoot, outletSetupRoot } from './api/useOnboarding';

/**
 * Refetch the review queue — and the held count on every Setup card and board row —
 * whenever the server says a message was held, sent, dropped or expired
 * (`heldMessages:changed`), and whenever the app comes back to the foreground.
 *
 * It is its own event, not `outletSetup:changed`: nothing about the outlet's setup
 * moved, a message just arrived in the queue. The payload names only the outlet and
 * every admin socket gets it, so this invalidates the roots and lets each mounted
 * query read its own scoped answer again; an invalidated query with no observer just
 * goes stale and costs nothing.
 *
 * Mounted once, in the app shell, beside the other live listeners. The socket is
 * rebuilt when the signed-in account changes, so the effect follows the token.
 */
export function useHeldMessagesLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => {
      void qc.invalidateQueries({ queryKey: heldMessagesRoot });
      void qc.invalidateQueries({ queryKey: outletSetupRoot });
      void qc.invalidateQueries({ queryKey: onboardingRoot });
    };
    socket.on('heldMessages:changed', onChanged);
    return () => {
      socket.off('heldMessages:changed', onChanged);
    };
  }, [qc, token]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: heldMessagesRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}
