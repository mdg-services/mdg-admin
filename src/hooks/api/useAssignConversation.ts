import type { Conversation } from '@dk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { conversationKey } from './useConversation';

interface AssignVars {
  conversationId: string;
  adminId?: string;
}

export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: AssignVars) =>
      api.post<Conversation>(
        `/conversations/${vars.conversationId}/assign`,
        vars.adminId ? { adminId: vars.adminId } : {},
      ),
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
