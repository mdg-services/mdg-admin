import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

/**
 * The two lists the inbox's All chats tab reads.
 *
 * `chats` is every conversation, whatever its status, newest message first — the
 * inbox had eight tabs over three statuses; Pick up, Take over and the chat's
 * own Resolve are gone, so there is nothing left to partition by, and a thread
 * is found by who it is and when it last spoke. The work lives on the Tickets
 * tab (`useTickets`).
 *
 * `ai-guard` is the one lens that stays: the threads where somebody tried to
 * plant a figure in MDG's mouth or read the system instruction back out. It is
 * not a piece of work and nothing clears it but a super-admin pressing Clear, so
 * it survives being replied to — which is why it reads the guard's own counter
 * and not the ticket desk. It is a narrowing of All chats, reached from the AI
 * answers page and from a chip on the tab itself.
 *
 * Both come a page at a time (`fetchNextPage`): All chats is now the only list
 * that holds a chat with no ticket, so an older one has to be reachable.
 *
 * The server still answers the old `status` values (`open`, `mine`, `all`,
 * `resolved`, `flagged`, `ai`, `tickets`) so an old client keeps working; this
 * build asks for neither.
 */
export type InboxFilter = 'chats' | 'ai-guard';

export const conversationsKey = (filter: InboxFilter) =>
  ['conversations', { filter }] as const;

/** One page of the list. The server's own cap is 200. */
const CONVERSATIONS_PAGE = 100;

/**
 * The pages as one list. A refetch of pages already loaded can shift a row
 * across a page edge, and a duplicated id would be a duplicated React key.
 */
function flattenConversationPages(
  data: InfiniteData<Conversation[], string | undefined>,
): Conversation[] {
  const seen = new Map<string, Conversation>();
  for (const page of data.pages) {
    for (const c of page) seen.set(c.id, c);
  }
  return [...seen.values()];
}

export function useConversations(filter: InboxFilter, opts: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: conversationsKey(filter),
    enabled: opts.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<Conversation[]>('/conversations', {
        status: filter,
        limit: CONVERSATIONS_PAGE,
        before: pageParam,
      }),
    // The server pages by the newest message's time; a short page is the last.
    getNextPageParam: (last) =>
      last.length < CONVERSATIONS_PAGE ? undefined : last[last.length - 1]?.lastMessageAt,
    // The callers read one flat list, as they did before it had pages.
    select: flattenConversationPages,
    staleTime: 10_000,
    // Focus refetching is off globally (see lib/queryClient.ts); the inbox is
    // one of the few places where being stale is silently wrong, so it opts
    // back in. Sockets cover the connected case, but a socket that dropped
    // while the tab was hidden loses the events it missed and comes back with
    // no way to know it — and `refetchOnReconnect` never fires, because the
    // network itself never went down.
    refetchOnWindowFocus: true,
  });
}

export interface InboxCounts {
  open: number;
  mine: number;
  all: number;
  resolved: number;
  flagged: number;
  ai: number;
  /**
   * The AI guard lens: open and assigned threads marked by the guard. A chat
   * still marked resolved from before the ticket desk is outside it — the
   * server's list and this count both skip it — and a dealer's next message
   * brings it back in. The only one of these numbers this build reads — the AI
   * answers page and the chip on All chats. The rest describe the old tabs and
   * are left for an older admin build still pointed at the same server.
   */
  aiGuard: number;
  tickets: number;
}

// Shares the ['conversations'] prefix so an inbox invalidation refreshes the
// badges too — but it's one countDocuments round-trip, not four decorated lists.
export const conversationCountsKey = ['conversations', 'counts'] as const;

export function useConversationCounts() {
  return useQuery({
    queryKey: conversationCountsKey,
    queryFn: () => api.get<InboxCounts>('/conversations/counts'),
    staleTime: 10_000,
    // Opted back in for the same reason as the list above: the chip's number is
    // read as fact, and a missed socket event leaves it quietly wrong.
    refetchOnWindowFocus: true,
  });
}
