import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Message, MessageReaction } from '@dk/shared';

import { messagesKey } from './useMessages';

interface ReactToMessageVars {
  conversationId: string;
  messageId: string;
  emoji: string;
  /** True to clear the caller's reaction (they tapped their current emoji again). */
  remove: boolean;
}

/** Immutably rewrite one message's reactions across the cached page map. */
function withReactions(
  data: InfiniteData<Message[]> | undefined,
  messageId: string,
  update: (reactions: MessageReaction[]) => MessageReaction[],
): InfiniteData<Message[]> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.map((m) =>
        m.id === messageId ? { ...m, reactions: update(m.reactions ?? []) } : m,
      ),
    ),
  };
}

/**
 * Set or clear the caller's reaction on a message, optimistically. The server
 * keeps at most one reaction per user, so "set" replaces any previous emoji.
 */
export function useReactToMessage() {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const admin = useAuthStore((s) => s.admin);

  return useMutation({
    mutationFn: async (vars: ReactToMessageVars) => {
      const path = `/conversations/${vars.conversationId}/messages/${vars.messageId}/reactions`;
      return vars.remove
        ? api.del<Message>(path)
        : api.post<Message>(path, { emoji: vars.emoji });
    },
    onMutate: async (vars) => {
      const key = messagesKey(vars.conversationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InfiniteData<Message[]>>(key);
      const meId = user?.id ?? admin?.id ?? '';
      const meName = user?.name ?? admin?.name;
      qc.setQueryData<InfiniteData<Message[]>>(key, (curr) =>
        withReactions(curr, vars.messageId, (reactions) => {
          const rest = reactions.filter((r) => r.userId !== meId);
          if (vars.remove) return rest;
          return [
            ...rest,
            {
              userId: meId,
              ...(meName ? { userName: meName } : {}),
              emoji: vars.emoji,
              createdAt: new Date().toISOString(),
            },
          ];
        }),
      );
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(messagesKey(vars.conversationId), ctx.previous);
      }
      toast.error('Could not update reaction');
    },
    onSuccess: (saved, vars) => {
      // Adopt the server's authoritative set (the socket echo is identical).
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesKey(vars.conversationId),
        (curr) => withReactions(curr, vars.messageId, () => saved.reactions ?? []),
      );
    },
  });
}
