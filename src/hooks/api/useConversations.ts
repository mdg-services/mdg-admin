import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

/**
 * Inbox tabs. `all` = every active ticket (unassigned OPEN + ASSIGNED) across the
 * team; `flagged` = active tickets auto-returned to the pool for a missed reply
 * SLA (available for filtering; surfaced as colour badges in the other tabs).
 */
export type InboxFilter = 'open' | 'mine' | 'all' | 'resolved' | 'flagged';

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
