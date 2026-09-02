import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AdminDocumentAskPage,
  AdminDocumentAskRow,
  DocumentAskEstatePage,
} from '@dk/shared';

/**
 * Document Asks, as the admin reads and writes them.
 *
 * ONE ROUTE ANSWERS IN TWO SHAPES, and the switch is `kindCode` + `periodKey`
 * TOGETHER. Naming a kind and a period asks the anti-join "who across the estate
 * has not sent this?" and comes back as one row per LIVE dealer, including the
 * dealers who have no ask at all. Anything else is a keyset page of the asks
 * themselves. Both are wrapped here so the pane never has to remember which
 * arguments flip the mode.
 *
 * Everything hangs off the `['documentAsks']` prefix so one invalidation after
 * any write refreshes whichever of the two is on screen.
 */

/* ─────────────────────────────── Query keys ─────────────────────────────── */

export interface DocumentAskRowsParams {
  kindCode?: string;
  dealerId?: string;
  state?: string;
  waitingOn?: 'dealer' | 'mdg' | 'none';
  late?: boolean;
  limit?: number;
}

export const documentAskKeys = {
  all: ['documentAsks'] as const,
  estate: (kindCode: string, periodKey: string) =>
    ['documentAsks', 'estate', kindCode, periodKey] as const,
  rows: (params: DocumentAskRowsParams) => ['documentAsks', 'rows', params] as const,
  fileUrl: (askId: string | undefined) => ['documentAsks', 'file-url', askId] as const,
};

/* ─────────────────────────────── The reads ──────────────────────────────── */

/**
 * "Who has not sent last Tuesday's register page?" — one row per live dealer.
 *
 * THE EMPTY PERIOD KEY IS A REAL VALUE AND `buildUrl` WOULD EAT IT. A kind with
 * no period (a fire NOC: it is either on file or it is not) is asked about with
 * `periodKey=''`, and the route switches to the estate on `periodKey !==
 * undefined` — but `buildUrl` in `lib/api.ts` skips any query value that is the
 * empty string, so the parameter would never be sent and the route would quietly
 * answer with the flat row list instead. The screen would then show the handful
 * of dealers who have an ask and none of the ones who do not, which is the exact
 * blind spot the estate view exists to remove. So the query string is written
 * out here and passed as part of the path, where nothing can drop it.
 */
export function useDocumentAskEstateQuery(
  kindCode: string | undefined,
  periodKey: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: documentAskKeys.estate(kindCode ?? '', periodKey ?? ''),
    queryFn: () =>
      api.get<DocumentAskEstatePage>(
        `/asks?kindCode=${encodeURIComponent(kindCode ?? '')}&periodKey=${encodeURIComponent(
          periodKey ?? '',
        )}`,
      ),
    enabled: enabled && kindCode !== undefined && periodKey !== undefined,
    placeholderData: (prev) => prev,
  });
}

/**
 * How many requests one page of the flat list holds.
 *
 * The route's own maximum, so the first page is as much as can be had in one
 * request — an admin scanning a morning's work should not have to press anything
 * on an ordinary day. Deliberately NOT exported: the pane says how many rows it
 * is holding by counting them, because after one "Load more" the honest figure
 * is 400 and a screen quoting this constant would confidently say 200.
 */
const DOCUMENT_ASK_ROWS_PAGE_SIZE = 200;

/**
 * The asks themselves — the view that spans kinds and dates, a page at a time.
 *
 * KEYSET, AND IT ACTUALLY PAGES NOW. It used to ask for 200 rows, never send a
 * cursor, and simply not draw row 201: the route implemented paging properly and
 * the screen threw the second page away. On an estate with a busy month that is
 * a list which silently stops, and the counters built from it understate the
 * work by however much was dropped.
 *
 * `useInfiniteQuery` rather than a page number for the reason the route's cursor
 * is keyset in the first place: rows are being accepted and rejected while an
 * admin reads, and an offset silently skips the work that shifted under the
 * cursor. That is `services/kavach/workQueue.ts`'s recorded lesson.
 *
 * Every write still invalidates the whole `documentAsks` prefix, which refetches
 * the pages that are loaded — so accepting a paper on page two does not quietly
 * leave page two stale.
 */
