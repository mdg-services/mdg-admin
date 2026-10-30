import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type {
  TicketCounts,
  TicketOnItBody,
  TicketState,
  TicketView,
} from '@dk/shared';

/** One page of `GET /tickets`. `nextBefore` is the cursor for the page after it. */
export interface TicketPage {
  items: TicketView[];
  nextBefore?: string;
}

/**
 * Every ticket query hangs off this one prefix, so a single invalidation
 * refreshes the list, the counts and every thread's strip together.
 */
export const ticketsRoot = ['tickets'] as const;
export const ticketListKey = (state: TicketState) =>
  ['tickets', 'list', state] as const;
export const ticketCountsKey = ['tickets', 'counts'] as const;
export const threadTicketsKey = (conversationId: string | null | undefined) =>
  ['tickets', 'thread', conversationId] as const;

const PAGE_SIZE = 50;

/**
 * One tab of the Tickets page, a page at a time.
 *
 * Open arrives urgent first and then oldest first; Resolved arrives newest
 * resolution first. The server owns both orders and the cursor that walks
 * them, so this only hands `nextBefore` back as `before` and never re-sorts.
 *
 * Kept fresh the way the alert list is: the server says `tickets:changed` over
 * the socket (`useTicketsLive`), coming back to a backgrounded phone refetches,
 * and a two-minute poll covers a socket that dropped.
 */
export function useTicketListQuery(state: TicketState) {
  return useInfiniteQuery({
    queryKey: ticketListKey(state),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<TicketPage>('/tickets', {
        state,
        limit: PAGE_SIZE,
        before: pageParam,
      }),
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * Open / not-yet-opened / urgent. ONE cache entry shared by the nav badge and
 * the page's tab, on purpose: resolving a ticket takes the number down
 * everywhere at once.
 */
export function useTicketCountsQuery() {
  return useQuery({
    queryKey: ticketCountsKey,
    queryFn: () => api.get<TicketCounts>('/tickets/counts'),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/** What the nav badge shows. Shares the page's cache entry, so no second request. */
export function useOpenTicketCount(): number {
  return useTicketCountsQuery().data?.open ?? 0;
}

/**
 * Every OPEN ticket on one thread, plus the ones resolved in the last seven
 * days, newest first — what the strip above the composer reads.
 *
 * Opts back in to refetching on focus, as the open thread's own queries do:
 * focus refetching is off globally, and a thread left open on a phone that
 * locked would otherwise come back showing a ticket somebody else resolved.
 */
export function useThreadTicketsQuery(conversationId: string | null) {
  return useQuery({
    queryKey: threadTicketsKey(conversationId),
    queryFn: () =>
      api.get<TicketView[]>(`/conversations/${conversationId}/tickets`),
    enabled: !!conversationId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Listen for the server's "a ticket changed" and refetch everything that shows
 * one.
 *
 * Mounted once, in the app shell, so the nav badge is live on every screen and
 * not only while the Tickets page is open. The inbox is refreshed as well: its
 * rows carry the open-ticket count, and the Tickets filter and its number are
 * read off it. The socket instance is rebuilt when the signed-in account
 * changes, so the effect follows the token.
 */
export function useTicketsLive(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => {
      void qc.invalidateQueries({ queryKey: ticketsRoot });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    socket.on('tickets:changed', onChanged);
    return () => {
      socket.off('tickets:changed', onChanged);
    };
  }, [qc, token]);

  // The admin app is a WebView that is backgrounded every time the phone locks,
  // and the app turns refetch-on-focus off globally. A ticket list that comes
  // back showing "nothing open" because the event was missed is the one failure
  // this screen must not have.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: ticketsRoot });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);
}

/**
 * Everything a resolve or a reopen changes: the ticket lists and counts, the
 * inbox rows and its Tickets count, the `ticket_open` alert that clears with
 * it, and the Today queue row. Run on SETTLED rather than success, so a 409
 * ("somebody just resolved it") also pulls the screen back to the truth.
 */
function useRefreshAfterTicketChange() {
  const qc = useQueryClient();
  return React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ticketsRoot });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  }, [qc]);
}

/**
 * Stamp "an admin has looked at this". The server keeps the FIRST caller only,
 * so calling it again — from a second tab, or from the list and the thread both
 * — changes nothing.
 */
export function useMarkTicketSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TicketView>(`/tickets/${id}/seen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketsRoot }),
  });
}

/**
 * Close a ticket with a written note. The only way a ticket closes: the server
 * refuses an empty or over-long note (400) and a ticket that is already closed
 * (409).
 */
export function useResolveTicket() {
  const refresh = useRefreshAfterTicketChange();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<TicketView>(`/tickets/${id}/resolve`, { note }),
    onSettled: refresh,
  });
}

/** Put a resolved ticket back. Refused (409) if the thread already has another open one. */
export function useReopenTicket() {
  const refresh = useRefreshAfterTicketChange();
  return useMutation({
    mutationFn: (id: string) => api.post<TicketView>(`/tickets/${id}/reopen`),
    onSettled: refresh,
  });
}

/** Flag a ticket as time-critical, or take the flag off. */
export function useSetTicketUrgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, urgent }: { id: string; urgent: boolean }) =>
      api.patch<TicketView>(`/tickets/${id}`, { urgent }),
    onSettled: () => qc.invalidateQueries({ queryKey: ticketsRoot }),
  });
}

/**
 * "On it until…": a person tells the dealer when an update is coming, and the AI
 * stays off that matter until then. Setting it again replaces the time — a new
 * time is a new promise. The server refuses a time that is past or more than 72
 * hours away (400) and a ticket that is already closed (409).
 *
 * Only the ticket queries are refreshed: it changes nothing on the inbox rows or
 * the alerts. Run on SETTLED, so a 409 pulls the strip back to the truth too.
 */
export function useSetTicketOnIt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: Date }) => {
      const body: TicketOnItBody = { until: until.toISOString() };
      return api.post<TicketView>(`/tickets/${id}/on-it`, body);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ticketsRoot }),
  });
}

/** "Let AI answer": take the promise off. The ticket stays open and keeps its owner. 409 if there is none. */
export function useClearTicketOnIt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<TicketView>(`/tickets/${id}/on-it`),
    onSettled: () => qc.invalidateQueries({ queryKey: ticketsRoot }),
  });
}
