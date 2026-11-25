import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

import { kavachRoot } from './api/useKavach';

/** The event the server sends when any Kavach check or outlet changes (ADR 0057 §11). */
const EVENT = 'kavach:changed';

interface LooseSocket {
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
}

/**
 * Refresh every Kavach screen — the review count, a run in progress, the
 * outlets list — whenever the server says something moved, and whenever the app
 * comes back to the foreground.
 *
 * Mounted once, in the app shell, beside the other live listeners. The payload
 * names only the outlet; this refreshes everything under `['kavach']` and lets
 * each mounted query read its own answer again — a query nobody is looking at
 * just goes stale and costs nothing. A run in progress keeps its place: it holds
 * its own list of what was decided, so a refresh never reshuffles it.
 */
export function useKavachLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    // The shared socket typing lists the events the server sends to every
    // screen; this one is addressed to the Kavach screens alone.
    const socket = getSocket() as unknown as LooseSocket | null;
    if (!socket) return;
    const onChanged = () => {
      void qc.invalidateQueries({ queryKey: kavachRoot });
    };
    socket.on(EVENT, onChanged);
    return () => {
      socket.off(EVENT, onChanged);
    };
  }, [qc, token]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: kavachRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}
