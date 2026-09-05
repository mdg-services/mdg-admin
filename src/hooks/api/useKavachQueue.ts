import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Intent } from '@/lib/statusIntent';
import type {
  KavachCadenceBucket,
  KavachEvidenceMode,
  KavachItem,
  KavachItemStatus,
  KavachVerificationMode,
  KavachWorkQueuePage,
  KavachWorkQueueRow,
} from '@dk/shared';
import type {
  RejectKavachEvidenceInput,
  RequestKavachEvidenceInput,
  VerifyKavachItemInput,
} from '@dk/shared/schemas';

import { kavachKeys } from './useKavach';

/**
 * The cross-dealer work queue and the three admin writes that empty it.
 *
 * Sibling of `useKavach.ts` (per-dealer programme) rather than part of it: this
 * file is the throughput surface — one flat list across every dealer, paged by
 * keyset — and it invalidates differently, for the reason spelled out on
 * {@link useQueueInvalidation}.
 */

const PAGE_SIZE = 50;

export interface KavachQueueFilters {
  dealerId?: string;
  /** One task across every dealer — the "one task, one pass" mode. */
  code?: string;
  status?: KavachItemStatus;
  verification?: KavachVerificationMode;
  /** The review inbox: the dealer has sent something and nobody has ruled on it. */
  awaitingReview?: boolean;
}

export const kavachQueueKeys = {
  all: ['kavach', 'work-queue'] as const,
  list: (filters: KavachQueueFilters) =>
    ['kavach', 'work-queue', filters] as const,
  /** Singular, so it never collides with `kavachKeys.items(dealerId)`. */
  item: (itemId: string | undefined) => ['kavach', 'item', itemId] as const,
};

/* ───────────────────────────── Queue vocabulary ─────────────────────────── */

/**
 * How late a row is, as the phrase an admin triages on.
 *
 * The only piece of Kavach wording that is not in `lib/kavach.ts`: it reads a
 * `KavachWorkQueueRow`, which exists for this screen alone. Day-grained to match
 * the server's own IST arithmetic — an hours-based figure would make two tasks
 * that lapsed the same night read differently depending on when the page
 * happened to be opened.
 */
