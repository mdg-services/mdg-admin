import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api, type QueryParams } from '@/lib/api';
import type {
  AssistBlockView,
  AssistSessionDetail,
  AssistSessionSummary,
  AssistUsageDayView,
  Paginated,
} from '@dk/shared';
import type {
  AssistSessionListQuery,
  CreateAssistBlockInput,
  UpdateAssistFollowupInput,
} from '@dk/shared/schemas';

/**
 * The super-admin side of the landing-page assistant (ADR 0009).
 *
 * Everything here reads a stranger's conversation with us — including, on the
 * sessions that captured one, their phone number. Every query is therefore
 * gated on `useIsSuperAdmin()` as well as by the endpoint's own
 * `requireSuperAdmin`: a plain admin who lands on the URL should not even send
 * the request, let alone have the answer sitting in their react-query cache.
 */

/* ─────────────────────────────── Response shapes ─────────────────────────── */

/**
 * The knowledge-base status the admin surface reads.
 *
 * Declared here rather than imported because the interface it mirrors —
 * `KbStatus` in `mdg-backend/src/assist/kb/loader.ts` — lives in the backend and
 * has no home in `@dk/shared` yet. If it is ever hoisted there, delete this and
 * import it; nothing else on this screen needs to change.
 */
export interface AssistKbStatus {
  loaded: boolean;
  version: string | null;
  count: number;
  loadedAt: string | null;
  error: string | null;
  source: 's3' | 'disk' | null;
}

/** `GET /super-admin/assist/kb` — the status plus the daily spend cap. */
export type AssistKbStatusView = AssistKbStatus & { budgetPaise: number };

/** `GET /super-admin/assist/usage` — a window of days plus today's position. */
export interface AssistUsageView {
  days: AssistUsageDayView[];
  todayPaise: number;
  budgetPaise: number;
}

/** `GET /super-admin/assist/blocks` — the whole block list, unpaginated. */
export interface AssistBlockListView {
  items: AssistBlockView[];
}

/* ─────────────────────────────── Query keys ──────────────────────────────── */

/**
 * Root key. Everything below hangs off it, so a single
 * `invalidateQueries({ queryKey: assistKey })` refreshes the whole screen.
 */
export const assistKey = ['assist'] as const;

export const assistSessionsRootKey = ['assist', 'sessions'] as const;

export const assistSessionsKey = (params: AssistSessionListQuery) =>
  ['assist', 'sessions', assistSessionParams(params)] as const;

export const assistSessionKey = (id: string | undefined) =>
  ['assist', 'session', id] as const;

export const assistBlocksKey = ['assist', 'blocks'] as const;

export const assistUsageKey = (days: number) => ['assist', 'usage', days] as const;

export const assistKbKey = ['assist', 'kb'] as const;

/**
 * The list query as it goes on the wire — and, because the key factory above
 * runs the same function, as it is cached.
 *
 * `flagged` and `hasLead` are sent only when they are ON, never as `false`.
 * "Off" and "absent" mean the same thing to this API — there is no such request
 * as "only the sessions that were NOT flagged" — so sending the word `false`
 * would be a filter the server has to have an opinion about for no benefit.
 * Keying on the same normalised object is the other half: it stops "off" and
 * "absent" from occupying two cache entries that hold identical data.
 */
export function assistSessionParams(params: AssistSessionListQuery): QueryParams {
  return {
    page: params.page,
    pageSize: params.pageSize,
    channel: params.channel,
    status: params.status,
    followupStatus: params.followupStatus,
    flagged: params.flagged ? true : undefined,
    hasLead: params.hasLead ? true : undefined,
    q: params.q,
    from: params.from,
    to: params.to,
  };
}

/* ─────────────────────────────── Queries ─────────────────────────────────── */

/**
 * One page of conversations. `placeholderData` keeps the previous page on
 * screen while the next one loads, so paging does not blink through a skeleton.
 */
export function useAssistSessionsQuery(params: AssistSessionListQuery) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: assistSessionsKey(params),
    queryFn: () =>
      api.get<Paginated<AssistSessionSummary>>(
        '/super-admin/assist/sessions',
        assistSessionParams(params),
      ),
    enabled: isSuperAdmin,
    placeholderData: (prev) => prev,
  });
}

