import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

import { conversationKey } from './useConversation';

/**
 * Admin-initiated conversation start: open (or reuse) a member's private thread
 * so support can message a dealer who never wrote in first. Returns the
 * conversation so the caller can select it in the inbox.
 */
export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<Conversation>('/conversations', { userId }),
    onSuccess: (convo) => {
      qc.setQueryData(conversationKey(convo.id), convo);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
