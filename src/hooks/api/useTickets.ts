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
  TicketCloseBody,
  TicketCounts,
  TicketOnItBody,
  TicketOpenBody,
  TicketState,
  TicketView,
} from '@dk/shared';

/** One page of `GET /tickets`. `nextBefore` is the cursor for the page after it. */
export interface TicketPage {
  items: TicketView[];
  nextBefore?: string;
}

/** The two filters `GET /tickets` takes beside `state`: the AI's gaps, and a start time. */
export interface TicketListParams {
  kind?: 'gap';
  raisedAfter?: string;
}

/**
 * Every ticket query hangs off this one prefix, so a single invalidation
 * refreshes the list, the counts and every thread's strip together.
 */
export const ticketsRoot = ['tickets'] as const;
export const ticketListKey = (state: TicketState, params?: TicketListParams) =>
  ['tickets', 'list', state, params ?? {}] as const;
export const ticketCountsKey = ['tickets', 'counts'] as const;
export const threadTicketsKey = (conversationId: string | null | undefined) =>
  ['tickets', 'thread', conversationId] as const;

const PAGE_SIZE = 50;

/**
 * One list of tickets, a page at a time.
 *
 * The server owns the cursor, so this only hands `nextBefore` back as `before`.
 * Its own order is kept for the closed list (newest closing first); the open
 * list is re-sorted by the desk (`sortDeskTickets`), because "late" and "waiting"
 * come from the clock and a server order would be stale by the time it drew.
 *
 * Kept fresh the way the alert list is: the server says `tickets:changed` over
 * the socket (`useTicketsLive`), coming back to a backgrounded phone refetches,
 * and a two-minute poll covers a socket that dropped.
 */
export function useTicketListQuery(
  state: TicketState,
  params?: TicketListParams,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: ticketListKey(state, params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<TicketPage>('/tickets', {
        state,
        limit: PAGE_SIZE,
        before: pageParam,
        kind: params?.kind,
        raisedAfter: params?.raisedAfter,
      }),
    getNextPageParam: (last) => last.nextBefore,
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * A refetch of pages already loaded can shift a row across a page edge, and a
 * duplicated id would be a duplicated React key.
 */
export function flattenTicketPages(
  pages: ReadonlyArray<TicketPage> | undefined,
): TicketView[] {
  const seen = new Map<string, TicketView>();
  for (const page of pages ?? []) {
    for (const t of page.items) seen.set(t.id, t);
  }
  return [...seen.values()];
}

/** The most pages of open tickets read in one go. A desk with 500 open has a backlog the list is not the tool for. */
const OPEN_PAGES_MAX = 10;

/**
 * EVERY open ticket, not a page of them.
 *
 * The inbox sorts them itself (late, new, waiting, on it, replied), and a sort
 * of a first page would put the ticket that most needs a person on page two. The
 * server hands them back 50 at a time, so this keeps asking until it has them
 * all — one request in practice, since the whole estate holds a handful.
 */
export function useOpenTicketsQuery(enabled: boolean) {
  const q = useTicketListQuery('OPEN', undefined, { enabled });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, data } = q;
  const pageCount = data?.pages.length ?? 0;
  // A page that FAILED is not asked for again here: the flag clears only on the
  // next success, and re-asking on every render looped once a second for as long
  // as the phone was offline.
  React.useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && pageCount < OPEN_PAGES_MAX) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, pageCount]);
  const items = React.useMemo(() => flattenTicketPages(data?.pages), [data]);
  return { query: q, items };
}

/** The closed tickets, newest closing first, a page at a time. */
export function useClosedTicketsQuery(enabled: boolean) {
  const q = useTicketListQuery('RESOLVED', undefined, { enabled });
  const items = React.useMemo(() => flattenTicketPages(q.data?.pages), [q.data]);
  return { query: q, items };
}

/**
 * The tickets the AI could not answer (`kind=gap`) raised since `raisedAfter`,
 * open and closed. `GET /tickets` answers one state at a time, so this asks for
 * both and the page merges them (`mergeGapTickets`). One page each: a week of
 * gaps is a short list, and the cap is the server's own.
 */
