import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api, type QueryParams } from '@/lib/api';
import type {
  AiTurn,
  AiTurnOutcome,
  Conversation,
  DealerFirstLineMode,
  Paginated,
} from '@dk/shared';
import type { AiTurnListQuery, AiTurnReviewInput } from '@dk/shared/schemas';

import { conversationKey } from './useConversation';

/**
 * The admin's window onto the AI first line: the turn log, the verdicts, the
 * two switches.
 *
 * TWO DIFFERENT GATES, ON PURPOSE. Reading turns and passing judgement on them
 * is ADMIN work — the people who answer the tickets are the people who can tell
 * whether an answer was any good, and gating that behind super-admin would mean
 * the verdicts came from whoever had the rights rather than whoever had the
 * context. The SWITCHES are super-admin, and every hook that touches one is
 * `enabled` on `useIsSuperAdmin()` as well as guarded by the endpoint's own
 * `requireSuperAdmin`, so a plain admin who lands on the URL never sends the
 * request at all.
 */

/* ─────────────────────────────── Response shapes ─────────────────────────── */

/**
 * `GET /ai-turns/counts` — one count per outcome, plus the two figures the safety
 * case is actually made of.
 *
 * Declared here rather than in `@dk/shared` for the reason `useAssist.ts` states
 * for `AssistKbStatus`: it mirrors a literal the route builds inline and has no
 * home in the package yet. If it is ever hoisted there, delete this and import it.
 */
export type AiTurnCounts = Record<AiTurnOutcome, number> & {
  /** What nobody has looked at yet. This is the nav badge. */
  unreviewed: number;
  /** How many turns an admin has called WRONG in the last 24h. */
  wrongIn24h: number;
  /** How many of those trip the breaker and switch the first line off. */
  breakerAt: number;
  /**
   * The last day's turns by writer disposition — `prose`, `fallback`, `skipped`,
   * `off`.
   *
   * A LOOSE RECORD ON PURPOSE. It is a Mongo `$group` and the server may one day
   * emit a fifth disposition; a `Record<AiWriterDisposition, number>` here would
   * promise this build knows every key, which is exactly the promise
   * `aiWriterSplit` is written not to need.
   */
  writerIn24h: Record<string, number>;
  /**
   * The same, split by the language the dealer wrote in.
   *
   * Watched SPLIT and not only in aggregate, for the reason the turn row states:
   * a systematically high rejection rate on Hindi would quietly mean Hindi
   * dealers get templates while English dealers get prose, and the aggregate
   * would look fine.
   */
  writerByLangIn24h: Record<string, Record<string, number>>;
  /** Every answered turn in the same window — the prose rate's denominator. */
  answeredIn24h: number;
  /** Answers the dealer wrote straight back after. Changes no behaviour. */
  quickFollowUpIn24h: number;
};

/** `GET /super-admin/ai-first-line` — where both switches stand. */
export interface AiFirstLineSwitchView {
  enabled: boolean;
  /**
   * THE MIDDLE NOTCH: Off / Templates only / Full.
   *
   * `enabled: true, writer: false` is exactly the product that was live before
   * this version — every answer a hand-written sentence. It exists because the
   * likeliest thing an admin wants to stop at nine at night is the PROSE, not
   * the service, and turning the whole first line off to stop a clumsy sentence
   * throws away a working product.
   */
  writer: boolean;
  updatedAt: string | null;
  updatedByAdminId: string | null;
  updatedByName: string | null;
  /**
   * The ENV flag. Reported beside the database switch because they are not
   * interchangeable and the difference is invisible from a screen: with this
   * false, turning the switch on changes nothing at all until a deploy, and
   * somebody would press it and wait.
   */
  envEnabled: boolean;
  /** The same trap one notch down: with this false, the writer switch does nothing. */
  envWriterEnabled: boolean;
  /** The switch is cached per process; the screen says so rather than implying instant. */
  takesEffectWithinSeconds: number;
}

/** One row of `GET /super-admin/ai-first-line/dealers` — every live outlet. */
export interface AiFirstLineDealerRow {
  dealerId: string;
  dealerCode: string | null;
  mode: DealerFirstLineMode;
  /** When the mode was last changed, from the audit log. Null: never changed. */
  changedAt: string | null;
  changedByEmail: string | null;
}

/* ─────────────────────────────── Query keys ──────────────────────────────── */

/** Root key: one invalidation refreshes the whole surface. */
export const aiTurnsKey = ['ai-turns'] as const;

export const aiTurnsListRootKey = ['ai-turns', 'list'] as const;

