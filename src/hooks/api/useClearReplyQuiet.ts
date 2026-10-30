import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

import { conversationKey } from './useConversation';

/**
 * "Let AI answer" on a thread: end the AI's quiet now, instead of waiting for it
 * to run out. The server hands back the conversation with the quiet cleared, and
 * that replaces the cached one, so the line above the composer goes at once and
 * not on the next refetch. The inbox rows are refreshed as well.
 */
export function useClearReplyQuiet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.del<Conversation>(`/conversations/${conversationId}/quiet`),
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
