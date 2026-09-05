import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

/**
 * Inbox tabs. `all` = every active ticket (unassigned OPEN + ASSIGNED) across the
 * team; `flagged` = active tickets auto-returned to the pool for a missed reply
 * SLA (available for filtering; surfaced as colour badges in the other tabs).
 *
 * `ai` is a LENS, not a partition: it is the `open` set — the same unassigned
 * tickets — narrowed to the threads the AI first line has said something on.
 * Nothing moves into it, nothing leaves the other tabs to be in it, and no
 * conversation status changes. That is the same reason the machine has no fourth
 * `ConversationStatus`: a fifth status would drop these rows out of every other
 * tab and four of the five counts while the dealer sat waiting.
 *
 * `ai-guard` is a SECOND lens on the same argument: the threads where somebody
 * tried to plant a figure in MDG's mouth or read the system instruction back
 * out. It is NOT `flagged`, which means one thing — an assigned ticket missed
 * its reply SLA — and is cleared by pickup, by any admin reply, by resolve, by
 * reopen and by a records post. An operational alarm should clear when the work
 * is done; an observation about a person's behaviour must survive being replied
 * to, so it reads `ai.abuse` and only a super-admin pressing Clear removes it.
 *
 * It also includes ASSIGNED where `ai` excludes it, and that is deliberate: an
 * admin taking the ticket is the RIGHT response to a guard hit, and dropping the
 * row the moment somebody picks it up would hide the ones being handled.
 */
export type InboxFilter =
  | 'open'
  | 'mine'
  | 'all'
  | 'resolved'
  | 'flagged'
  | 'ai'
  | 'ai-guard';

export const conversationsKey = (filter: InboxFilter) =>
  ['conversations', { filter }] as const;

export function useConversations(filter: InboxFilter) {
  return useQuery({
    queryKey: conversationsKey(filter),
    queryFn: () =>
      api.get<Conversation[]>('/conversations', { status: filter, limit: 100 }),
    staleTime: 10_000,
    // Focus refetching is off globally (see lib/queryClient.ts); the inbox is
    // one of the few places where being stale is silently wrong, so it opts
    // back in. Sockets cover the connected case, but a socket that dropped
    // while the tab was hidden loses the events it missed and comes back with
    // no way to know it — and `refetchOnReconnect` never fires, because the
    // network itself never went down. This list also feeds the AppShell unread
    // badge.
    refetchOnWindowFocus: true,
  });
}

export interface InboxCounts {
  open: number;
  mine: number;
  all: number;
  resolved: number;
  flagged: number;
  /**
   * The ⚡ AI lens. A SUBSET of `open`, never a sixth pile — these rows are also
   * counted in `open` and in `all`, exactly as they are also listed there.
   */
  ai: number;
  /**
   * The AI guard lens. A subset of the ACTIVE set (unassigned and assigned
   * both), on the same terms: nothing leaves another tab to be counted here.
   */
  aiGuard: number;
}

// Shares the ['conversations'] prefix so an inbox invalidation refreshes the
// badges too — but it's one countDocuments round-trip, not four decorated lists.
export const conversationCountsKey = ['conversations', 'counts'] as const;

export function useConversationCounts() {
  return useQuery({
    queryKey: conversationCountsKey,
    queryFn: () => api.get<InboxCounts>('/conversations/counts'),
    staleTime: 10_000,
    // Opted back in for the same reason as the list above: the tab badges are
    // read as fact, and a missed socket event leaves them quietly wrong.
    refetchOnWindowFocus: true,
  });
}
