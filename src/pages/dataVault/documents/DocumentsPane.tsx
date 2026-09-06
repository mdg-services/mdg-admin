import {
  AlertCircle,
  BellRing,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  FileCheck2,
  FilePlus2,
  FileUp,
  Search,
  Undo2,
} from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Card,
  CardContent,
  EmptyState,
  HowThisWorks,
  IconButton,
  Input,
  MIN_SELECTABLE_YMD,
  MobileCardList,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import {
  useDocumentAskEstateQuery,
  useDocumentAskRowsQuery,
} from '@/hooks/api/useDocumentAsks';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd, istTodayYmd, isYmd, shiftYmd } from '@/lib/format';
import {
  compareDocumentAskReviewRows,
  compareDocumentAskRows,
  dealerCodeLabel,
  documentAskAge,
  documentAskEstateTally,
  documentAskListCaveat,
} from '@dk/shared';

import { StatTile, StatTileRow, StatTileSkeletons } from '../StatTile';
import type { VaultDatasetProps } from '../types';

import { AskDocumentDialog } from './AskDocumentDialog';
import {
  DOCUMENT_KINDS,
  estatePeriodKey,
  kindHasEstate,
  matchesStatusFilter,
  resolveDocumentKind,
  resolveStatusFilter,
  rowFromAsk,
  rowFromEstate,
  statusFilterQuery,
  STATUS_FILTERS,
  type DocumentRow,
  type DocumentStatusFilter,
} from './format';
import { RemindAllDialog } from './RemindAllDialog';
import { ReviewAskDrawer } from './ReviewAskDrawer';
import { MarkLegend, StatusPip } from './StatusPip';

/**
 * WHAT EVERY DEALER OWES MDG, AND WHAT HAS COME IN.
 *
 * This is the view `TtDensityDayLog`'s third index was built to allow — its own
 * comment says so: *"Who has not sent today's page" — the estate view this is
 * built to allow later* — and that no route or page has ever used. Generalised:
 * that index can only answer the question for one service's photograph, and this
 * answers it for any paper MDG asks a dealer for.
 *
 * ONE SCREEN, TWO QUESTIONS, ONE TABLE
 * ------------------------------------
 * An admin arrives with one of two questions — "who has not sent it?" and "what
 * is waiting on me?" — and they are the same list with the status filter moved.
 * Splitting them into two surfaces would mean two things to learn, two places
 * for the marks to drift, and a review inbox that quietly disagreed with the
 * estate about whether a paper had arrived. So `?status=sent` IS the review
 * queue: the same rows, sorted oldest-wait-first instead of problems-first.
 *
 * NO NEW ROUTE, NO NEW NAV ITEM
 * -----------------------------
 * The admin already has 21 routes and 17 nav items, and the right shelf already
 * exists. The Data Vault's registry says adding a dataset is a data-only change,
 * so this is one descriptor in `datasets.ts` and this pane. `/data-vault` is
 * already top-level and estate-first by construction, which is precisely the
 * shape this question needs — the per-dealer vault under `pages/dealers/vault/`
 * is a different surface answering a different question, and reaching this
 * through it would be the five-click path this replaces.
 *
 * EVERY VIEW IS A LINK
 * --------------------
 * `VaultDatasetProps` is `{ params, patchParams }` and nothing else, because the
 * Vault keeps ALL of its state in the query string — a dataset that kept its own
 * React state would quietly break that promise. So the kind, the period, the
 * status facet, the search and the open row all live in the URL and
 * `/data-vault?dataset=documents&kind=tt-register-page&date=2026-09-02&status=missing`
 * is something an admin pastes into the Inbox and a colleague opens on exactly
 * that view.
 */

/* ────────────────────────── Reading the URL ─────────────────────────────── */

/** Everything both halves of this dataset read out of the query string. */
interface DocumentsScope {
  /** The selected kind, or `undefined` for "All documents". */
  kind: ReturnType<typeof resolveDocumentKind>;
  /** IST today, recomputed each render so it advances past IST midnight. */
  today: string;
  /** The day the period control is on. One parameter serves every period shape. */
  date: string;
  /** The exact period key the estate is asked for, or `undefined` in rows mode. */
  periodKey: string | undefined;
  /** True when the anti-join can be used — see `kindHasEstate`. */
  estate: boolean;
  status: DocumentStatusFilter;
  query: string;
  /** `row.key` of the open drawer, or null. */
  openKey: string | null;
}

