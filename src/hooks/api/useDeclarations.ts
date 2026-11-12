import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { hasLiveRun } from '@/pages/dealers/vault/declarations/format';
import { useAuthStore } from '@/store/auth';
import type { DeclarationsAdminView } from '@dk/shared';
import type { DeclarationsAdminAction, DeclarationsConfigBody } from '@dk/shared/schemas';

/**
 * Dealer Declarations (ADR 0037), as the admin's Data Vault pane reads and drives
 * it. The routes are mounted at `/api/v1/declarations`; each answers
 * `{ ok: true, data }`, which `api` unwraps.
 *
 * One cache entry per outlet holds the whole `DeclarationsAdminView`. Every call
 * an admin makes (an action, a switch) answers that same view, so a mutation
 * REPLACES the cached copy instead of invalidating it. An action that starts a
 * robot run answers at once with the run listed as RUNNING; the pane then
 * re-reads every few seconds (and on the socket's word) until it ends.
 */
export const declarationsKeys = {
  all: ['declarations'] as const,
  dealer: (dealerId: string | undefined) => ['declarations', dealerId] as const,
};

/**
 * Is a run in flight that will change this view by itself. Only a run listed as working
 * that started recently counts. The washroom cycle's own "filing" word does not: a cycle
 * can sit on it for good when the run that was filing it died, and the pane would then
 * re-read every few seconds forever.
 */
function isMoving(view: DeclarationsAdminView | undefined): boolean {
  return !!view && hasLiveRun(view.runs, Date.now());
}

/** `GET /declarations/dealers/:dealerId` — everything the pane draws for one outlet. */
export function useDeclarationsAdminView(dealerId: string | undefined) {
  return useQuery({
    queryKey: declarationsKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<DeclarationsAdminView>(`/declarations/dealers/${dealerId}`),
    staleTime: 15_000,
    refetchInterval: (query) => (isMoving(query.state.data) ? 4_000 : false),
  });
}

function cacheView(qc: QueryClient, dealerId: string, view: DeclarationsAdminView): void {
  qc.setQueryData<DeclarationsAdminView>(declarationsKeys.dealer(dealerId), view);
}

/**
 * Re-read this outlet whenever the server says its Declarations state moved
 * (`declarations:changed`: the owner sent a photo, a run started or ended, an
 * admin pressed a button), and when the app comes back to the foreground. The
 * alerts for this service are raised and cleared by the same server work, and
 * the Alerts page reads its own list, so nothing else is listened to here.
 *
 * Every admin socket gets the event for every outlet, so the payload's
 * `dealerId` is checked. Pass `undefined` to listen to nothing (a thread that
 * holds no Declarations box).
 */
export function useDeclarationsLive(dealerId: string | undefined): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!dealerId) return;
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (payload: { dealerId: string }) => {
      if (payload.dealerId !== dealerId) return;
      void qc.invalidateQueries({ queryKey: declarationsKeys.dealer(dealerId) });
    };
    socket.on('declarations:changed', onChanged);
    return () => {
      socket.off('declarations:changed', onChanged);
    };
  }, [qc, token, dealerId]);

  React.useEffect(() => {
    if (!dealerId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: declarationsKeys.dealer(dealerId) });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, dealerId]);
}

/**
 * `POST /declarations/dealers/:dealerId/action` — Check now, Run today's round,
 * Ask owner, File now, Test fill, Retry, Drop photos, "I checked: it went through / it
 * did not", I filled it. Answers the whole view again.
 */
export function useDeclarationsAction(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeclarationsAdminAction) =>
      api.post<DeclarationsAdminView>(`/declarations/dealers/${dealerId}/action`, input),
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}

/**
 * `PATCH /declarations/dealers/:dealerId/config` — the switches and limits.
 *
 * Optimistic: a switch is one tap and its answer is the same view with the
 * switch moved, so the pane flips at once and rolls back if the server refuses.
 */
export function useDeclarationsConfig(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeclarationsConfigBody) =>
      api.patch<DeclarationsAdminView>(`/declarations/dealers/${dealerId}/config`, body),
    onMutate: async (body) => {
      if (!dealerId) return { before: undefined };
      await qc.cancelQueries({ queryKey: declarationsKeys.dealer(dealerId) });
      const before = qc.getQueryData<DeclarationsAdminView>(declarationsKeys.dealer(dealerId));
      if (before) cacheView(qc, dealerId, { ...before, config: { ...before.config, ...body } });
      return { before };
    },
    onError: (_err, _body, ctx) => {
      if (dealerId && ctx?.before) cacheView(qc, dealerId, ctx.before);
    },
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}
