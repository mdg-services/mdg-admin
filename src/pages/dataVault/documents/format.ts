import {
  DOCUMENT_KIND_SEED,
  documentAskMark,
  documentPeriodStartDay,
  periodKeyFor,
  type AdminDocumentAskRow,
  type DocumentAskEstateRow,
  type DocumentAskEstateStatus,
  type DocumentAskMark,
  type DocumentKind,
  type DocumentPeriodKind,
} from '@dk/shared';

/**
 * The Documents dataset's words and shapes — everything the pane needs that is
 * not React.
 *
 * WHERE THE DECIDABLE LOGIC ACTUALLY LIVES, AND WHY IT IS NOT HERE
 * ----------------------------------------------------------------
 * The mark, the sort rank, the age and the tally are in `@dk/shared`
 * (`types/documentAsk.ts`) and are covered by
 * `mdg-client/src/lib/documentsFormat.test.ts`. `mdg-admin` has no `test` script
 * and not one test file — checked, not assumed — and there is no precedent
 * anywhere in this repo for a test in one app importing a module out of another
 * by relative path. So the standing rule for this app was followed: decidable
 * logic goes to `shared`, where the dealer app's vitest can reach it.
 *
 * What is left here is the stuff that is genuinely this screen's and nobody
 * else's — the English facet labels, the mapping from a facet to a query, and
 * the flattening of the API's TWO row shapes into the one row the table draws.
 * It stays free of JSX for the same reason `lib/kavach.ts` does: a module of
 * words and data can be read, diffed and reasoned about without a renderer.
 */

/* ────────────────────────────── The catalog ─────────────────────────────── */

/**
 * The document kinds this screen can offer.
 *
 * Read from the SHIPPED SEED rather than from an API, because there is no
 * catalog endpoint yet: the backend seeds `DocumentKind` from this same constant
 * at boot and exposes no route to read it back. The model's own header says a
 * kind can also be added later from a catalog editor with no deploy — the day
 * that editor and its route exist, this constant becomes a fallback and the
 * picker reads the live catalog instead. Until then, offering the seed is the
 * honest thing: it is exactly the set of kinds the server will accept.
 *
 * Retired kinds are dropped. A `DocumentAsk` filed under one still resolves its
 * title, because the ask froze the wording at the time — but MDG must not be
 * able to ask for one again.
 */
export const DOCUMENT_KINDS: readonly DocumentKind[] = DOCUMENT_KIND_SEED.filter((k) => k.active);

/** One kind by code, or `undefined`. Total — an unknown `?kind=` opens "All documents". */
export function resolveDocumentKind(code: string | null): DocumentKind | undefined {
  if (!code) return undefined;
  return DOCUMENT_KINDS.find((k) => k.code === code);
}

/**
 * Can this kind be shown as an ESTATE — one row per live dealer, including the
 * dealers who have sent nothing?
 *
 * A freeform kind cannot, and the reason is a trap worth stating: its asks are
 * filed under `2026-09-02:<slug>`, because two different "other document"
 * requests made on the same day must not collide on the unique index. The estate
 * query matches `periodKey` EXACTLY, so asking it for the bare day `2026-09-02`
 * matches none of them — and because the estate is an anti-join, the answer is
 * not an empty list but every dealer in the estate reported as NOT SENT. A whole
 * screen of false accusations, with nothing on it to say the query was wrong.
 *
 * So a freeform kind falls back to the flat row list, which is the truthful view
 * of it anyway: a one-off request has no estate, only the dealers we asked.
 */
export function kindHasEstate(kind: DocumentKind | undefined): kind is DocumentKind {
  return kind !== undefined && !kind.freeform;
}

/**
 * The period key the estate is asked for, built from the ONE `?date=` the pane
 * parks in the URL.
 *
 * One parameter serves every period shape because `periodKeyFor` slices the day
 * down: a MONTH kind on `2026-09-02` asks about `2026-09`, a YEAR kind about
 * `2026`, and a kind with no period about `''`. A second URL parameter per shape
 * would be a second place for "which period is this screen on" to live.
 */
export function estatePeriodKey(kind: DocumentKind, isoDay: string): string {
  return periodKeyFor(kind.periodKind, isoDay);
}

/* ─────────────────────────────── The facets ─────────────────────────────── */

/**
 * The status facet. `sent` is the review queue — the same table, one filter
 * moved, which is the whole design: an admin's two questions ("who has not sent"
 * and "what needs reviewing") are one list, and one screen is one thing to learn.
 */
export type DocumentStatusFilter =
  | 'all'
  | 'missing'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'late'
  | 'closed';

