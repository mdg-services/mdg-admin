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
 */
export type InboxFilter = 'open' | 'mine' | 'all' | 'resolved' | 'flagged' | 'ai';

export const conversationsKey = (filter: InboxFilter) =>
  ['conversations', { filter }] as const;

export function useConversations(filter: InboxFilter) {
  return useQuery({
    queryKey: conversationsKey(filter),
    queryFn: () =>
      api.get<Conversation[]>('/conversations', { status: filter, limit: 100 }),
    staleTime: 10_000,
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
}

// Shares the ['conversations'] prefix so an inbox invalidation refreshes the
// badges too — but it's one countDocuments round-trip, not four decorated lists.
export const conversationCountsKey = ['conversations', 'counts'] as const;

export function useConversationCounts() {
  return useQuery({
    queryKey: conversationCountsKey,
    queryFn: () => api.get<InboxCounts>('/conversations/counts'),
    staleTime: 10_000,
  });
}
