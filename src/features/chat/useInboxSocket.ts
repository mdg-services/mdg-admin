import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { chatAskKeys } from '@/hooks/api/useChatAsks';
import { movesOpenRequests } from '@/lib/chatAsk';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { Conversation, Message } from '@dk/shared';

/**
 * How long after a dealer's answer arrives the open-requests list is read again.
 * The server stores the message first and files the photo against its request a
 * moment later, so the first read can still say "waiting for the dealer".
 */
const ASK_FILING_SETTLE_MS = 4000;

export function useInboxSocket() {
  const qc = useQueryClient();

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const settleTimers = new Set<number>();

    const onUpdated = (_payload: { conversation: Conversation }) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    // Ack delivery (✓✓) for any message arriving while the inbox is open, even
    // when the specific conversation isn't selected, so dealers' ticks advance.
    const onMessage = (payload: { message: Message; conversation: Conversation }) => {
      const { message } = payload;
      const authState = useAuthStore.getState();
      const currentUserId = authState.user?.id ?? authState.admin?.id;
      if (!currentUserId || message.senderId === currentUserId) return;
      if (message.id.startsWith('tmp-')) return;
      // A message that asks the dealer for something, or answers a request, moves
      // the Open requests card, the "Answer to" chip and the notice's status — and
      // so does another admin's "Received" or "Sent back" under a dealer's photo,
      // which carries neither field (see `movesOpenRequests`). Read the list now,
      // and once more after the server has had time to file the photo (see
      // ASK_FILING_SETTLE_MS).
      if (movesOpenRequests(message)) {
        void qc.invalidateQueries({ queryKey: chatAskKeys.all });
        const timer = window.setTimeout(() => {
          settleTimers.delete(timer);
          void qc.invalidateQueries({ queryKey: chatAskKeys.all });
        }, ASK_FILING_SETTLE_MS);
        settleTimers.add(timer);
      }
      socket.emit('delivered', {
        conversationId: message.conversationId,
        messageIds: [message.id],
      });
    };

    socket.on('conversation:updated', onUpdated);
    socket.on('message:new', onMessage);
    return () => {
      socket.off('conversation:updated', onUpdated);
      socket.off('message:new', onMessage);
      settleTimers.forEach((t) => window.clearTimeout(t));
      settleTimers.clear();
    };
  }, [qc]);
}