export const STATUS_FILTERS: ReadonlyArray<{ value: DocumentStatusFilter; label: string }> = [
  { value: 'all', label: 'All rows' },
  { value: 'missing', label: 'Not sent' },
  { value: 'sent', label: 'Sent, waiting on us' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Sent back' },
  { value: 'late', label: 'Overdue' },
  { value: 'closed', label: 'Closed, nothing came' },
];

/** The facet a URL names, falling back to everything. Total, so a stale link still opens. */
export function resolveStatusFilter(value: string | null): DocumentStatusFilter {
  const found = STATUS_FILTERS.find((f) => f.value === value);
  return found ? found.value : 'all';
}

/**
 * Does this row belong to the facet? The ONE authority on that question.
 *
 * Both modes run it. The estate has no server-side status filter at all — it
 * returns the whole roster by design — so the facet has to be applied here; the
 * flat row list DOES filter server-side, through {@link statusFilterQuery}, and
 * this predicate is applied to its answer as well. That is deliberate
 * belt-and-braces rather than waste: a filter that lives in two places is a
 * filter that will one day disagree with itself, and here the query is only an
 * optimisation over what this function decides. If the two ever diverge the
 * screen shows what this file says, which is also what the tiles counted.
 */
export function matchesStatusFilter(
  filter: DocumentStatusFilter,
  status: DocumentAskEstateStatus,
  late: boolean,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    // "Not sent" is one idea and not two. Whether MDG got round to asking does
    // not change the fact that the paper is not here.
    case 'missing':
      return status === 'NOT_SENT' || status === 'ASKED';
    case 'sent':
      return status === 'SENT';
    case 'accepted':
      return status === 'ACCEPTED' || status === 'RECEIVED';
    case 'rejected':
      return status === 'REJECTED';
    case 'late':
      return late;
    case 'closed':
      return status === 'EXPIRED' || status === 'WITHDRAWN';
    default: {
      const unhandled: never = filter;
      return unhandled;
    }
  }
}

/** What `GET /v1/asks` is asked for, so the 200-row page is spent on rows the facet wants. */
export interface DocumentRowsQueryFacet {
  state?: 'ASKED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
  waitingOn?: 'dealer' | 'mdg' | 'none';
  late?: boolean;
}

/**
 * The facet as query parameters.
 *
 * `missing` narrows to `waitingOn=dealer` rather than to `state=ASKED`, because
 * the flat list has no `NOT_SENT` rows to find — that status only exists in the
 * anti-join — and a `REJECTED` row is a paper the dealer has not (re)sent, which
 * is the same problem from the admin's side. `accepted` and `closed` name one
 * state each and cannot be expressed as a `waitingOn`, so they are sent as a
 * state and the client-side predicate does the rest.
 */
export function statusFilterQuery(filter: DocumentStatusFilter): DocumentRowsQueryFacet {
  switch (filter) {
    case 'missing':
      return { waitingOn: 'dealer' };
    case 'sent':
      return { waitingOn: 'mdg' };
    case 'accepted':
      return { state: 'ACCEPTED' };
    case 'rejected':
      return { state: 'REJECTED' };
    case 'late':
      return { late: true };
    // `closed` covers two states and the query takes one, so it is left unsent
    // and the predicate above narrows the page. Sending `state=EXPIRED` alone
    // would silently drop every withdrawn row from a filter that names them.
    case 'closed':
    case 'all':
    default:
      return {};
  }
}

/* ─────────────────────────────── The one row ────────────────────────────── */

/**
 * The line the table draws, whichever of the API's two shapes it came from.
 *
 * `GET /v1/asks` answers in two modes — an ESTATE (one row per live dealer for a
 * single kind and period, with the two statuses no collection can produce on its
 * own) and a keyset page of ROWS (the asks themselves, across kinds and dates).
 * Both are the same table to an admin, so they are flattened here and the table,
 * the tiles, the sort and the marks are written once. The alternative — two
 * table components — is how the estate view and the review queue would come to
 * disagree about what "late" looks like.
 *
 * Fields absent from the estate shape are optional here and are simply not
 * drawn: an estate row carries no `askedAt`, no admin note and no reject reason,
 * because it is built from a projection over three reads rather than from whole
 * documents. The drawer fetches the full ask when it needs those.
 */
export interface DocumentRow {
  /** Stable React key. An estate row has no ask, so it is keyed by dealer. */
  key: string;
  dealerId: string;
  /** A dealer IS its code. There is no name to fall back on, by design. */
  dealerCode: string;
  kindCode: string;
  /** What the paper is called, in English — an admin reads English. */
  document: string;
  /** The period in words. Never a raw `2026-09-02` on a screen. */
  periodLabel: string;
  /** The exact key, for the deep link and for the "ask for this one" action. */
  periodKey: string;
  periodKind: DocumentPeriodKind;
  status: DocumentAskEstateStatus;
  waitingOn: 'dealer' | 'mdg' | 'none';
  late: boolean;
  mark: DocumentAskMark;
  /** Present only when a real ask exists. Every admin action takes this handle. */
  askId?: string;
  askedCount: number;
  askedAt?: string;
  submittedAt?: string;
  dueOn?: string;
  /** The IST day the period begins — the Age column's last-resort clock. */
  periodDay?: string;
  /** True when there is a paper to open. */
  hasFile: boolean;
  /** The full row, when we already have it. Saves the drawer a round trip. */
  detail?: AdminDocumentAskRow;
}

