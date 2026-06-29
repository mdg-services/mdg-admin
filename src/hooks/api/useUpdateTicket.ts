import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Conversation } from '@dk/shared';
import type { UpdateTicketInput } from '@dk/shared/schemas';


import { conversationKey } from './useConversation';

interface UpdateTicketVars extends UpdateTicketInput {
  conversationId: string;
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, ...body }: UpdateTicketVars) =>
      api.patch<Conversation>(`/conversations/${conversationId}/ticket`, body),
    onMutate: async (vars) => {
      const key = conversationKey(vars.conversationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Conversation>(key);
      if (previous) {
        qc.setQueryData<Conversation>(key, {
          ...previous,
          ...(vars.priority !== undefined ? { priority: vars.priority } : {}),
          ...(vars.category !== undefined ? { category: vars.category } : {}),
        });
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(conversationKey(vars.conversationId), ctx.previous);
      }
    },
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
