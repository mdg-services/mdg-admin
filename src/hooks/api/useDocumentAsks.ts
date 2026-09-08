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
  /**
   * THE TWO VALIDITY FILTERS, AND THE THREE THINGS EITHER OF THEM CHANGES.
   *
   *  1. **The rows.** Both narrow to papers that carry a `validUntil`, and — if
   *     no state was named — to `ACCEPTED`, because a validity only exists once
   *     MDG holds the paper.
   *  2. **The ORDER.** The list otherwise sorts `periodKey desc`, and every kind
   *     that carries an expiry is `periodKind: 'NONE'`, so its key is the empty
   *     string and it sorts LAST. Either of these flips the sort to `validUntil`
   *     ascending — soonest to run out first. A validity screen that sends
   *     neither gets a first page of register pages and not one licence.
   *  3. **The cursor.** It now carries the ordering it was minted under, and one
   *     from the other ordering is REFUSED rather than applied — so a query that
   *     changes its mind about the sort between pages cannot silently skip a
   *     slice of the estate. In practice that costs nothing here:
   *     `documentAskKeys.rows()` puts the params in the key, so changing a facet
   *     is a different query with its own fresh first page.
   *
   * They do NOT compose. The route ASSIGNS `filter.validUntil` rather than
   * merging, so a `validityState` replaces the range an `expiringWithinDays`
   * set — send one or the other. `pages/documents/format.ts`'s `validityQuery`
   * owns that choice so no screen has to remember it.
   *
   * And a page can come back SHORT while `nextCursor` still points at more: the
   * `valid` / `expiring` boundary is each row's own first ladder step, so the
   * route filters the exact band after paging. Never conclude the list has ended
   * by counting rows; read `nextCursor`.
   */
  validityState?: 'expired' | 'expiring' | 'valid';
  expiringWithinDays?: number;
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
        // Either of these flips the route to `validUntil` ascending — see the
        // field comments on `DocumentAskRowsParams`.
        validityState: params.validityState,
        expiringWithinDays: params.expiringWithinDays,
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
  /**
   * This one paper's reminder ladder, decided at the moment MDG asks for it.
   *
   * There is deliberately NO `validUntil` here and there never will be: you
   * cannot know the date printed on a certificate before you have the
   * certificate, and a date on a row still waiting for its photograph would be a
   * number nobody read, sitting on a screen looking authoritative. It is taken
   * at accept or file time, by the person looking at the scan.
   */
  reminderOffsetDays?: number[];
  /**
   * Skip the "MDG needs a paper from you" push for this one request.
   *
   * FOR ONE CALLER: `FileForDealerDialog`, which has to create the ask before
   * there is anywhere to put the file and then closes it a second later. Without
   * this the dealer's phone buzzes asking for a certificate that was already on
   * file before the buzz finished. The row, the audit trail and the socket event
   * all happen exactly as they would otherwise — this suppresses the push, not
   * the record.
   */
  silent?: boolean;
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

/**
 * "This is good" — and, for a paper that runs out, the date it runs out on.
 *
 * ACCEPT USED TO BE A BARE POST AND STILL IS FOR MOST KINDS. The body is
 * optional in the schema because the schema cannot see the catalog; the ROUTE
 * refuses the accept with a 400 — "This paper runs out. Enter the date printed
 * on it before accepting." — whenever the kind carries `tracksValidity` and no
 * `validUntil` was sent. `ReviewAskDrawer` therefore collects the date before it
 * enables the button, so that refusal is unreachable through the UI rather than
 * merely handled: a reviewer who has already looked at a certificate should not
 * be told off by a server for pressing the only button on screen.
 */
export interface AcceptAskVars {
  askId: string;
  /** `YYYY-MM-DD`, read off the paper. Required by the route for a kind that tracks validity. */
  validUntil?: string;
  /** This one paper's ladder, overriding its kind's. `[]` means never remind about it. */
  reminderOffsetDays?: number[];
}

export function useAcceptDocumentAsk() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: ({ askId, ...body }: AcceptAskVars) =>
      api.post<AdminDocumentAskRow>(`/asks/${askId}/accept`, body),
    onSuccess: invalidate,
  });
}

/**
 * MDG already holds the paper; here it is.
 *
 * THE UPLOAD-ON-BEHALF VERB. It submits AND accepts in one call, because filing
 * a paper MDG already has means the submission and the verdict on it are made by
 * the same person in the same second — there is no second reader to ask for.
 * The row records `submission.byKind: 'admin'` and the audit action is
 * `DOCUMENT_ASK_FILE_FOR_DEALER`, so nothing anywhere claims the dealer sent it.
 *
 * THE ASK MUST EXIST FIRST. An upload is filed under `ask/<dealerId>/<askId>/`,
 * so there is nowhere to put the file until the row is there — which is exactly
 * how the dealer's own volunteer flow works. The order is create → shrink →
 * presign → PUT → this. See `FileForDealerDialog`, which owns that sequence and
 * the retry rule that keeps a failed upload from minting a second ask.
 */
export interface FileForDealerVars {
  askId: string;
  attachment: {
    storageKey: string;
    filename: string;
    contentType: string;
    size: number;
    kind: 'image' | 'file';
  };
  note?: string;
  validUntil?: string;
  reminderOffsetDays?: number[];
}

export function useFileDocumentForDealer() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: ({ askId, ...body }: FileForDealerVars) =>
      api.post<AdminDocumentAskRow>(`/asks/${askId}/file-for-dealer`, body),
    onSuccess: invalidate,
  });
}

/**
 * Correct a mistyped date, or quieten the reminders on ONE certificate.
 *
 * SEPARATE FROM ACCEPT because the two are different acts with different audit
 * rows: accepting is a verdict on a paper, this is fixing a number. Folding it
 * in would mean reopening a closed compliance record every time somebody fixed a
 * typo — and `ACCEPTED` is the one state that refuses to reopen precisely
 * because reopening erases the reviewer's name and the time.
 *
 * THE THREE VALUES OF `reminderOffsetDays` ARE THREE DIFFERENT INSTRUCTIONS, and
 * the middle one is the one that bites:
 *
 *   omitted   → leave the ladder alone; the kind's stays in force.
 *   `[30, 7]` → this ladder, for this paper only.
 *   `[]`      → NEVER REMIND about this paper. A real, deliberate setting.
 *
 * `validUntil: null` clears the date outright, which also clears the mirrored
 * date on the outlet Info tab where the kind names a profile field. Both are why
 * the drawer's ladder control makes the empty list an explicit, confirmed choice
 * rather than what happens when somebody clears the box to retype it.
 *
 * ACCEPTED ROWS ONLY — the route refuses anything else, because a validity
 * belongs to a paper MDG holds.
 */
export interface SetValidityVars {
  askId: string;
  /** `null` clears the date. Omit to leave it untouched. */
  validUntil?: string | null;
  reminderOffsetDays?: number[];
}

export function useSetDocumentValidity() {
  const invalidate = useInvalidateAsks();
  return useMutation({
    mutationFn: ({ askId, ...body }: SetValidityVars) =>
      api.patch<AdminDocumentAskRow>(`/asks/${askId}/validity`, body),
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