/**
 * Resolve the whole scope from the params.
 *
 * The date is clamped at BOTH ends. A hand-edited or shared `?date=2099-01-01`
 * would otherwise scope the pane — and the "ask everyone" button on it — to a
 * period that has not happened, which the backend rejects with a 400 that reads
 * to an admin as a broken screen. The floor matters as much: a date input emits
 * four complete dates while a year is typed digit by digit (`0002-…`, `0020-…`,
 * `0202-…`, `2026-…`) and each one that gets through re-scopes the pane and costs
 * another round trip.
 */
function useDocumentsScope(params: URLSearchParams): DocumentsScope {
  const today = istTodayYmd();
  const kind = resolveDocumentKind(params.get('kind'));
  const raw = params.get('date');
  const date = isYmd(raw) && raw >= MIN_SELECTABLE_YMD && raw <= today ? raw : today;
  const estate = kindHasEstate(kind);
  return {
    kind,
    today,
    date,
    periodKey: estate && kind ? estatePeriodKey(kind, date) : undefined,
    estate,
    status: resolveStatusFilter(params.get('status')),
    query: params.get('q') ?? '',
    openKey: params.get('open'),
  };
}

/* ─────────────────────────── The header controls ────────────────────────── */

/**
 * The dataset's header slot: which paper, which period, and "Ask for a
 * document".
 *
 * These scope the counters as well as the list, which is why they sit in the
 * page header rather than in the pane — the same division the IRAS dataset makes
 * with its business date.
 */
export function DocumentsActions({ params, patchParams }: VaultDatasetProps) {
  const scope = useDocumentsScope(params);
  const [askOpen, setAskOpen] = React.useState(false);

  return (
    <>
      {/* `flex-wrap`: three controls plus a button do not fit 328px, and wrapping
          the button onto a second line is the one outcome here that is not a
          clipped control — `main` is `overflow-x-hidden`, so an overhang is not
          scrolled off, it is gone. */}
      <div className="flex flex-wrap items-center gap-1">
        <Select
          value={scope.kind?.code ?? 'all'}
          aria-label="Which document"
          className="w-full md:w-56"
          onChange={(e) =>
            // The open row is cleared with the scope. A drawer keyed to a row
            // that the new scope does not contain would open on nothing.
            patchParams({ kind: e.target.value === 'all' ? null : e.target.value, open: null })
          }
        >
          <option value="all">All documents</option>
          {DOCUMENT_KINDS.map((k) => (
            <option key={k.code} value={k.code}>
              {k.titleEn}
            </option>
          ))}
        </Select>

        <PeriodControl scope={scope} patchParams={patchParams} />

        <Button
          size="sm"
          onClick={() => setAskOpen(true)}
          leftIcon={<FilePlus2 width={16} height={16} strokeWidth={1.75} />}
        >
          Ask for a document
        </Button>

        {/* Icon, not the worded button: this row already carries three controls
            and a fourth set of words would take a line of its own on a phone. */}
        <HowThisWorks surface="admin-vault-documents" label="Documents" variant="icon" />
      </div>

      <AskDocumentDialog
        open={askOpen}
        onClose={() => setAskOpen(false)}
        {...(scope.kind ? { initialKindCode: scope.kind.code } : {})}
        initialDate={scope.date}
      />
    </>
  );
}

/**
 * The period control, whose SHAPE follows the kind.
 *
 * A day stepper for a register page, a month picker for a monthly return, a year
 * box for an annual licence, and nothing at all for a fire NOC — which has no
 * period, because it is either on file or it is not, and inventing a calendar
 * year for it would make the same certificate owed again every January.
 *
 * NO CONTROL AT ALL IS DRAWN WHERE ONE WOULD NOT WORK, and that is the honest
 * answer rather than a disabled one. Two cases:
 *
 *  - "All documents" spans kinds and therefore spans period SHAPES, and the
 *    route's own date range bounds DAY keys only — a MONTH key (`2026-09`) sorts
 *    before that month's first day as a string, so folding it in would silently
 *    drop every monthly ask from an otherwise correct-looking month view.
 *  - A FREEFORM kind has no estate to scope (its asks are keyed
 *    `2026-09-02:<slug>` and an exact match on the bare day finds none — see
 *    `kindHasEstate`), so it is shown as the flat list of what was asked for,
 *    which is not date-filtered either.
 *
 * A control that appeared to filter and did not would be worse than none: it
 * would make an admin believe they had checked a day they had not.
 */
