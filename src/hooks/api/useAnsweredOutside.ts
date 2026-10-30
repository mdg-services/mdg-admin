import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AnsweredOutsideBody, Conversation } from '@dk/shared';

import { conversationKey } from './useConversation';
import { ticketsRoot } from './useTickets';

/**
 * "Answered outside the app": the admin rang the dealer, or wrote on WhatsApp.
 * The chat stops counting as waiting, the AI keeps its after-reply quiet as it
 * does for a typed reply, and the open ticket (if any) counts as updated. The
 * note goes to the audit trail only; the dealer sees nothing.
 *
 * The server hands back the conversation, which replaces the cached one, so the
 * "AI quiet until …" line shows at once. The tickets are read again too: a
 * ticket's Waiting and Late come from the same waiting clock this clears. So are
 * the alerts, whose "waiting for a reply" one reads that clock as well.
 */
export function useAnsweredOutside() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, ...body }: AnsweredOutsideBody & { conversationId: string }) =>
      api.post<Conversation>(`/conversations/${conversationId}/answered-outside`, body),
    onSuccess: (conv) => {
      qc.setQueryData(conversationKey(conv.id), conv);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ticketsRoot });
      void qc.invalidateQueries({ queryKey: ['overview'] });
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
  });
}
