import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type {
  ComplaintRoute,
  ComplaintsAdminList,
  ComplaintsDealerAdminView,
} from '@dk/shared';
import type { ComplaintSettleInput } from '@dk/shared/schemas';

/**
 * Maintenance complaints (ADR 0052), mounted at `/api/v1/complaints`.
 *
 * Nothing here presses anything on IndianOil's portal. The writes are: "Check now"
 * (a read of the portal's lists), recording how an unclear press or acknowledgement
 * ended after a person looked at the portal, asking the dealer the "is it fixed?"
 * question for a complaint the portal raised, clearing an attention flag, and pausing
 * the service for one outlet. Filing and acknowledging happen only on the dealer's
 * own "yes" in the chat.
 */
export type ComplaintsListView = 'open' | 'needs_ack' | 'attention' | 'portal' | 'all';

export const complaintsKeys = {
  all: ['complaints'] as const,
  list: (view: ComplaintsListView, route?: ComplaintRoute, dealerId?: string) =>
    ['complaints', 'list', view, route ?? null, dealerId ?? null] as const,
  dealer: (dealerId: string | undefined) => ['complaints', 'dealer', dealerId] as const,
  badge: ['complaints', 'badge'] as const,
};

/** The cross-outlet list. Polls gently; the socket event below makes it prompt. */
export function useComplaintsList(view: ComplaintsListView, route?: ComplaintRoute, dealerId?: string) {
  return useQuery({
    queryKey: complaintsKeys.list(view, route, dealerId),
    queryFn: () => {
      const p = new URLSearchParams({ view });
      if (route) p.set('route', route);
      if (dealerId) p.set('dealerId', dealerId);
      return api.get<ComplaintsAdminList>(`/complaints?${p.toString()}`);
    },
    staleTime: 20_000,
    refetchInterval: 120_000,
  });
}

/** One outlet's pane. Never 404s; an outlet with nothing yet gets an empty list. */
export function useComplaintsDealerView(dealerId: string | undefined) {
  return useQuery({
    queryKey: complaintsKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<ComplaintsDealerAdminView>(`/complaints/dealers/${dealerId}`),
    staleTime: 20_000,
  });
}

/**
 * The nav badge: complaints that need a person (attention) plus those the dealer
 * has been asked about and not answered (needs acknowledgement). Asks for the
 * counts alone (`limit=1`), not the list.
 */
export function useComplaintsBadgeCount(): number {
  const q = useQuery({
    queryKey: complaintsKeys.badge,
    queryFn: () => api.get<ComplaintsAdminList>('/complaints?view=attention&limit=1'),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
  const c = q.data?.counts;
  return c ? c.attention + c.needsAck : 0;
}

/**
 * Re-read whenever the server says a complaint moved (`complaints:changed`).
 * Every admin socket gets the event for every outlet, so with a `dealerId` only
 * that outlet's pane is refreshed; the cross-outlet lists always are.
 */
export function useComplaintsLive(dealerId?: string): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (payload: { dealerId: string }) => {
      if (dealerId && payload.dealerId !== dealerId) return;
      void qc.invalidateQueries({ queryKey: complaintsKeys.all });
    };
    socket.on('complaints:changed', onChanged);
    return () => {
      socket.off('complaints:changed', onChanged);
    };
  }, [qc, token, dealerId]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: complaintsKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}

function refresh(qc: QueryClient, dealerId: string | undefined, view?: ComplaintsDealerAdminView) {
  if (view) qc.setQueryData(complaintsKeys.dealer(dealerId), view);
  void qc.invalidateQueries({ queryKey: complaintsKeys.all });
}

/**
 * A person records what they saw (or asks the dealer, or clears a flag). Takes
 * the outlet per call because the cross-outlet page settles rows of any outlet.
 * The answer is that outlet's fresh view.
 */
export function useSettleComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      complaintId,
      body,
    }: {
      dealerId: string;
      complaintId: string;
      body: ComplaintSettleInput;
    }) =>
      api.post<ComplaintsDealerAdminView>(
        `/complaints/dealers/${dealerId}/${complaintId}/settle`,
        body,
      ),
    onSuccess: (view, vars) => refresh(qc, vars.dealerId, view),
  });
}

/** What "Check now" answers: how the start went, and the outlet's fresh view. */
export interface ComplaintsCheckReply {
  start: { outcome: 'started' | 'joined' | 'queued' | 'not_started'; reason?: string; runId?: string };
  view: ComplaintsDealerAdminView;
}

/** "Check now": reads the outlet's lists on the portal. `start.runId` is the run to watch. */
export function useCheckComplaintsNow(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ComplaintsCheckReply>(`/complaints/dealers/${dealerId}/run`, {}),
    onSuccess: (res) => {
      if (res?.view) qc.setQueryData(complaintsKeys.dealer(dealerId), res.view);
    },
  });
}

/** Pause or resume the service for one outlet. Filing, following and the dealer's messages all stop while paused. */
export function useSetComplaintsControl(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { paused: boolean; reason?: string }) =>
      api.put<ComplaintsDealerAdminView | { paused: boolean }>(
        `/complaints/dealers/${dealerId}/control`,
        body,
      ),
    onSuccess: (res) => {
      const view = res && 'rows' in res ? res : undefined;
      refresh(qc, dealerId, view);
    },
  });
}