function PeriodControl({
  scope,
  patchParams,
}: {
  scope: DocumentsScope;
  patchParams: VaultDatasetProps['patchParams'];
}) {
  const { kind, date, today } = scope;
  if (!kind) {
    return (
      <span className="px-1 text-xs text-text-subtle">Every period, newest first</span>
    );
  }
  if (!scope.estate) {
    return (
      <span className="px-1 text-xs text-text-subtle">
        Every request for this document, newest first
      </span>
    );
  }
  if (kind.periodKind === 'NONE') {
    return <span className="px-1 text-xs text-text-subtle">No period — it is on file or it is not</span>;
  }
  if (kind.periodKind === 'MONTH' || kind.periodKind === 'YEAR') {
    const isMonth = kind.periodKind === 'MONTH';
    return (
      <Input
        type={isMonth ? 'month' : 'number'}
        value={isMonth ? date.slice(0, 7) : date.slice(0, 4)}
        min={isMonth ? MIN_SELECTABLE_YMD.slice(0, 7) : MIN_SELECTABLE_YMD.slice(0, 4)}
        max={isMonth ? today.slice(0, 7) : today.slice(0, 4)}
        aria-label={isMonth ? 'Which month' : 'Which year'}
        className="w-full max-w-[170px] md:w-[150px]"
        onChange={(e) => {
          const next = e.target.value;
          // Stored as a full day whatever the shape, so there is exactly one
          // `?date=` and `periodKeyFor` slices it down to the kind's period.
          const asDay = isMonth ? `${next}-01` : `${next}-01-01`;
          if (isYmd(asDay) && asDay >= MIN_SELECTABLE_YMD && asDay <= today) {
            patchParams({ date: asDay, open: null });
          }
        }}
      />
    );
  }
  return (
    <>
      {/* `IconButton`, not a `Button` with padding: `cn` is plain clsx, so a
          call-site `px-2` lands BESIDE the size's own `px-3` and loses on
          stylesheet order — and a 16px glyph in a Button is 40×44, short on the
          axis a thumb travels along. */}
      <IconButton
        variant="secondary"
        size="sm"
        aria-label="Previous day"
        disabled={date <= MIN_SELECTABLE_YMD}
        onClick={() => patchParams({ date: shiftYmd(date, -1, MIN_SELECTABLE_YMD), open: null })}
      >
        <ChevronLeft width={16} height={16} strokeWidth={1.75} />
      </IconButton>
      <Input
        type="date"
        value={date}
        min={MIN_SELECTABLE_YMD}
        max={today}
        aria-label="Which day"
        className="w-full max-w-[170px] md:w-[150px]"
        onChange={(e) => {
          const next = e.target.value;
          if (isYmd(next) && next >= MIN_SELECTABLE_YMD && next <= today) {
            patchParams({ date: next, open: null });
          }
        }}
      />
      <IconButton
        variant="secondary"
        size="sm"
        aria-label="Next day"
        disabled={date >= today}
        onClick={() => patchParams({ date: shiftYmd(date, 1, MIN_SELECTABLE_YMD), open: null })}
      >
        <ChevronRight width={16} height={16} strokeWidth={1.75} />
      </IconButton>
      {date !== today ? (
        <Button variant="ghost" size="sm" onClick={() => patchParams({ date: today, open: null })}>
          Today
        </Button>
      ) : null}
    </>
  );
}

/* ──────────────────────────────── The pane ──────────────────────────────── */

