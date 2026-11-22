import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { WorkPermitsAdminList, WorkPermitsDealerAdminView } from '@dk/shared';
import type { WorkPermitSettleInput } from '@dk/shared/schemas';

/**
 * Work permits (ADR 0053), mounted at `/api/v1/work-permits`.
 *
 * Nothing here presses anything on IndianOil's portal. The writes are: "Check now"
 * (a read of SDMS's permit list), recording what a person saw on SDMS, and resetting
 * an outlet's letterhead kit. Issuing and closing happen from the dealer's own words
 * in the chat.
 */
export type WorkPermitsListView = 'active' | 'attention' | 'all';

export const workPermitsKeys = {
  all: ['work-permits'] as const,
  list: (view: WorkPermitsListView, dealerId?: string) =>
    ['work-permits', 'list', view, dealerId ?? null] as const,
  dealer: (dealerId: string | undefined) => ['work-permits', 'dealer', dealerId] as const,
  badge: ['work-permits', 'badge'] as const,
};

/** The cross-outlet list. Polls gently; the socket event below makes it prompt. */
export function useWorkPermitsList(view: WorkPermitsListView, dealerId?: string) {
  return useQuery({
    queryKey: workPermitsKeys.list(view, dealerId),
    queryFn: () => {
      const p = new URLSearchParams({ view });
      if (dealerId) p.set('dealerId', dealerId);
      return api.get<WorkPermitsAdminList>(`/work-permits?${p.toString()}`);
    },
    staleTime: 20_000,
    refetchInterval: 120_000,
  });
}

/** One outlet's pane. */
export function useWorkPermitsDealerView(dealerId: string | undefined) {
  return useQuery({
    queryKey: workPermitsKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<WorkPermitsDealerAdminView>(`/work-permits/dealers/${dealerId}`),
    staleTime: 20_000,
  });
}

/** The nav badge: permits that need a person. Asks for the counts alone (`limit=1`). */
export function useWorkPermitsBadgeCount(): number {
  const q = useQuery({
    queryKey: workPermitsKeys.badge,
    queryFn: () => api.get<WorkPermitsAdminList>('/work-permits?view=attention&limit=1'),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
  return q.data?.counts.attention ?? 0;
}

/**
 * Re-read whenever the server says a permit moved (`workPermits:changed`). Every admin
 * socket gets the event for every outlet, so with a `dealerId` only that outlet's pane
 * is refreshed; the cross-outlet lists always are.
 */
export function useWorkPermitsLive(dealerId?: string): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (payload: { dealerId: string }) => {
      if (dealerId && payload.dealerId !== dealerId) return;
      void qc.invalidateQueries({ queryKey: workPermitsKeys.all });
    };
    socket.on('workPermits:changed', onChanged);
    return () => {
      socket.off('workPermits:changed', onChanged);
    };
  }, [qc, token, dealerId]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: workPermitsKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}

function refresh(qc: QueryClient, dealerId: string | undefined, view?: WorkPermitsDealerAdminView) {
  if (view) qc.setQueryData(workPermitsKeys.dealer(dealerId), view);
  void qc.invalidateQueries({ queryKey: workPermitsKeys.all });
}

/** A person records what they saw on SDMS (or closes the permit, or clears a flag). The answer is that outlet's fresh view. */
export function useSettleWorkPermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      permitId,
      body,
    }: {
      dealerId: string;
      permitId: string;
      body: WorkPermitSettleInput;
    }) =>
      api.post<WorkPermitsDealerAdminView>(
        `/work-permits/dealers/${dealerId}/${permitId}/settle`,
        body,
      ),
    onSuccess: (view, vars) => refresh(qc, vars.dealerId, view),
  });
}

/** What "Check now" answers: how the start went, and the outlet's fresh view. */
export interface WorkPermitsCheckReply {
  start: { outcome: 'started' | 'joined' | 'queued' | 'not_started'; reason?: string; runId?: string };
  view: WorkPermitsDealerAdminView;
}

/** "Check now": reads SDMS's permit list for the outlet. `start.runId` is the run to watch. */
export function useCheckWorkPermitsNow(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WorkPermitsCheckReply>(`/work-permits/dealers/${dealerId}/run`, {}),
    onSuccess: (res) => {
      if (res?.view) qc.setQueryData(workPermitsKeys.dealer(dealerId), res.view);
    },
  });
}

/** Forget the outlet's letterhead kit; the dealer is asked to choose again at the next permit. */
export function useResetLetterhead(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<WorkPermitsDealerAdminView>(`/work-permits/dealers/${dealerId}/letterhead/reset`, {}),
    onSuccess: (view) => refresh(qc, dealerId, view),
  });
}

/** A short-lived link to the permit PDF or the Letter of Authorization. */
export function fetchPermitFileUrl(
  dealerId: string,
  permitId: string,
  doc: 'pdf' | 'letter',
): Promise<{ url: string }> {
  return api.get<{ url: string }>(`/work-permits/dealers/${dealerId}/${permitId}/file?doc=${doc}`);
}
