import type { Conversation } from '@dk/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const conversationKey = (id: string | null | undefined) =>
  ['conversation', id] as const;

export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: conversationKey(id),
    queryFn: () => api.get<Conversation>(`/conversations/${id}`),
    enabled: !!id,
  });
}