export function DocumentsPane({ params, patchParams }: VaultDatasetProps) {
  const scope = useDocumentsScope(params);
  const [remindOpen, setRemindOpen] = React.useState(false);
  const [askForRow, setAskForRow] = React.useState<DocumentRow | null>(null);

  // ONE ROUTE, TWO SHAPES. Naming a kind AND a period asks the anti-join; both
  // hooks are always called (rules of hooks) and the one that is not in play is
  // disabled, so exactly one request is in flight.
  const estateQ = useDocumentAskEstateQuery(
    scope.kind?.code,
    scope.periodKey,
    scope.estate,
  );
  const facet = statusFilterQuery(scope.status);
  const rowsQ = useDocumentAskRowsQuery(
    {
      ...(scope.kind ? { kindCode: scope.kind.code } : {}),
      ...facet,
    },
    !scope.estate,
  );

  const active = scope.estate ? estateQ : rowsQ;

  /**
   * The API's two shapes, flattened to the one row the table draws.
   *
   * Memoised on the payload rather than defaulted with `?? []`, which is a fresh
   * array every render and would re-run the filter, the sort and every row's
   * identity on each keystroke in the search box.
   */
  const kind = scope.kind;
  const rows = React.useMemo<DocumentRow[]>(() => {
    if (scope.estate && kind) {
      const page = estateQ.data;
      if (!page) return [];
      return page.rows.map((r) => rowFromEstate(r, kind, page.periodKey, page.periodLabel));
    }
    // FLATTENED ACROSS EVERY LOADED PAGE, not just the first. The list is keyset
    // paginated and used to draw page one only; everything below — the tiles,
    // the search, "Remind all not sent" — is built from these rows, so a page
    // silently dropped here understates every one of them.
    return (rowsQ.data?.pages ?? []).flatMap((page) => page.rows).map(rowFromAsk);
  }, [scope.estate, kind, estateQ.data, rowsQ.data]);

  // The counters are built from the rows the table draws and never from a second
  // query, so a tile can never disagree with the list under it.
  const tally = React.useMemo(() => documentAskEstateTally(rows), [rows]);

  const needle = scope.query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    const filtered = rows
      .filter((r) => matchesStatusFilter(scope.status, r.status, r.late))
      .filter((r) => !needle || r.dealerCode.toLowerCase().includes(needle));
    // The review queue is the one view where problems-first is the wrong order:
    // every row in it has the same status, and what separates them is how long
    // the dealer has been waiting on MDG. Oldest first, so a photograph that has
    // sat unread since Tuesday is not buried by fresher ones landing above it.
    return filtered.sort(
      scope.status === 'sent' ? compareDocumentAskReviewRows : compareDocumentAskRows,
    );
  }, [rows, scope.status, needle]);

  /**
   * THE SENTENCE THIS SCREEN OWES ITS READER WHEN IT IS NOT SHOWING EVERYTHING.
   *
   * `hasNextPage` is the server's own answer (`nextCursor` on the last page),
   * never a guess from `rows.length === 200` — a run that happens to return
   * exactly a full page with nothing after it would otherwise apologise for a
   * completeness it actually had. The estate view is excluded because it is not
   * paged at all: it returns one row per live dealer, which IS the whole estate.
   */
  const caveat = scope.estate
    ? ''
    : documentAskListCaveat({
        shown: rows.length,
        hasMore: rowsQ.hasNextPage,
        // The SEARCH only. The status facet is sent to the route and narrows
        // the query itself, so it cannot hide a loaded row; the dealer-code
        // search runs here, over the loaded rows alone, and is the one that can
        // report "nothing found" about a dealer nobody has fetched yet.
        searching: Boolean(needle),
      });

  const openRow = scope.openKey ? visible.find((r) => r.key === scope.openKey) ?? null : null;

  /** The rows "Remind all not sent" would act on — exactly what the button counts. */
  const notSent = React.useMemo(
    () => visible.filter((r) => r.status === 'NOT_SENT' || r.status === 'ASKED'),
    [visible],
  );

  /**
   * What this view is actually scoped to, said in words.
   *
   * The period only appears when the ESTATE is what is on screen, because that
   * is the only mode where a period is really applied: the flat row list is not
   * date-filtered here (the route's range bounds DAY keys only, and folding a
   * MONTH key into it silently drops every monthly ask), so printing "Today"
   * over a list that spans every date would be a caption that contradicts the
   * rows under it.
   */
  const periodTitle =
    scope.estate && estateQ.data ? estateQ.data.periodLabel : '';
  const scopeBase = kind
    ? periodTitle
      ? `${kind.titleEn} · ${periodTitle}`
      : `${kind.titleEn} · every request`
    : 'Every document, every period';
  // The tiles are counted from the rows that are loaded, so while there are more
  // to load they are a FLOOR and not a total — and the caption under them has to
  // say so, or four confident numbers describe a page as if it were the estate.
  const scopeLabel = caveat ? `${scopeBase} · first ${rows.length} loaded` : scopeBase;

  return (
    <div>
      <OverviewTiles
        tally={tally}
        loading={active.isLoading}
        failed={active.isError}
        subtitle={scopeLabel}
      />

      <Card className="mt-3 md:mt-4">
        {/* `padding="none"` plus an explicit `md:p-4`, not `className="p-0"`:
            `cn` is clsx and Tailwind emits `.p-4` after `.p-0`, so a p-0 passed
            through className never applies. */}
        <CardContent padding="none" className="md:p-4">
          <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center md:justify-between">
            <div className="relative md:max-w-xs md:flex-1">
              <Search
                width={15}
                height={15}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              />
              <Input
                type="search"
                value={scope.query}
                onChange={(e) => patchParams({ q: e.target.value })}
                placeholder="Search by dealer code"
                aria-label="Search dealers by code"
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Select
                value={scope.status}
                aria-label="Filter by status"
                className="w-full md:w-52"
                onChange={(e) =>
                  patchParams({
                    status: e.target.value === 'all' ? null : e.target.value,
                    open: null,
                  })
                }
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
              {notSent.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full md:w-auto"
                  onClick={() => setRemindOpen(true)}
                  leftIcon={<BellRing width={14} height={14} strokeWidth={1.75} />}
                >
                  Remind all not sent ({notSent.length})
                </Button>
              ) : null}
            </div>
          </div>

          {/* The review queue's honest scope line. `?status=sent` on a single
              kind is a REAL review queue, but only of that kind for that period,
              and a screen reading "nothing to review" while another kind has ten
              waiting would be the exact class of lie this feature exists to
              stop. */}
          {scope.status === 'sent' && kind ? (
            <div className="px-3 pt-3 md:px-0 md:pt-0 md:pb-3">
              <Callout intent="info">
                This is only {kind.titleEn}
                {periodTitle ? ` for ${periodTitle}` : ''}. Switch the document filter to “All
                documents” to see everything waiting on MDG.
              </Callout>
            </div>
          ) : null}

          {active.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : active.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the documents"
              description={
                active.error instanceof ApiError ? active.error.message : 'Please try again.'
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<FileUp width={28} height={28} strokeWidth={1.75} />}
              title={
                scope.estate
                  ? 'No dealer is on this service yet'
                  : 'Nothing has been asked for yet'
              }
              description={
                scope.estate
                  ? 'Attach the service this paper belongs to and every dealer on it will appear here.'
                  : 'Use “Ask for a document” to request a paper from a dealer.'
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search width={28} height={28} strokeWidth={1.75} />}
              title="Nothing matches this filter"
              // THE MOST DANGEROUS SENTENCE ON THIS SCREEN, so it is the one
              // that must not overstate. "Nothing matches" over a page of a
              // longer list looks exactly like "that dealer has sent
              // everything", and an admin acts on the second. When there are
              // rows nobody has fetched, the caveat says so instead.
              description={caveat || 'Try a different status, or clear the search.'}
            />
          ) : (
            <DocumentList rows={visible} onOpen={(key) => patchParams({ open: key })} />
          )}

          {/* WHAT IS NOT ON SCREEN, SAID OUT LOUD, WITH THE BUTTON THAT FIXES
              IT. The route pages properly and this list used to draw the first
              page and drop the rest — so the honest line and the way to get the
              rest belong together, not a caption apologising for a limit the
              reader cannot lift. `isFetchingNextPage` disables the button
              rather than hiding it, because a control that vanishes mid-press
              reads as a click that did nothing.

              Drawn whenever there are more rows, INCLUDING over an empty
              result: a search that matched nothing in the loaded page is the
              case that most needs the next page, and leaving the button out
              there would tell an admin the truth and then give them no way to
              act on it. The sentence itself is skipped when the empty state
              above is already carrying it, so it is never printed twice. */}
          {caveat ? (
            <div className="flex flex-col items-start gap-2 border-t border-border p-3 md:flex-row md:items-center md:justify-between md:px-0 md:pb-0">
              {visible.length > 0 ? (
                <p className="text-xs text-text-subtle">{caveat}</p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="w-full md:w-auto"
                disabled={rowsQ.isFetchingNextPage}
                onClick={() => void rowsQ.fetchNextPage()}
              >
                {rowsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}

          {/* The legend is always drawn and never behind a toggle: five marks is
              more than anybody holds in their head on a screen they open once a
              week, and a legend that must be opened is one nobody reads. */}
          <div className="border-t border-border p-3 md:border-0 md:px-0 md:pb-0 md:pt-4">
            <MarkLegend />
            {/* The footnote that makes the tiles add up, drawn only when there
                is something to say — an empty paragraph here would leave a stray
                8px gap under the legend on every ordinary day. It accounts for
                the rows the four tiles deliberately do not count. The other
                honest admission a capped list owes its reader — that there are
                requests it is not showing — now sits with the "Load more" button
                above, where the reader can act on it. */}
            {tally.notOnService > 0 ? (
              <p className="mt-2 text-xs text-text-subtle">
                {`${tally.notOnService} dealer${
                  tally.notOnService === 1 ? ' is' : 's are'
                } not on this service, so this paper was never theirs to send.`}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ReviewAskDrawer
        open={!!openRow}
        row={openRow}
        onClose={() => patchParams({ open: null })}
        onAskFor={(row) => {
          patchParams({ open: null });
          setAskForRow(row);
        }}
      />

      <RemindAllDialog open={remindOpen} onClose={() => setRemindOpen(false)} rows={notSent} />

      {/* The same dialog the header opens, pre-filled from one row — so "Ask for
          it" on a dealer with nothing on file is the same code path, and not a
          second create form that could drift from it. */}
      <AskDocumentDialog
        open={!!askForRow}
        onClose={() => setAskForRow(null)}
        initialDealerIds={askForRow ? [askForRow.dealerId] : []}
        {...(askForRow ? { initialKindCode: askForRow.kindCode } : {})}
        initialDate={scope.date}
      />
    </div>
  );
}

/* ───────────────────────────────── Tiles ────────────────────────────────── */

function OverviewTiles({
  tally,
  loading,
  failed,
  subtitle,
}: {
  tally: ReturnType<typeof documentAskEstateTally>;
  loading: boolean;
  failed: boolean;
  subtitle: string;
}) {
  // A failed request already says so in the list below. Four skeletons that
  // never resolve read as a hung screen.
  if (failed) return null;
  if (loading) return <StatTileSkeletons />;
  return (
    <StatTileRow>
      <StatTile
        label="Not sent"
        value={tally.notSent}
        tone="warning"
        icon={<CircleSlash width={16} height={16} strokeWidth={1.75} />}
        hint={subtitle}
      />
      <StatTile
        label="Sent, waiting"
        value={tally.sent}
        tone="neutral"
        icon={<Clock width={16} height={16} strokeWidth={1.75} />}
        // Our own backlog, named as ours. This is the number the product draws
        // nowhere today, and it is the whole reason the marks differ.
        hint={tally.sent > 0 ? 'Waiting on MDG, not on them' : 'Nothing to review'}
      />
      <StatTile
        label="Accepted"
        value={tally.accepted}
        tone="success"
        icon={<FileCheck2 width={16} height={16} strokeWidth={1.75} />}
        hint={tally.accepted > 0 ? 'On file' : 'Nothing on file yet'}
      />
      <StatTile
        label="Sent back"
        value={tally.rejected}
        tone="danger"
        icon={<Undo2 width={16} height={16} strokeWidth={1.75} />}
        hint={tally.rejected > 0 ? 'Waiting for them to send again' : 'None sent back'}
      />
    </StatTileRow>
  );
}

/* ───────────────────────────────── The list ─────────────────────────────── */

/** "Asked twice, last on 29 Aug" — or the plain truth that nobody has asked. */
function askedSummary(row: DocumentRow): string {
  if (row.askedCount === 0) return row.askId ? 'They sent it unprompted' : 'Not asked yet';
  const times = row.askedCount === 1 ? 'Asked once' : `Asked ${row.askedCount} times`;
  return row.askedAt ? `${times}, last ${formatDateTime(row.askedAt)}` : times;
}

/** The Age cell: how long it has been somebody's turn, and whose clock said so. */
function AgeCell({ row, nowMs }: { row: DocumentRow; nowMs: number }) {
  // `nowMs` is handed down rather than read here. A hundred rows each calling
  // `Date.now()` would be a hundred slightly different instants, so two rows
  // sent within the same minute could print different ages and the review
  // queue's order would not match the numbers beside it.
  const age = documentAskAge(
    {
      waitingOn: row.waitingOn,
      ...(row.submittedAt ? { submittedAt: row.submittedAt } : {}),
      ...(row.askedAt ? { askedAt: row.askedAt } : {}),
      ...(row.periodDay ? { periodDay: row.periodDay } : {}),
    },
    nowMs,
  );
  if (!age) return <span className="text-text-subtle">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="tabular-nums">{age.label}</span>
      {/* Which clock, in one word. Without it "4 days" beside a SENT row and "4
          days" beside an ASKED row look like the same fact and are not: one is
          MDG's backlog and the other is the dealer's. */}
      <span className="ml-1 text-xs text-text-subtle">
        {age.basis === 'sent' ? 'in our queue' : age.basis === 'asked' ? 'since we asked' : 'old'}
      </span>
    </span>
  );
}

function DocumentList({
  rows,
  onOpen,
}: {
  rows: DocumentRow[];
  onOpen: (key: string) => void;
}) {
  // One instant for the whole list — see `AgeCell`.
  const nowMs = Date.now();
  return (
    <>
      {/* Desktop table (≥ md). Five columns, so it fits without a horizontal
          scroller at desktop widths; below md it is the card stack instead,
          because a five-column table on a phone either scrolls sideways (which
          the app forbids) or crushes its columns. */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TRow>
              <TH>Dealer</TH>
              <TH>Document</TH>
              <TH>Asked</TH>
              <TH>Status</TH>
              <TH>Age</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TRow key={row.key} clickable onClick={() => onOpen(row.key)}>
                <TD>
                  <span className="font-medium">{dealerCodeLabel(row.dealerCode)}</span>
                </TD>
                <TD>
                  <span className="break-words">{row.document}</span>
                  {row.periodLabel ? (
                    <span className="block text-xs text-text-subtle">{row.periodLabel}</span>
                  ) : null}
                </TD>
                <TD className="text-text-muted">
                  <span className="break-words">{askedSummary(row)}</span>
                  {row.dueOn ? (
                    <span className="block text-xs text-text-subtle">
                      Due {formatYmd(row.dueOn)}
                    </span>
                  ) : null}
                </TD>
                <TD>
                  <StatusPip status={row.status} late={row.late} />
                </TD>
                <TD className="text-text-muted">
                  <AgeCell row={row} nowMs={nowMs} />
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile card-stack (< md). The whole card is one tap target, the way the
          desktop row is; no card carries a button, so there is never a button
          nested inside a tappable card. */}
      <MobileCardList
        variant="rows"
        cards={rows.map((row) => ({
          key: row.key,
          onClick: () => onOpen(row.key),
          primary: (
            <span className="truncate font-medium text-text">
              {dealerCodeLabel(row.dealerCode)}
            </span>
          ),
          // `clamp`, not the default: the status words run to nineteen
          // characters ("Not on this service"), and a hard `shrink-0` right rail
          // would squeeze the dealer code down to nothing on a 360px screen.
          primaryRightWidth: 'clamp' as const,
          primaryRight: <StatusPip status={row.status} late={row.late} />,
          secondary: (
            <span className="break-words">
              {row.document}
              {row.periodLabel ? ` · ${row.periodLabel}` : ''}
            </span>
          ),
          meta: (
            <span className="flex flex-col gap-0.5">
              <span className="break-words">{askedSummary(row)}</span>
              <span className="flex flex-wrap items-center gap-x-2">
                <AgeCell row={row} nowMs={nowMs} />
                {row.dueOn ? <span>Due {formatYmd(row.dueOn)}</span> : null}
              </span>
            </span>
          ),
        }))}
      />
    </>
  );
}
