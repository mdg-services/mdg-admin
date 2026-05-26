import type { Conversation } from '@dk/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type InboxFilter = 'open' | 'assigned' | 'mine' | 'resolved';

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