export function useDocumentAskRowsQuery(params: DocumentAskRowsParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: documentAskKeys.rows(params),
    queryFn: ({ pageParam }) =>
      api.get<AdminDocumentAskPage>('/asks', {
        kindCode: params.kindCode,
        dealerId: params.dealerId,
        state: params.state,
        waitingOn: params.waitingOn,
        late: params.late,
        limit: params.limit ?? DOCUMENT_ASK_ROWS_PAGE_SIZE,
        cursor: pageParam,
      }),
    // No cursor on the first request. `buildUrl` drops an undefined query value,
    // so nothing is sent rather than `cursor=undefined` reaching the route as a
    // string it would then fail to decode.
    initialPageParam: undefined as string | undefined,
    // `undefined` is how react-query is told there is no next page, and it is
    // exactly what the route omits `nextCursor` to mean: no more rows.
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * The FULL ask behind one estate row.
 *
 * There is no `GET /v1/asks/:id`, and this is not an oversight to work around
 * with a new route: the flat list already answers it. An estate row is a
 * projection — `state`, `askedCount`, `dueOn`, `submission.at` and nothing else
 * — so the drawer, which shows the admin's note, the dealer's note, the reject
 * reason and who reviewed it, needs the whole document. Asking for that dealer's
 * asks OF THAT KIND is one indexed query, and the row wanted is picked out of it
 * by id.
 *
 * `periodKey` is deliberately NOT sent: adding it beside `kindCode` would flip
 * the route back into estate mode and return the very projection this call
 * exists to escape. Filtering by id in the client is what keeps this correct for
 * an undated kind too, where one dealer can hold several rows under the same
 * empty period key.
 */
export function useDocumentAskDetailQuery(args: {
  askId?: string;
  dealerId?: string;
  kindCode?: string;
  enabled: boolean;
}) {
  const { askId, dealerId, kindCode, enabled } = args;
  const params: DocumentAskRowsParams = { dealerId, kindCode, limit: 50 };
  return useQuery({
    queryKey: [...documentAskKeys.rows(params), 'detail', askId] as const,
    queryFn: async (): Promise<AdminDocumentAskRow | null> => {
      const page = await api.get<AdminDocumentAskPage>('/asks', {
        dealerId,
        kindCode,
        limit: 50,
      });
      return page.rows.find((r) => r.id === askId) ?? null;
    },
    enabled: enabled && !!askId && !!dealerId && !!kindCode,
  });
}

/** The signed pair for one submitted paper: one to look at it, one to save it. */
export interface DocumentAskFileUrls {
  viewUrl: string;
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

/**
 * Short-lived signed URLs for the paper on an ask.
 *
 * Deliberately per-ask and re-fetched rather than cached long, exactly as the
 * Kavach verify drawer does it: a URL held across a lunch break renders as a
 * broken image, and a broken image on a review screen looks precisely like a
 * dealer who sent nothing. The GET is also AUDITED server-side — reading a
 * dealer's private paper is egress — which is why the list route never inlines
 * one and this only fires when a drawer is actually open.
 */
export function useDocumentAskFileUrl(askId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: documentAskKeys.fileUrl(askId),
    queryFn: () => api.get<DocumentAskFileUrls>(`/asks/${askId}/file-url`),
    enabled: enabled && !!askId,
    staleTime: 60_000,
    retry: false,
  });
}

/* ─────────────────────────────── The writes ─────────────────────────────── */

/** Body for "MDG needs this paper from you". `dueInDays`, never a date — see the schema. */
export interface CreateAskVars {
  dealerId: string;
  kindCode: string;
  periodKind: 'DAY' | 'MONTH' | 'YEAR' | 'NONE';
  /** The BASE period key. The server composes the freeform suffix from `label`. */
  periodKey: string;
  label?: string;
  note?: string;
  dueInDays?: number;
}

/**
 * Every write invalidates the whole `documentAsks` prefix.
 *
 * Coarse on purpose. A single accept changes the estate's counters, the review
 * queue's length and the row itself, and the three are separate cache entries;
 * hand-patching them would be three chances to leave a screen showing a paper
 * that has already been dealt with. The pane holds at most a couple of hundred
 * rows, so the refetch is one request.
 */
function useInvalidateAsks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: documentAskKeys.all });
}

export function useCreateDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: (vars: CreateAskVars) => api.post<AdminDocumentAskRow>('/asks', vars),
    onSuccess: invalidate,
  });
}

/** What a nudge answers with. `phoneInstead` is advice, not a disabled button. */
export interface RemindAskResult {
  ask: AdminDocumentAskRow;
  askedCount: number;
  /** True once three requests have produced nothing. Ring them instead. */
  phoneInstead: boolean;
  /** The sentence to show when `phoneInstead` — it names the dealer and the count. */
  advice?: string;
}

export function useRemindDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: (askId: string) => api.post<RemindAskResult>(`/asks/${askId}/remind`),
    onSuccess: invalidate,
  });
}

export function useAcceptDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: (askId: string) => api.post<AdminDocumentAskRow>(`/asks/${askId}/accept`),
    onSuccess: invalidate,
  });
}

export function useRejectDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: (vars: { askId: string; reason: string }) =>
      api.post<AdminDocumentAskRow>(`/asks/${vars.askId}/reject`, { reason: vars.reason }),
    onSuccess: invalidate,
  });
}

export function useWithdrawDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: (vars: { askId: string; reason?: string }) =>
      api.post<AdminDocumentAskRow>(
        `/asks/${vars.askId}/withdraw`,
        vars.reason ? { reason: vars.reason } : {},
      ),
    onSuccess: invalidate,
  });
}