/** One estate line — including the dealers who have sent nothing and have no ask. */
export function rowFromEstate(
  row: DocumentAskEstateRow,
  kind: DocumentKind,
  periodKey: string,
  periodLabel: string,
): DocumentRow {
  const periodDay = documentPeriodStartDay(kind.periodKind, periodKey);
  return {
    key: `${kind.code}|${periodKey}|${row.dealerId}`,
    dealerId: row.dealerId,
    dealerCode: row.dealerCode,
    kindCode: kind.code,
    document: kind.titleEn,
    periodLabel,
    periodKey,
    periodKind: kind.periodKind,
    status: row.status,
    waitingOn: row.waitingOn,
    late: row.late,
    mark: documentAskMark(row.status),
    ...(row.askId ? { askId: row.askId } : {}),
    askedCount: row.askedCount,
    ...(row.submittedAt ? { submittedAt: row.submittedAt } : {}),
    ...(row.dueOn ? { dueOn: row.dueOn } : {}),
    ...(periodDay ? { periodDay } : {}),
    // The estate projection selects `submission.at` and nothing else off the
    // submission, so "is there a paper" is exactly "is there a send time".
    hasFile: Boolean(row.submittedAt),
  };
}

/** One line of the flat ask list. */
export function rowFromAsk(ask: AdminDocumentAskRow): DocumentRow {
  const periodDay = documentPeriodStartDay(ask.periodKind, ask.periodKey);
  return {
    key: ask.id,
    dealerId: ask.dealerId,
    dealerCode: ask.dealerCode ?? '',
    kindCode: ask.kindCode,
    // The admin's own words win over the catalog title for a freeform ask:
    // "A document MDG asked for" names nothing, and the label is the only thing
    // on the row that says which paper this is.
    document: ask.label ? `${ask.titleEn} — ${ask.label}` : ask.titleEn,
    periodLabel: ask.periodLabel,
    periodKey: ask.periodKey,
    periodKind: ask.periodKind,
    status: ask.state,
    waitingOn: ask.waitingOn,
    late: ask.late,
    mark: documentAskMark(ask.state),
    askId: ask.id,
    askedCount: ask.askedCount,
    ...(ask.askedAt ? { askedAt: ask.askedAt } : {}),
    ...(ask.submission?.at ? { submittedAt: ask.submission.at } : {}),
    ...(ask.dueOn ? { dueOn: ask.dueOn } : {}),
    ...(periodDay ? { periodDay } : {}),
    hasFile: ask.hasFile,
    detail: ask,
  };
}

/* ───────────────────────── Bulk actions, told honestly ───────────────────── */

/** What happened to one dealer in a bulk run. */
export interface BulkOutcome {
  dealerCode: string;
  ok: boolean;
  /** The server's own sentence on a refusal. Shown as written. */
  message: string;
}

/**
 * The one line a bulk run reports.
 *
 * A bulk button that says "Done" when two of three failed is a lie, and the
 * refusals here are not rare edge cases — there are four independent ways one
 * ask in a batch of ten legitimately refuses while the other nine succeed: the
 * hour-long remind cooldown, a dealer who has already sent it, a request that
 * was withdrawn, and a dealer archived between the list loading and the button
 * being pressed. So the summary always names both numbers when anything failed,
 * and the per-dealer reasons stay on screen underneath it.
 */
export function summariseBulk(outcomes: readonly BulkOutcome[], pastTense: string): string {
  const done = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - done;
  if (outcomes.length === 0) return 'There was nothing to do.';
  if (failed === 0) return `All ${done} ${pastTense}.`;
  return `${done} of ${outcomes.length} ${pastTense}. ${failed} did not go through — the reasons are below.`;
}

/* ────────────────────────────── The words ───────────────────────────────── */

/**
 * What each status is CALLED on this screen.
 *
 * Written from MDG's side of the desk, because that is who reads it: "Waiting on
 * us" rather than "Submitted", because the admin's question is whose move it is
 * and not what the row's enum member is called. `RECEIVED` reads "Already on
 * file" for the same reason — nobody asked, the service's own store has the
 * paper, and calling that "Accepted" would claim a person at MDG had looked at
 * it when nobody has.
 */
export const STATUS_WORD: Record<DocumentAskEstateStatus, string> = {
  NOT_SENT: 'Not sent',
  ASKED: 'Asked, not sent',
  SENT: 'Waiting on us',
  ACCEPTED: 'Accepted',
  RECEIVED: 'Already on file',
  REJECTED: 'Sent back',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
  NOT_ON_SERVICE: 'Not on this service',
};

/** What each mark means, for the legend under the table. */
export const MARK_LEGEND: ReadonlyArray<{ mark: DocumentAskMark; text: string }> = [
  { mark: 'THEM', text: 'Waiting on the dealer' },
  { mark: 'US', text: 'Waiting on MDG' },
  { mark: 'HAVE', text: 'We have it' },
  { mark: 'CLOSED', text: 'Closed, nothing came' },
  { mark: 'NOT_APPLICABLE', text: 'Not on this service' },
];
