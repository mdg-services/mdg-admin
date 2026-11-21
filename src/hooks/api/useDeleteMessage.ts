import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Message } from '@dk/shared';

import { messagesKey } from './useMessages';

interface DeleteMessageVars {
  conversationId: string;
  messageId: string;
}

/** Drop one message from the cached pages. Unchanged data is returned as is. */
export function withoutMessage(
  data: InfiniteData<Message[]> | undefined,
  messageId: string,
): InfiniteData<Message[]> | undefined {
  if (!data) return data;
  if (!data.pages.some((p) => p.some((m) => m.id === messageId))) return data;
  return {
    ...data,
    pages: data.pages.map((page) => page.filter((m) => m.id !== messageId)),
  };
}

/**
 * Delete a message for everyone (super admins only; the server refuses anyone
 * else). Not optimistic: the bubble goes when the server says it is gone, so a
 * refusal never leaves a hole that comes back on reload. The socket echo
 * (`message:deleted`) does the same drop and is harmless after this one.
 */
export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: DeleteMessageVars) =>
      api.del<{ conversationId: string; messageId: string }>(
        `/conversations/${vars.conversationId}/messages/${vars.messageId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesKey(vars.conversationId),
        (curr) => withoutMessage(curr, vars.messageId),
      );
    },
  });
}
