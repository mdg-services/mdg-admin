import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ConversationMediaItem, ConversationMediaTab } from '@dk/shared';

const PAGE_SIZE = 30;
const STRIP_SIZE = 6;

export const conversationMediaKey = (
  conversationId: string | null | undefined,
  tab: ConversationMediaTab | 'strip',
) => ['conversation', conversationId, 'media', tab] as const;

/**
 * One tab of the per-conversation media/docs/links gallery. Cursor convention
 * matches messages: `before` = the last (oldest) item's createdAt, and a full
 * page means there may be more.
 */
export function useConversationMedia(
  conversationId: string | null | undefined,
  tab: ConversationMediaTab,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: conversationMediaKey(conversationId, tab),
    enabled: !!conversationId && enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      api.get<ConversationMediaItem[]>(`/conversations/${conversationId}/media`, {
        tab,
        before: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      // The server limits MESSAGES per page but the wire carries flattened
      // items (a message can hold several images), so "page full" must count
      // distinct messages — raw item count fakes a next page otherwise.
      if (!lastPage) return undefined;
      const messageCount = new Set(lastPage.map((i) => i.messageId)).size;
      if (messageCount < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.createdAt;
    },
  });
}

/** The ~6 most recent images, for the details-panel thumbnail strip. */
export function useConversationMediaStrip(
  conversationId: string | null | undefined,
) {
  return useQuery({
    queryKey: conversationMediaKey(conversationId, 'strip'),
    enabled: !!conversationId,
    queryFn: () =>
      api.get<ConversationMediaItem[]>(`/conversations/${conversationId}/media`, {
        tab: 'media',
        limit: STRIP_SIZE,
      }),
  });
}