export function useGapTicketsQuery(raisedAfter: string) {
  const open = useQuery(gapQueryOptions('OPEN', raisedAfter));
  const closed = useQuery(gapQueryOptions('RESOLVED', raisedAfter));
  return { open, closed };
}

function gapQueryOptions(state: TicketState, raisedAfter: string) {
  return {
    queryKey: ['tickets', 'gap', state, raisedAfter] as const,
    queryFn: () =>
      api.get<TicketPage>('/tickets', { state, limit: 100, kind: 'gap', raisedAfter }),
    staleTime: 60_000,
  };
}

/**
 * Open / not-yet-opened / needs-us / mine / urgent. ONE cache entry shared by
 * the nav badge and the inbox's tabs, on purpose: closing a ticket takes the
 * number down everywhere at once.
 */
export function useTicketCountsQuery() {
  return useQuery({
    queryKey: ticketCountsKey,
    queryFn: () => api.get<TicketCounts>('/tickets/counts'),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * What the Inbox's badge shows: the open tickets that are New, Waiting or Late —
 * the ones that need a person right now. Shares the inbox tab's cache entry, so
 * no second request.
 */
export function useNeedsUsCount(): number {
  return useTicketCountsQuery().data?.needsUs ?? 0;
}

/**
 * Every OPEN ticket on one thread, plus the ones closed in the last seven
 * days, newest first — what the strip above the composer reads.
 *
 * Opts back in to refetching on focus, as the open thread's own queries do:
 * focus refetching is off globally, and a thread left open on a phone that
 * locked would otherwise come back showing a ticket somebody else closed.
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
    // A dealer's message, a typed reply and "answered outside the app" all move
    // the thread's waiting clock, and a ticket is Waiting or Late by that clock
    // — so the tickets are read again whenever a conversation changes, not only
    // when a ticket itself does. Tickets only: the inbox listens for its own.
    const onConversation = () => {
      void qc.invalidateQueries({ queryKey: ticketsRoot });
    };
    socket.on('tickets:changed', onChanged);
    socket.on('conversation:updated', onConversation);
    return () => {
      socket.off('tickets:changed', onChanged);
      socket.off('conversation:updated', onConversation);
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
 * Everything a close, an open or a reopen changes: the ticket lists and counts,
 * the inbox rows, the `ticket_open` alert that clears with it, and the Today
 * queue row. Run on SETTLED rather than success, so a 409 ("somebody just closed
 * it") also pulls the screen back to the truth.
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
 * Close a ticket. The one way a ticket finishes: nothing is sent to the dealer
 * and the AI's quiet is left alone. Everything in the body is optional — an
 * internal note, and a service to add to the dealer's "Services provided".
 *
 * The server refuses (409, code `DEALER_WAITING`) while the dealer has written
 * since the last reply; the Close sheet sends the answer first, so that is only
 * seen when the dealer wrote again in between. A service entry also refreshes
 * that dealer's history, which is what the old chat Resolve did.
 */
export function useCloseTicket() {
  const qc = useQueryClient();
  const refresh = useRefreshAfterTicketChange();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; dealerId: string; body: TicketCloseBody }) =>
      api.post<TicketView>(`/tickets/${id}/close`, body),
    onSettled: (_data, _err, vars) => {
      refresh();
      void qc.invalidateQueries({ queryKey: ['serviceLogs', vars.dealerId] });
    },
  });
}

/**
 * A person opens a ticket by hand — after a call, a WhatsApp, a visit. One line
 * on what it is about, and optionally "on it until" in the same step. The server
 * refuses (409, with the open ticket) when the thread already has one.
 */
export function useOpenTicket() {
  const refresh = useRefreshAfterTicketChange();
  return useMutation({
    mutationFn: (body: TicketOpenBody) => api.post<TicketView>('/tickets', body),
    onSettled: refresh,
  });
}

/** Put a closed ticket back. Refused (409) if the thread already has another open one. */
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
