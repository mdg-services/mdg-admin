import type { Conversation, Message } from '@dk/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

export function useInboxSocket() {
  const qc = useQueryClient();

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

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
    };
  }, [qc]);
}