/** One conversation opened up: transcript, recording, cost, trace. */
export function useAssistSessionQuery(id: string | undefined) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: assistSessionKey(id),
    queryFn: () =>
      api.get<AssistSessionDetail>(`/super-admin/assist/sessions/${id}`),
    enabled: isSuperAdmin && !!id,
  });
}

export function useAssistBlocksQuery() {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: assistBlocksKey,
    queryFn: () => api.get<AssistBlockListView>('/super-admin/assist/blocks'),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });
}

/**
 * Usage for the last `days` days.
 *
 * `staleTime: 0` on purpose: the meter on this tab is a statement about *today's*
 * spend against today's cap, and a cached answer from an hour ago is exactly the
 * thing that would let the budget quietly run out behind a reassuring bar.
 */
export function useAssistUsageQuery(days: number) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: assistUsageKey(days),
    queryFn: () => api.get<AssistUsageView>('/super-admin/assist/usage', { days }),
    enabled: isSuperAdmin,
    staleTime: 0,
    // Focus refetching is off globally (see lib/queryClient.ts), so `staleTime: 0`
    // alone would no longer refresh the meter on tab-back — which is the one
    // moment somebody is looking at it.
    refetchOnWindowFocus: true,
  });
}

export function useAssistKbQuery() {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: assistKbKey,
    queryFn: () => api.get<AssistKbStatusView>('/super-admin/assist/kb'),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });
}

/* ─────────────────────────────── Mutations ───────────────────────────────── */

export interface UpdateAssistFollowupVars {
  id: string;
  input: UpdateAssistFollowupInput;
}

/**
 * Move a conversation along the follow-up track, with an optional note.
 *
 * The server answers with the SUMMARY, not the detail, so the open drawer is
 * patched field-by-field rather than replaced — dropping `turns`, `recording`
 * and `trace` on a status change would empty the panel the admin is reading.
 */
export function useUpdateAssistFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateAssistFollowupVars) =>
      api.patch<AssistSessionSummary>(
        `/super-admin/assist/sessions/${id}/followup`,
        input,
      ),
    onSuccess: (summary, { id, input }) => {
      qc.setQueryData<AssistSessionDetail>(assistSessionKey(id), (prev) =>
        prev
          ? {
              ...prev,
              ...summary,
              // The note is not on the summary; the value we just saved is the
              // only truthful thing to show until the next full fetch.
              followupNote: input.note ?? prev.followupNote,
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: assistSessionsRootKey });
    },
  });
}

/**
 * Block a fingerprint, identified by the session it was seen on.
 *
 * The block is placed on a session id rather than on a number, so a super-admin
 * never types a phone number to block one — see `createAssistBlockSchema`.
 */
export function useCreateAssistBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssistBlockInput) =>
      api.post<AssistBlockView>('/super-admin/assist/blocks', input),
    onSuccess: (_block, { sessionId }) => {
      void qc.invalidateQueries({ queryKey: assistBlocksKey });
      // Every summary carries `blocked`, and the fingerprint may cover more
      // sessions than the one that was open — refetch the lists, not just this row.
      void qc.invalidateQueries({ queryKey: assistSessionsRootKey });
      void qc.invalidateQueries({ queryKey: assistSessionKey(sessionId) });
    },
  });
}

export function useDeleteAssistBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<{ ok: true }>(`/super-admin/assist/blocks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assistBlocksKey });
      void qc.invalidateQueries({ queryKey: assistSessionsRootKey });
      // Which sessions the lifted block covered is the server's answer, not
      // ours, so every open detail is re-read rather than guessed at.
      void qc.invalidateQueries({ queryKey: ['assist', 'session'] });
    },
  });
}

/**
 * Re-read the packed knowledge base from S3 without a deploy.
 *
 * The reload endpoint answers with the bare status, so the daily budget that
 * only the GET carries is preserved from what is already cached.
 */
export function useReloadAssistKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AssistKbStatus>('/super-admin/assist/kb/reload'),
    onSuccess: (status) => {
      qc.setQueryData<AssistKbStatusView>(assistKbKey, (prev) =>
        prev ? { ...prev, ...status } : undefined,
      );
      void qc.invalidateQueries({ queryKey: assistKbKey });
    },
  });
}
