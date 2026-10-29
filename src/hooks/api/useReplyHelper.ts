import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import {
  mergeThread,
  targetKey,
  targetQuery,
  withEarlier,
  withTurn,
} from '@/lib/replyHelper';
import type {
  ReplyHelperAskInput,
  ReplyHelperAskResult,
  ReplyHelperPickLoginInput,
  ReplyHelperTarget,
  ReplyHelperThread,
} from '@dk/shared';

/**
 * The Reply helper's calls (ADR 0025): the thread beside an open conversation,
 * asking for drafts, and picking which dealer login a shared WhatsApp number is.
 *
 * ITS OWN KEY ROOT, `['reply-helper', …]`, and deliberately NOT under
 * `['whatsapp', …]`. The WhatsApp inbox's cache updates use positional
 * predicates over that root and read `queryKey[3]` as the person; a helper entry
 * filed there would be read as a chat and patched as one.
 *
 * ONE ENTRY PER OPEN CONVERSATION (`targetKey`). The client names only the
 * conversation; the server works out the person and so the thread. Two chats
 * that turn out to be one person share a server thread but keep two cache
 * entries here, which is the safe direction: a stale view of the other one is
 * refreshed on its next open, and a view of the wrong person is impossible.
 *
 * NOTHING HERE SENDS ANYTHING. "Ask" produces drafts for a person to read; the
 * routes behind these hooks never write to the dealer's thread.
 */

export const replyHelperKey = (target: ReplyHelperTarget) =>
  ['reply-helper', targetKey(target)] as const;

/** Mutations asking this conversation's helper — one at a time per person on the server. */
const askKey = (target: ReplyHelperTarget) =>
  ['reply-helper', 'ask', targetKey(target)] as const;

/**
 * The newest turns and the conversation's context.
 *
 * Read as soon as the strip mounts, even while it is collapsed: the collapsed
 * row names who the helper is writing for and the channel, and an admin must be
 * able to see that without opening anything. Cheap — no model is involved.
 *
 * A refetch is laid over what is held (`mergeThread`), so turns the admin
 * loaded with "Load earlier" survive it. Refetch on focus is switched on for
 * this one: another admin may have asked something while this tab was in the
 * background, and the 24-hour window notice goes stale with the clock.
 */
export function useReplyHelperThread(target: ReplyHelperTarget) {
  const qc = useQueryClient();
  const key = replyHelperKey(target);
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const fresh = await api.get<ReplyHelperThread>(
        '/admin/reply-helper/thread',
        targetQuery(target),
        signal,
      );
      return mergeThread(qc.getQueryData<ReplyHelperThread>(key), fresh);
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Ask for drafts. Takes 10–30 seconds (one model call, maybe one retry), so the
 * panel shows a "writing" state; the admin API client never times a mutation
 * out, and this hook must not add one — the answer is paid for either way.
 *
 * THE CACHE IS UPDATED HERE, in the mutation's own `onSuccess`, and not in a
 * callback passed to `mutate()`. Those callbacks are dropped when the component
 * that called `mutate` has unmounted, and the admin is entitled to answer
 * another chat while this one writes: the finished turn then waits in the cache
 * for them to come back, rather than being thrown away after being paid for.
 */
export function useAskReplyHelper(target: ReplyHelperTarget) {
  const qc = useQueryClient();
  const key = replyHelperKey(target);
  return useMutation({
    mutationKey: askKey(target),
    mutationFn: (instruction: string) => {
      const body: ReplyHelperAskInput = { target, instruction };
      return api.post<ReplyHelperAskResult>('/admin/reply-helper/turns', body);
    },
    onSuccess: ({ turn, context }) => {
      qc.setQueryData<ReplyHelperThread>(key, (prev) => withTurn(prev, turn, context));
    },
  });
}

/**
 * The instruction of a request for THIS conversation that is still running, or
 * null. Read from the mutation cache, not from the component that sent it, so
 * the "writing" state is still there after the admin collapses the strip, opens
 * the phone sheet, or goes to another chat and comes back within the half minute.
 */
export function usePendingReplyHelperAsk(target: ReplyHelperTarget): string | null {
  const pending = useMutationState({
    filters: { mutationKey: askKey(target), status: 'pending' },
    select: (m) => m.state.variables as string | undefined,
  });
  return pending.length > 0 ? (pending[pending.length - 1] ?? null) : null;
}

/**
 * Older turns, in front of what is held. `before` is the oldest held turn's id.
 * The result is laid in by the mutation itself for the reason `useAskReplyHelper`
 * gives.
 */
export function useLoadEarlierReplyHelper(target: ReplyHelperTarget) {
  const qc = useQueryClient();
  const key = replyHelperKey(target);
  return useMutation({
    mutationKey: ['reply-helper', 'earlier', targetKey(target)],
    mutationFn: (before: string) =>
      api.get<ReplyHelperThread>('/admin/reply-helper/thread', { ...targetQuery(target), before }),
    onSuccess: (earlier) => {
      qc.setQueryData<ReplyHelperThread>(key, (prev) => (prev ? withEarlier(prev, earlier) : earlier));
    },
  });
}

/**
 * Say which dealer login a shared WhatsApp number belongs to (`userId`), or take
 * the pick back (`null`). The answer is the thread the number now belongs to, and
 * it REPLACES what is held rather than merging into it: the held turns were
 * about the old thread, and a pick moves the chat to a different one.
 */
export function usePickReplyHelperLogin(target: ReplyHelperTarget) {
  const qc = useQueryClient();
  const key = replyHelperKey(target);
  return useMutation({
    mutationKey: ['reply-helper', 'login', targetKey(target)],
    mutationFn: (input: ReplyHelperPickLoginInput) =>
      api.post<ReplyHelperThread>('/admin/reply-helper/login', input),
    onSuccess: (thread) => {
      qc.setQueryData<ReplyHelperThread>(key, thread);
    },
  });
}
