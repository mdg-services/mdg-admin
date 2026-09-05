import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Message } from '@dk/shared';

export const messagesKey = (conversationId: string | null | undefined) =>
  ['messages', conversationId] as const;

const PAGE_SIZE = 30;

export function useMessages(conversationId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const messages = await api.get<Message[]>(
        `/conversations/${conversationId}/messages`,
        { limit: PAGE_SIZE, before: pageParam },
      );
      return messages;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      const oldest = lastPage[0];
      return oldest?.createdAt;
    },
    // Focus refetching is off globally (see lib/queryClient.ts), but the open
    // thread must opt back in. useConversationSocket only ever applies LIVE
    // events — it has no `connect` handler that re-reads the thread — so a
    // socket that dropped and silently reconnected while the tab was hidden
    // loses whatever the dealer sent in the gap. Without this, the list would
    // update and the message pane the admin is actually reading would not.
    refetchOnWindowFocus: true,
    // Bound what that refetch costs. React Query re-fetches EVERY loaded page on
    // a focus refetch, so an admin who has scrolled ten pages back through a busy
    // thread would pay ten round trips on every tab-back — on a box where a cold
    // request can take seconds. Three pages (90 messages) is far more than the
    // unread gap a focus refetch is meant to close; older pages stay in cache and
    // are re-fetched only if the operator scrolls to them again.
    maxPages: 3,
  });
}