export const aiTurnsListKey = (params: AiTurnListQuery) =>
  ['ai-turns', 'list', aiTurnParams(params)] as const;

export const aiTurnCountsKey = ['ai-turns', 'counts'] as const;

export const aiFirstLineSwitchKey = ['ai-first-line', 'switch'] as const;

export const aiFirstLineDealersKey = ['ai-first-line', 'dealers'] as const;

/** Everything the machine did on ONE thread — the strip above the composer. */
export const aiTurnsForConversationKey = (conversationId: string | null) =>
  ['ai-turns', 'conversation', conversationId] as const;

/**
 * The list query as it goes on the wire and, because the key factory runs the
 * same function, as it is cached.
 *
 * `reviewed` is the one filter that must survive being `false`: `?reviewed=false`
 * IS the review queue, and dropping a falsy value here — the obvious way to
 * write this — would turn "show me what nobody has checked" into "show me
 * everything". The server refuses `z.coerce.boolean()` for the same reason.
 */
export function aiTurnParams(params: AiTurnListQuery): QueryParams {
  return {
    page: params.page,
    pageSize: params.pageSize,
    dealerId: params.dealerId,
    conversationId: params.conversationId,
    outcome: params.outcome,
    reason: params.reason,
    intent: params.intent,
    verdict: params.verdict,
    // `?writer=fallback` is "every reply the fence refused" — the query the
    // first fortnight is spent inside, and the one that answers which fence is
    // actually costing us answers. It has to be here as well as in the key
    // factory: a filter the key remembers and the request never sends is a
    // screen that caches four different lists under four keys and shows the
    // same rows in all of them.
    writer: params.writer,
    reviewed: params.reviewed === undefined ? undefined : params.reviewed,
    from: params.from,
    to: params.to,
  };
}

/* ─────────────────────────────── Queries ─────────────────────────────────── */

/**
 * One page of the turn log.
 *
 * `placeholderData` keeps the previous page on screen while the next loads, so
 * paging does not blink through a skeleton — the same choice the assistant
 * console makes for the same reason.
 */
export function useAiTurnsQuery(params: AiTurnListQuery) {
  return useQuery({
    queryKey: aiTurnsListKey(params),
    queryFn: () => api.get<Paginated<AiTurn>>('/ai-turns', aiTurnParams(params)),
    placeholderData: (prev) => prev,
  });
}

/**
 * The counts behind the nav badge and the page's header tiles — ONE cache entry
 * shared by both, on purpose.
 *
 * The badge is the whole nudge to open the page at all, so it has to go down the
 * moment a turn is judged. Because the nav shell and the page read the same key,
 * `useReviewAiTurn` invalidating it fixes both; two hooks with two keys would
 * leave the badge insisting there are four unreviewed turns while the reader is
 * looking at an empty list.
 *
 * Thirty seconds, not zero: the shell mounts this once per session and a
 * refetch-on-every-focus for a number in the sidebar is not worth the request.
 */
export function useAiTurnCountsQuery() {
  return useQuery({
    queryKey: aiTurnCountsKey,
    queryFn: () => api.get<AiTurnCounts>('/ai-turns/counts'),
    staleTime: 30_000,
  });
}

/**
 * Every turn on ONE conversation, newest first — what the strip above the
 * composer reads.
 *
 * `pageSize: 5` rather than 1: the strip shows the latest turn, but a thread
 * where the machine answered and then the dealer disputed it has TWO turns
 * seconds apart, and an admin opening that thread needs to see the answer that
 * was questioned, not only the questioning. Five is a whole conversation's worth
 * — the `repeat` handoff fires long before a thread has more.
 *
 * IT FIRES ON EVERY THREAD, including the great majority the machine never
 * touched, and that is a deliberate trade rather than an oversight. The obvious
 * saving is to skip the request unless `conversation.ai` exists — but a
 * SUPPRESSED turn never writes that block, so gating on it would hide exactly
 * the case the turn log exists for: "why does the first line never speak in the
 * manager's group thread?" would have no answer on the one screen where it is
 * asked. The cost of keeping it is one indexed lookup of at most five rows, on a
 * screen that already fetches the conversation, the messages, the dealer's
 * records and the service list; `staleTime` and the per-conversation key mean
 * re-opening a thread does not repeat it.
 */