export function kavachDaysPendingChip(row: KavachWorkQueueRow): {
  text: string;
  intent: Intent;
} {
  if (row.status === 'NOT_YET_VERIFIED' && row.daysPending <= 0) {
    return { text: 'never checked', intent: 'info' };
  }
  if (row.daysPending > 0) {
    return {
      text: `${row.daysPending} ${row.daysPending === 1 ? 'day' : 'days'} late`,
      intent: row.daysPending >= 7 ? 'danger' : 'warning',
    };
  }
  if (row.daysPending === 0) return { text: 'due today', intent: 'warning' };
  return { text: `due in ${-row.daysPending}d`, intent: 'neutral' };
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * The admin work queue, keyset-paginated.
 *
 * `getNextPageParam` returns the server's opaque cursor and nothing else: the
 * queue is being emptied while an admin pages through it, so any client-side
 * arithmetic over row counts (an offset, a "page N") would silently skip the
 * work that closed underneath them.
 */
export function useKavachWorkQueue(filters: KavachQueueFilters) {
  return useInfiniteQuery({
    queryKey: kavachQueueKeys.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<KavachWorkQueuePage>('/kavach/work-queue', {
        dealerId: filters.dealerId,
        code: filters.code,
        status: filters.status,
        verification: filters.verification,
        awaitingReview: filters.awaitingReview ? true : undefined,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // The app refetches on window focus everywhere else, and here that would be
    // wrong: an admin who alt-tabs to check a photo would come back to a list
    // that has silently reordered and shortened around the row they were on.
    // This one list refreshes when they ask it to.
    refetchOnWindowFocus: false,
  });
}

/**
 * One item in full — the dealer's submission, the ask count, the history.
 *
 * The queue row carries `requestState` and `submittedAt` but not the photo or
 * the note behind them, because a list payload that dragged every dealer's
 * evidence across the wire would make the queue slow for the 90% of rows nobody
 * opens. The drawer fetches the one row it is showing.
 */
export function useKavachItemQuery(itemId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: kavachQueueKeys.item(itemId),
    queryFn: () => api.get<KavachItem>(`/kavach/items/${itemId}`),
    enabled: !!itemId && enabled,
  });
}

/* ─────────────────────────────── Mutations ──────────────────────────────── */

/**
 * What every write here invalidates.
 *
 * The queue itself is marked stale but deliberately NOT refetched
 * (`refetchType: 'none'`). An admin closing 85 tasks in one sitting works down a
 * list they can see; refetching all loaded pages after each save would reorder
 * and shorten that list between one row and the next, so "Save & next" would
 * land on whatever had shifted into the slot rather than on the row below the
 * one just closed. The page keeps closed rows on screen, marked, until the next
 * deliberate refresh — the list an admin is reading stays the list they act on.
 *
 * The dashboard and the dealer's own panel are refetched immediately: nothing is
 * being paged through there, and a score that lags a verification is exactly the
 * "screen says one figure, calculation reads another" split we keep out.
 */
function useQueueInvalidation() {
  const qc = useQueryClient();
  return (itemId: string, dealerId: string) => {
    qc.invalidateQueries({
      queryKey: kavachQueueKeys.all,
      refetchType: 'none',
    });
    qc.invalidateQueries({ queryKey: kavachQueueKeys.item(itemId) });
    qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    qc.invalidateQueries({ queryKey: kavachKeys.items(dealerId) });
    qc.invalidateQueries({ queryKey: kavachKeys.programme(dealerId) });
  };
}

export interface KavachItemMutationArgs<TBody> {
  itemId: string;
  /** Only used to invalidate that dealer's programme + item list. */
  dealerId: string;
  body: TBody;
}

/**
 * An ADMIN certifies a task. The only human write that moves a clock — a dealer
 * token is refused by the server, and there is no client path that lets the
 * dealer's own word close anything.
 */
export function useVerifyKavachItem() {
  const invalidate = useQueueInvalidation();
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: KavachItemMutationArgs<VerifyKavachItemInput>) =>
      api.post<KavachItem>(`/kavach/items/${itemId}/verify`, body),
    onSuccess: (_data, vars) => invalidate(vars.itemId, vars.dealerId),
  });
}

/** Ask the dealer for the photo or note. Moves neither the score nor the clock. */
export function useRequestKavachEvidence() {
  const invalidate = useQueueInvalidation();
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: KavachItemMutationArgs<RequestKavachEvidenceInput>) =>
      api.post<KavachItem>(`/kavach/items/${itemId}/request-evidence`, body),
    onSuccess: (_data, vars) => invalidate(vars.itemId, vars.dealerId),
  });
}

/** Send the dealer's submission back. `reason` reaches them verbatim. */
export function useRejectKavachEvidence() {
  const invalidate = useQueueInvalidation();
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: KavachItemMutationArgs<RejectKavachEvidenceInput>) =>
      api.post<KavachItem>(`/kavach/items/${itemId}/reject-evidence`, body),
    onSuccess: (_data, vars) => invalidate(vars.itemId, vars.dealerId),
  });
}

/** One row of the read-only task lookup that fills the queue's task filter. */
export interface KavachCatalogEntry {
  code: string;
  labelEn: string;
  labelHi: string;
  cadenceBucket: KavachCadenceBucket;
  points: number;
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
}

/**
 * The 45 active task codes, readable by ANY admin.
 *
 * Distinct from the editable catalog at `/super-admin/kavach-items`, which a
 * plain admin cannot reach — without this the queue's task filter could only
 * offer tasks that happened to be on the page already loaded, so an admin who
 * had just finished one task could not move to the next.
 *
 * Long `staleTime`: the catalog changes when a super-admin presses Save, which
 * is not something to re-fetch on every window focus.
 */
export function useKavachCatalogLookup() {
  return useQuery<KavachCatalogEntry[]>({
    queryKey: ['kavach', 'catalog'],
    staleTime: 10 * 60_000,
    queryFn: () => api.get<KavachCatalogEntry[]>('/kavach/catalog'),
  });
}
