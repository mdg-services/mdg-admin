import type { Attachment, Message } from '@dk/shared';
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

import { messagesKey } from './useMessages';

interface SendMessageVars {
  conversationId: string;
  body?: string;
  attachments?: Attachment[];
}

export function useSendMessage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const admin = useAuthStore((s) => s.admin);

  return useMutation({
    mutationFn: async (vars: SendMessageVars) => {
      const payload: Record<string, unknown> = {};
      if (vars.body && vars.body.trim().length > 0) payload.body = vars.body;
      if (vars.attachments && vars.attachments.length > 0) {
        payload.attachments = vars.attachments;
      }
      return api.post<Message>(
        `/conversations/${vars.conversationId}/messages`,
        payload,
      );
    },
    onMutate: async (vars) => {
      const key = messagesKey(vars.conversationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InfiniteData<Message[]>>(key);

      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        conversationId: vars.conversationId,
        senderId: user?.id ?? admin?.id ?? 'me',
        senderRole: 'admin',
        senderName: user?.name ?? admin?.name ?? 'You',
        body: vars.body ?? '',
        attachments: vars.attachments ?? [],
        readBy: [],
        createdAt: new Date().toISOString(),
      };

      qc.setQueryData<InfiniteData<Message[]>>(key, (curr) => {
        if (!curr) {
          return { pages: [[optimistic]], pageParams: [undefined] };
        }
        const pages = curr.pages.slice();
        const last = pages[pages.length - 1] ?? [];
        pages[pages.length - 1] = [...last, optimistic];
        return { ...curr, pages };
      });

      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(messagesKey(vars.conversationId), ctx.previous);
      }
    },
    onSuccess: (saved, vars, ctx) => {
      const key = messagesKey(vars.conversationId);
      qc.setQueryData<InfiniteData<Message[]>>(key, (curr) => {
        if (!curr) return curr;
        // If the socket echo already inserted the real message, just drop the temp.
        const alreadyHasReal = curr.pages.some((p) =>
          p.some((m) => m.id === saved.id),
        );
        if (alreadyHasReal) {
          return {
            ...curr,
            pages: curr.pages.map((p) =>
              p.filter((m) => m.id !== ctx?.optimisticId),
            ),
          };
        }
        return {
          ...curr,
          pages: curr.pages.map((p) =>
            p.map((m) => (m.id === ctx?.optimisticId ? saved : m)),
          ),
        };
      });
    },
  });
}
