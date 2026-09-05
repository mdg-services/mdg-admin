import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

export const conversationKey = (id: string | null | undefined) =>
  ['conversation', id] as const;

export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: conversationKey(id),
    queryFn: () => api.get<Conversation>(`/conversations/${id}`),
    enabled: !!id,
    // Opted back in against the global default (lib/queryClient.ts) for the
    // same reason as the messages query: this supplies the open thread's header
    // and status, and the socket layer has no reconnect re-sync to catch what
    // was missed while the tab was hidden.
    refetchOnWindowFocus: true,
  });
}
