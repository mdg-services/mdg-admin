import type { Conversation, Message } from '@dk/shared';
import {
  type InfiniteData,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import { conversationKey } from '@/hooks/api/useConversation';
import { messagesKey } from '@/hooks/api/useMessages';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

interface TypingState {
  userId: string;
  userName: string;
  at: number;
}

export function useConversationSocket(conversationId: string | null) {
  const qc = useQueryClient();
  const [typing, setTyping] = React.useState<TypingState | null>(null);

  const applyReceipt = React.useCallback(
    (field: 'deliveredTo' | 'readBy', userId: string, ids: string[]) => {
      if (!conversationId || ids.length === 0) return;
      const idSet = new Set(ids);
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesKey(conversationId),
        (curr) => {
          if (!curr) return curr;
          return {
            ...curr,
            pages: curr.pages.map((page) =>
              page.map((m) => {
                if (!idSet.has(m.id)) return m;
                const arr = m[field] ?? [];
                if (arr.includes(userId)) return m;
                return { ...m, [field]: [...arr, userId] };
              }),
            ),
          };
        },
      );
    },
    [conversationId, qc],
  );

  React.useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('conversation:join', conversationId);

    const onMessage = (payload: {
      message: Message;
      conversation: Conversation;
    }) => {
      if (payload.message.conversationId !== conversationId) return;
      const key = messagesKey(conversationId);
      qc.setQueryData<InfiniteData<Message[]>>(key, (curr) => {
        if (!curr) {
          return { pages: [[payload.message]], pageParams: [undefined] };
        }
        // Skip if already present (avoids duplicating optimistic + server echo).
        const exists = curr.pages.some((p) =>
          p.some((m) => m.id === payload.message.id),
        );
        if (exists) return curr;
        // If this is our own message echoing back, strip any optimistic tmp-* placeholder
        // first so the bubble doesn't appear twice (and out of order until refresh).
        const authState = useAuthStore.getState();
        const currentUserId = authState.user?.id ?? authState.admin?.id;
        const isOwnEcho =
          !!currentUserId && payload.message.senderId === currentUserId;
        const pages = isOwnEcho
          ? curr.pages.map((p) => p.filter((m) => !m.id.startsWith('tmp-')))
          : curr.pages.slice();
        const last = pages[pages.length - 1] ?? [];
        pages[pages.length - 1] = [...last, payload.message];
        return { ...curr, pages };
      });
      qc.setQueryData(conversationKey(conversationId), payload.conversation);

      // The conversation is open in the inbox, so the other party's message is
      // read on arrival.
      const authState = useAuthStore.getState();
      const currentUserId = authState.user?.id ?? authState.admin?.id;
      if (currentUserId && payload.message.senderId !== currentUserId) {
        socket.emit('read', {
          conversationId,
          messageIds: [payload.message.id],
        });
      }
    };

    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      userName: string;
    }) => {
      if (payload.conversationId !== conversationId) return;
      setTyping({
        userId: payload.userId,
        userName: payload.userName,
        at: Date.now(),
      });
    };

    const onDelivered = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
    };

    const onRead = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
      applyReceipt('readBy', payload.userId, payload.messageIds);
    };

    socket.on('message:new', onMessage);
    socket.on('typing', onTyping);
    socket.on('delivered', onDelivered);
    socket.on('read', onRead);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('typing', onTyping);
      socket.off('delivered', onDelivered);
      socket.off('read', onRead);
      socket.emit('conversation:leave', conversationId);
    };
  }, [conversationId, qc, applyReceipt]);

  // Auto-clear typing indicator after 3s.
  React.useEffect(() => {
    if (!typing) return;
    const t = window.setTimeout(() => setTyping(null), 3000);
    return () => window.clearTimeout(t);
  }, [typing]);

  const markRead = React.useCallback(
    (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) return;
      const socket = getSocket();
      socket?.emit('read', { conversationId, messageIds });
    },
    [conversationId],
  );

  return { typing, markRead };
}
