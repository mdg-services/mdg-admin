import type { Conversation } from '@dk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { conversationKey } from './useConversation';

export function useReopenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.post<Conversation>(`/conversations/${conversationId}/reopen`, {}),
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
