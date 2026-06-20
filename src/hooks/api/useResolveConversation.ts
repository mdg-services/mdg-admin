import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';

import { conversationKey } from './useConversation';

export interface ResolveConversationVars {
  conversationId: string;
  serviceId: string;
  serviceName?: string;
  notes: string;
}

export function useResolveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, ...body }: ResolveConversationVars) =>
      api.post<Conversation>(`/conversations/${conversationId}/resolve`, body),
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['serviceLogs', conv.dealerId] });
    },
  });
}
