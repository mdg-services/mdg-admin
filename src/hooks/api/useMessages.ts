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
  });
}