export function useConversationAiTurnsQuery(conversationId: string | null) {
  return useQuery({
    queryKey: aiTurnsForConversationKey(conversationId),
    queryFn: () =>
      api.get<Paginated<AiTurn>>('/ai-turns', {
        conversationId: conversationId ?? undefined,
        page: 1,
        pageSize: 5,
      }),
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}

export function useAiFirstLineSwitchQuery() {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: aiFirstLineSwitchKey,
    queryFn: () => api.get<AiFirstLineSwitchView>('/super-admin/ai-first-line'),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });
}

export function useAiFirstLineDealersQuery(enabled = true) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: aiFirstLineDealersKey,
    queryFn: () =>
      api.get<{ items: AiFirstLineDealerRow[] }>(
        '/super-admin/ai-first-line/dealers',
      ),
    enabled: isSuperAdmin && enabled,
    staleTime: 30_000,
  });
}

/* ─────────────────────────────── Mutations ───────────────────────────────── */

export interface ReviewAiTurnVars {
  id: string;
  input: AiTurnReviewInput;
}

/**
 * One admin's judgement on one turn.
 *
 * The row is patched in place from the server's answer AND the lists are
 * invalidated, because the default filter is `reviewed=false` — so judging a
 * turn removes it from the list you are looking at. Patching alone would leave
 * a reviewed row sitting in the unreviewed queue until the next refetch, which
 * is exactly how two people end up reviewing the same turn.
 *
 * The counts go too: the nav badge is the unreviewed figure, and a badge that
 * does not go down when you clear one is a badge people stop believing.
 */
export function useReviewAiTurn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: ReviewAiTurnVars) =>
      api.post<AiTurn>(`/ai-turns/${id}/review`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aiTurnsListRootKey });
      void qc.invalidateQueries({ queryKey: aiTurnCountsKey });
    },
  });
}

/** The global kill switch. Super-admin only. */
export function useSetAiFirstLineSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<{ enabled: boolean; envEnabled: boolean }>(
        '/super-admin/ai-first-line',
        { enabled },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aiFirstLineSwitchKey });
    },
  });
}

/**
 * The middle notch on the same switch — stop the PROSE and keep the service.
 *
 * A SEPARATE HOOK AND A SEPARATE REQUEST, even though the endpoint takes both
 * fields, because they are different decisions with different blast radii and
 * the backend audits them under two different actions for exactly that reason.
 * Sending `{enabled, writer}` together from one control would collapse "somebody
 * stopped the prose" and "somebody stopped the first line" into one audit row
 * nobody can read in an incident.
 *
 * The counts go too: turning the writer off changes the prose rate the page
 * leads with, and a headline figure that disagrees with the switch beneath it is
 * a screen nobody trusts again.
 */
export function useSetAiFirstLineWriterSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (writer: boolean) =>
      api.put<{ writer: boolean; envWriterEnabled: boolean }>(
        '/super-admin/ai-first-line',
        { writer },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aiFirstLineSwitchKey });
      void qc.invalidateQueries({ queryKey: aiTurnCountsKey });
    },
  });
}

/**
 * Clear the AI-guard mark on one thread. SUPER-ADMIN ONLY.
 *
 * THE ONLY THING THAT CLEARS IT, and that is the whole design of the field.
 * `Conversation.flagged` is cleared by pickup, by any admin reply, by resolve,
 * by reopen and by a records post — right for an operational alarm, and
 * catastrophic for a security observation, because it would mean an admin
 * ANSWERING THE DEALER silently erases the record that somebody tried to plant a
 * figure in MDG's mouth. So there is no optimistic patch here either: the
 * server's decorated conversation is what lands, and the whole `['conversations']`
 * prefix is invalidated so the guard lens and its badge both drop the row.
 */
export function useClearAiGuard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.post<Conversation | null>(
        `/conversations/${conversationId}/ai-guard/clear`,
        {},
      ),
    onSuccess: (conv) => {
      if (conv) qc.setQueryData(conversationKey(conv.id), conv);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export interface SetDealerFirstLineModeVars {
  dealerId: string;
  mode: DealerFirstLineMode;
}

/**
 * Enrol one outlet, or move it along.
 *
 * `OFF` → `SHADOW` → `ON` is the intended path and the whole reason `SHADOW`
 * exists: a week of it produces a reviewable record of exactly what the machine
 * would have said to real dealers about real days, at real cost, with no dealer
 * ever seeing it.
 */
export function useSetDealerFirstLineMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, mode }: SetDealerFirstLineModeVars) =>
      api.put<{ dealerId: string; firstLineMode: DealerFirstLineMode }>(
        `/super-admin/ai-first-line/dealers/${dealerId}`,
        { mode },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aiFirstLineDealersKey });
    },
  });
}
