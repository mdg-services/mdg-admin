import {
  AlertCircle,
  CalendarRange,
  Check,
  EyeOff,
  Image as ImageIcon,
  RotateCw,
  ScanLine,
  Send,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DateRangeFilter,
  dateRangeForPreset,
  Dialog,
  DownloadButton,
  EmptyState,
  formatDateRangeLabel,
  HowThisWorks,
  Label,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type DateRangeValue,
} from '@/components/ui';
import {
  useDealerLedgerFlags,
  useLedgerWatchCard,
  useShareLedgerWatchCard,
  useLedgerPeriodSummary,
  useUpdateLedgerFlag,
  type LedgerFlagFilters,
  type LedgerWatchCardWindow,
} from '@/hooks/api/useLedgerWatch';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatDmy, inrFormat, istTodayYmd } from '@/lib/format';
import { StatTileRow } from '@/pages/dataVault/StatTile';
import type { LedgerFlagDto, LedgerFlagStatus } from '@dk/shared';

import {
  FLAG_KIND_LABEL,
  FLAG_SEVERITY_LABEL,
  FLAG_STATUS_LABEL,
  flagSeverityIntent,
  flagStatusIntent,
  monthLabel,
  MOVEMENT_CLASS_LABEL,
  movementClassIntent,
  netOtherIntent,
  netOtherSentence,
  orderedClassTotals,
  recentMonths,
  sortFlags,
  summaryFigures,
} from './ledgerWatchFormat';
import type { DealerVaultPaneProps } from './vault/types';

/**
 * Ledger watch, for one dealer: what this month's ledger did outside buying
 * fuel and paying for it, and every line that needs a person to look at it.
 *
 * WHAT AN ADMIN IS ACTUALLY READING HERE
 * --------------------------------------
 * A PAD ledger is meant to be a pair — the dealer buys fuel (a debit) and
 * deposits money to restore the credit. That pair is the whole of what the DOD
 * engine reports and the whole of what anybody has ever seen. Everything else
 * on the statement — interest on an overdue, a licence-fee recovery, a ₹1,062
 * participation fee, a commission paid back — moves the outstanding, and
 * therefore the due amount and the due date, with nobody told. This pane is
 * where that becomes visible.
 *
 * WHY `charged` IS A FOUR-FIGURE NUMBER BESIDE A CRORE OF FUEL
 * -----------------------------------------------------------
 * The four tiles are two different things standing side by side. Fuel bought
 * and Deposited are the PAIR. Charged and Paid count only the rows that are NOT
 * the pair. So a month with ₹1.2 crore of invoices reports a few thousand
 * rupees charged and that is correct, not a figure that failed to load — which
 * is why every tile carries a hint saying what it does and does not cover, and
 * why the net sits under them as its own sentence.
 *
 * STRUCTURE COPIED FROM `vault/DealerPadLedgerPane`
 * ------------------------------------------------
 * Same card rhythm, same `CardHeader` with the count on the right, same
 * skeleton-then-EmptyState-then-content ladder, same `ApiError` message
 * handling. The two panes sit one rail entry apart and are read one after the
 * other; a different loading shape between them would read as a different
 * product.
 *
 * NO TABLE, AT ANY WIDTH. A finding is one sentence and two buttons, and a
 * sentence in a table cell either truncates or forces the row to scroll
 * sideways. The list is a stack that reflows, so the page body never scrolls
 * horizontally on a phone.
 */
export function DealerLedgerWatchPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();

  /**
   * Which month the figures cover.
   *
   * Seeded from `istTodayYmd()` — the IST business day, matching the backend's
   * own `istDateKey` — and never from `new Date()`. A browser in another
   * timezone must not be able to ask for a different month than the server
   * would have picked for the same instant.
   */
  const [month, setMonth] = React.useState(() => istTodayYmd().slice(0, 7));
  const monthChoices = React.useMemo(
    () => recentMonths(istTodayYmd().slice(0, 7), 6),
    [],
  );

  /**
   * Open findings only, by default.
   *
   * The pane is a working surface: what still needs somebody. "Everything" is
   * one tap away because a dismissed finding is the thing an admin goes looking
   * for when a dealer rings about a charge nobody flagged.
   */
  const [scope, setScope] = React.useState<'open' | 'all'>('open');
  const filters: LedgerFlagFilters = scope === 'open' ? { status: 'OPEN' } : {};

  const summaryQ = useLedgerPeriodSummary(dealer.id, month);
  const flagsQ = useDealerLedgerFlags(dealer.id, filters);
  const updateFlag = useUpdateLedgerFlag();

  /**
   * Findings handled in this sitting, kept on screen and marked.
   *
   * The list an admin is reading has to be the list they act on. If
   * acknowledging the third row pulled the fourth up into its place, the next
   * tap would land on a finding they had not read. Rows stay put, dimmed, with
   * their new status shown, until Refresh.
   */
  const [handled, setHandled] = React.useState<
    Record<string, LedgerFlagStatus>
  >({});
  const [ignoring, setIgnoring] = React.useState<LedgerFlagDto | null>(null);
  const [ignoreNote, setIgnoreNote] = React.useState('');

  const flags = React.useMemo(
    () => sortFlags(flagsQ.data?.pages.flatMap((p) => p.rows) ?? []),
    [flagsQ.data],
  );
  // The server's count for the whole filter, not the loaded page. It arrives
  // nested under `counts`; reading a top-level `total` (which the API has never
  // sent) silently produced 0 above a screen full of findings.
  const total = flagsQ.data?.pages[0]?.counts.total ?? 0;

  function setStatus(flag: LedgerFlagDto, status: LedgerFlagStatus, note?: string) {
    updateFlag.mutate(
      { id: flag.id, body: note ? { status, note } : { status } },
      {
        onSuccess: () => {
          setHandled((prev) => ({ ...prev, [flag.id]: status }));
          toast.success(
            status === 'IGNORED'
              ? 'Ignored — detection will not raise it again.'
              : 'Acknowledged.',
          );
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not update the flag',
          ),
      },
    );
  }

  function refresh() {
    setHandled({});
    void flagsQ.refetch();
    void summaryQ.refetch();
  }

  return (
    <div className="grid gap-3 md:gap-4">
      {/* The heading row wraps rather than sitting in a two-column grid: at
          360px a month picker beside a title makes both of them ~150px, and the
          picker is a real control an admin uses on every visit. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Ledger watch</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            What this outlet&rsquo;s PAD ledger did outside buying fuel and
            paying for it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="ledger-watch-month">Month</Label>
            <Select
              id="ledger-watch-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {monthChoices.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            loading={flagsQ.isRefetching || summaryQ.isRefetching}
            aria-label="Refresh ledger watch"
            leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      <MonthSummary
        isLoading={summaryQ.isLoading}
        isError={summaryQ.isError}
        error={summaryQ.error}
        summary={summaryQ.data}
        month={month}
      />

      <DealerCard dealerId={dealer.id} />

      <Card>
        <CardContent padding="none" className="md:p-4">
          <CardHeader
            align="center"
            padding="comfortable"
            action={
              <div className="flex items-center gap-2">
                <SegmentedControl
                  aria-label="Which findings to list"
                  fullWidthOnMobile={false}
                  value={scope}
                  onChange={(v) => setScope(v)}
                  options={[
                    { value: 'open', label: 'Open' },
                    { value: 'all', label: 'Everything' },
                  ]}
                />
                <HowThisWorks
                  surface="admin-dealer-vault-ledger-watch"
                  label="Ledger watch"
                  variant="icon"
                />
              </div>
            }
          >
            <p className="text-base font-semibold text-text">
              {scope === 'open' ? 'Open findings' : 'Every finding'}
              {total > 0 ? (
                <span className="ml-2 font-normal tabular-nums text-text-muted">
                  {total.toLocaleString('en-IN')}
                </span>
              ) : null}
            </p>
            <p className="text-sm text-text-muted">
              One line per movement outside the routine traffic, with the
              figures the sentence was built from.
            </p>
          </CardHeader>

          {flagsQ.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : flagsQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the findings"
              description={
                flagsQ.error instanceof ApiError
                  ? flagsQ.error.message
                  : 'Please try again.'
              }
              cta={
                <Button variant="secondary" onClick={() => void flagsQ.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : flags.length === 0 ? (
            <EmptyState
              icon={<ScanLine width={28} height={28} strokeWidth={1.75} />}
              title={
                scope === 'open' ? 'Nothing open' : 'Nothing raised yet'
              }
              description={
                scope === 'open'
                  ? 'Every movement outside the routine traffic has been looked at.'
                  : 'Findings appear here once Credit & DOD monitoring has run for this dealer and classified its ledger.'
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {flags.map((flag) => (
                  <FlagRow
                    key={flag.id}
                    flag={flag}
                    handledAs={handled[flag.id]}
                    busy={updateFlag.isPending}
                    onAcknowledge={() => setStatus(flag, 'ACKNOWLEDGED')}
                    onIgnore={() => {
                      setIgnoreNote('');
                      setIgnoring(flag);
                    }}
                  />
                ))}
              </ul>

              <div className="flex items-center justify-between gap-3 border-t border-border p-3">
                <span className="text-xs text-text-subtle">
                  Showing {flags.length.toLocaleString('en-IN')} of{' '}
                  {total.toLocaleString('en-IN')}
                </span>
                {flagsQ.hasNextPage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={flagsQ.isFetchingNextPage}
                    onClick={() => void flagsQ.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ignoring is terminal — detection refreshes an ignored finding's
          evidence but never drags it back to OPEN — so it asks, and the reason
          is stored on the flag rather than lost in somebody's memory. */}
      <Dialog
        open={ignoring !== null}
        onClose={() => setIgnoring(null)}
        title="Ignore this finding?"
        description={
          ignoring
            ? `${ignoring.titleEn} — ${inrFormat(ignoring.amount)} on ${formatDmy(ignoring.date)}. It stays on the ledger; it just stops asking for attention. Detection will not raise it again.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIgnoring(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={updateFlag.isPending}
              onClick={() => {
                if (!ignoring) return;
                const flag = ignoring;
                setIgnoring(null);
                setStatus(flag, 'IGNORED', ignoreNote.trim() || undefined);
              }}
            >
              Ignore it
            </Button>
          </>
        }
      >
        <Label htmlFor="ledger-watch-ignore-note" hint="optional">
          Why
        </Label>
        <Textarea
          id="ledger-watch-ignore-note"
          rows={3}
          value={ignoreNote}
          onChange={(e) => setIgnoreNote(e.target.value)}
          placeholder="e.g. confirmed with IOC — annual rental, expected"
        />
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── The month's headline ───────────────────────── */

function MonthSummary({
  isLoading,
  isError,
  error,
  summary,
  month,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  summary: ReturnType<typeof useLedgerPeriodSummary>['data'];
  month: string;
}) {
  if (isLoading) {
    return (
      <StatTileRow>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent padding="none" className="p-2 md:p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-28" />
            </CardContent>
          </Card>
        ))}
      </StatTileRow>
    );
  }

  if (isError || !summary) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title={`Could not load ${monthLabel(month)}`}
            description={
              error instanceof ApiError ? error.message : 'Please try again.'
            }
          />
        </CardContent>
      </Card>
    );
  }

  const { figures, net, netAgrees, reportedNet } = summaryFigures(summary);
  const classTotals = orderedClassTotals(summary);

  return (
    <div className="grid gap-3">
      <StatTileRow>
        {figures.map((f) => (
          <MoneyTile key={f.key} label={f.label} value={f.value} hint={f.hint} />
        ))}
      </StatTileRow>


      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Net, outside routine traffic
              </p>
              <p className="mt-0.5 break-words text-sm text-text-muted">
                {netOtherSentence(net)}
              </p>
            </div>
            <p
              className={cn(
                'whitespace-nowrap text-xl font-semibold tabular-nums md:text-2xl',
                netOtherIntent(net) === 'success' && 'text-success',
                netOtherIntent(net) === 'warning' && 'text-warning',
              )}
            >
              {/* The sign is spelled out. A bare `-₹12,345.67` is read as a
                  minus on a screen full of minus signs; `−` before the word
                  makes the direction the first thing seen. */}
              {net < 0 ? `− ${inrFormat(Math.abs(net))}` : inrFormat(net)}
            </p>
          </div>

          {/* THE AUTHORITATIVE-FIGURE CHECK, on screen rather than in a test.
              `netOther` arrives on the summary and is also derivable from the
              two figures printed above it. When the two disagree by more than
              the contract's 0.05 epsilon, this pane refuses to pick one — the
              recurring fault in this product is a screen stating a figure the
              calculation behind it reads differently, and quietly printing the
              served value here would be this feature committing it. */}
          {netAgrees ? null : (
            <p className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs text-warning">
              These figures disagree. Paid to the dealer minus charged to the
              dealer comes to {inrFormat(net)}, and the month was reported as{' '}
              {inrFormat(reportedNet)}. Treat both as unconfirmed until someone
              has looked at the ledger itself.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
            <span>
              {summary.rows.toLocaleString('en-IN')} rows in{' '}
              {monthLabel(summary.month)}, {summary.otherRows.toLocaleString('en-IN')}{' '}
              outside the routine traffic
            </span>
            {summary.firstDate && summary.lastDate ? (
              <span>
                {formatDmy(summary.firstDate)} → {formatDmy(summary.lastDate)}
              </span>
            ) : null}
            <span>Computed {formatDateTime(summary.generatedAt)}</span>
          </div>

          {classTotals.length > 0 ? (
            <ul className="grid gap-1.5">
              {classTotals.map((t) => (
                <li
                  key={`${t.movementClass}-${t.direction}`}
                  // `minmax(0, 1fr)` on the middle track, not `1fr`: a grid
                  // track sized by min-content refuses to shrink below its
                  // longest word, overflows the card, and `main` clips it —
                  // the figure on the right simply disappears on a 360px
                  // screen with no sideways scroll to recover it.
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm"
                >
                  <Badge intent={movementClassIntent(t.movementClass)}>
                    {MOVEMENT_CLASS_LABEL[t.movementClass]}
                  </Badge>
                  <span className="min-w-0 truncate text-xs text-text-muted">
                    {t.direction === 'CHARGED' ? 'charged' : 'paid back'} ·{' '}
                    {t.rows.toLocaleString('en-IN')}{' '}
                    {t.rows === 1 ? 'row' : 'rows'}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-right tabular-nums',
                      t.direction === 'RECEIVED' ? 'text-success' : 'text-text',
                    )}
                  >
                    {inrFormat(t.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              Nothing outside the routine traffic landed in this month.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * A rupee figure in a tile.
 *
 * Deliberately not `StatTile`: that one takes a `number` and prints it with
 * `toLocaleString`, which is right for a row count and wrong for money — no
 * rupee sign, and no guarantee of the two decimal places a ledger figure always
 * carries. Everything else about it — the padding, the uppercase label that
 * wraps rather than truncates, the `tabular-nums` figure — is copied so the
 * two tile kinds sit in one row without a seam.
 */
function MoneyTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent padding="none" className="p-2 md:p-4">
        <span className="block min-w-0 break-words text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </span>
        {/* `text-lg` and not the `text-xl` a count tile uses: a rupee figure
            carries two decimals and an Indian grouping, so ₹25,11,260.00 is
            eleven glyphs more than a row count and would wrap inside a 164px
            tile on a 360px screen. */}
        <p className="mt-1 break-words text-lg font-semibold tabular-nums text-text md:text-xl">
          {inrFormat(value)}
        </p>
        <p className="mt-0.5 break-words text-[11px] text-text-subtle">{hint}</p>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────── One finding ───────────────────────────── */

function FlagRow({
  flag,
  handledAs,
  busy,
  onAcknowledge,
  onIgnore,
}: {
  flag: LedgerFlagDto;
  handledAs?: LedgerFlagStatus;
  busy: boolean;
  onAcknowledge: () => void;
  onIgnore: () => void;
}) {
  const status = handledAs ?? flag.status;
  const open = status === 'OPEN';
  return (
    <li className={cn('grid gap-2 p-3 md:p-4', handledAs && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge intent={flagSeverityIntent(flag.severity)}>
          {FLAG_SEVERITY_LABEL[flag.severity]}
        </Badge>
        <Badge intent={movementClassIntent(flag.movementClass)}>
          {MOVEMENT_CLASS_LABEL[flag.movementClass]}
        </Badge>
        <span className="text-xs text-text-subtle">
          {FLAG_KIND_LABEL[flag.kind]}
        </span>
        {open ? null : (
          <Badge intent={flagStatusIntent(status)}>
            {FLAG_STATUS_LABEL[status]}
          </Badge>
        )}
      </div>

      <div>
        <p className="break-words font-medium text-text">{flag.titleEn}</p>
        {/* THE SENTENCE IS THE PRODUCT. Every rupee figure in it was formatted
            in code out of the evidence object beside it — no model and no
            hand-written string ever supplies a figure — so it can always be
            checked against the numbers it quotes. */}
        <p className="mt-0.5 break-words text-sm text-text-muted">
          {flag.detailEn}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
        <span className="tabular-nums">{formatDmy(flag.date)}</span>
        <span className="tabular-nums">{inrFormat(flag.amount)}</span>
        <span>
          {flag.direction === 'CHARGED' ? 'charged' : 'paid to the dealer'}
        </span>
        {flag.note ? <span className="break-words">Note: {flag.note}</span> : null}
      </div>

      {open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onAcknowledge}
            leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
          >
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onIgnore}
            leftIcon={<EyeOff width={14} height={14} strokeWidth={1.75} />}
          >
            Ignore
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Longest window a card may cover, in inclusive days.
 *
 * MIRRORS `CARD_WINDOW_MAX_DAYS` in `routes/v1/ledgerWatch.ts`, which is the
 * authority: this copy exists only so the fields refuse a year-and-a-day
 * in place rather than letting it come back a 400 after a round trip. If the
 * server's number changes and this one does not, the worst that happens is the
 * old message arrives from the server — never a card covering a period the
 * server refused.
 */
const CARD_WINDOW_MAX_DAYS = 366;

/**
 * A drawn window, said the way the card says it.
 *
 * MIRRORS `periodWords().en` in the backend's `services/ledgerWatch/card.ts`.
 * The split matters more than the wording: a single day is "on 26 Aug 2026",
 * never "between 26 Aug 2026 and 26 Aug 2026", which is what a plain range
 * template produces and what reads to anybody as a broken screen.
 */
function periodPhrase(w: LedgerWatchCardWindow): string {
  return w.from === w.to
    ? `on ${formatDateRangeLabel(w)}`
    : `between ${formatDate(w.from)} and ${formatDate(w.to)}`;
}

/** Which card the admin is asking for. `latest` is the default and always was. */
type CardMode = 'latest' | 'range';

/**
 * The dealer's own copy, as a picture to download or send.
 *
 * TWO CARDS BEHIND ONE CONTROL, and the default one is the one that must never
 * get slower or stranger:
 *
 *   Latest    the last four entries outside the routine traffic. Unchanged —
 *             same rows, same totals ("of these 4"), same cached PNG.
 *   Dates     everything between two days an admin picks, totalled over that
 *             whole period. A different picture with a different scope, cached
 *             in its own slot server-side so it can never delay or replace the
 *             daily one.
 *
 * BEHIND A BUTTON, NOT ON MOUNT. Asking for either can cost a Chromium launch
 * on a box whose browser budget is one, so nothing here fetches until an admin
 * says they want it. That is also why the empty state is a button and not a
 * spinner: opening this pane must stay free. The same rule is why switching to
 * Dates does NOT fetch on its own — the window is only sent once the pair is
 * complete and the admin presses for it.
 *
 * THE ROWS ARE LISTED BESIDE THE PICTURE, in text. An admin approving something
 * that goes to a dealer should be able to read exactly what is on it without
 * waiting for an image to load — and on a phone, over a bad connection, the
 * image is the part that does not arrive.
 */
function DealerCard({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<CardMode>('latest');

  /**
   * The window the admin is editing. Seeded to this month, never queried until
   * they ask: `DateRangeFilter` already refuses to emit a half-typed or
   * backwards pair, and `asked` below is what turns a complete one into a fetch.
   */
  const [range, setRange] = React.useState<DateRangeValue>(() =>
    dateRangeForPreset('month'),
  );
  /**
   * The window a card was actually asked for, which is NOT the one in the
   * fields.
   *
   * Two states, because every keystroke in a date field would otherwise be a
   * Chromium launch on a box with a budget of one. The fields move freely; the
   * picture only moves when somebody presses Draw.
   */
  const [asked, setAsked] = React.useState<LedgerWatchCardWindow | null>(null);

  const wanted: LedgerWatchCardWindow = { from: range.from, to: range.to };
  // NOT called `window`: that shadows the global inside this component, and the
  // next person to reach for `window.scrollTo` here would get a date range.
  const activeWindow = mode === 'range' ? asked : null;
  const pending =
    mode === 'range' &&
    (!asked || asked.from !== wanted.from || asked.to !== wanted.to);

  const cardQ = useLedgerWatchCard(
    dealerId,
    open && (mode === 'latest' || !!asked),
    activeWindow,
  );
  const share = useShareLedgerWatchCard();

  function chooseMode(next: CardMode) {
    setMode(next);
    // Leaving Dates does not forget them: an admin who flicks back to compare
    // should not have to retype the range they were just looking at.
    if (next === 'latest') return;
    setOpen(true);
  }

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">Card for the dealer</p>
            <p className="mt-0.5 text-sm text-text-muted">
              The last 4 entries outside the routine traffic, with their dates —
              as a PNG you can download or send into their chat. Or pick two
              dates and get everything between them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(true)}
              leftIcon={<ImageIcon width={14} height={14} strokeWidth={1.75} aria-hidden />}
            >
              Make the card
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => chooseMode('range')}
              leftIcon={<CalendarRange width={14} height={14} strokeWidth={1.75} aria-hidden />}
            >
              Pick dates
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /**
   * The mode switch and, in Dates, the fields and the Draw button.
   *
   * Rendered above every branch below — loading, error, empty and drawn — so an
   * admin can always change the window, including out of one that produced an
   * error or an empty card. A control that disappears while the thing it
   * controls is failing is how somebody gets stuck.
   */
  const controls = (
    <div className="grid gap-3">
      <SegmentedControl
        aria-label="Which card to make"
        fullWidthOnMobile={false}
        value={mode}
        onChange={chooseMode}
        options={[
          { value: 'latest', label: 'Latest 4' },
          { value: 'range', label: 'Chosen dates' },
        ]}
      />
      {mode === 'range' ? (
        <div className="grid gap-2 rounded-md border border-border bg-surface-subtle p-3">
          <DateRangeFilter
            value={range}
            onChange={setRange}
            label="Period on the card"
            maxRangeDays={CARD_WINDOW_MAX_DAYS}
            mobilePresets="menu"
            mobileCustomInSheet
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={pending ? 'primary' : 'secondary'}
              disabled={cardQ.isFetching}
              loading={cardQ.isFetching}
              onClick={() => setAsked(wanted)}
              leftIcon={<ImageIcon width={14} height={14} strokeWidth={1.75} aria-hidden />}
            >
              {/* The window the press will ACTUALLY draw, named in the button.
                  `DateRangeFilter` only emits a complete, clamped, in-order
                  pair, so while somebody is mid-type the pane still holds the
                  last good one — and a button reading "Draw these dates" over a
                  half-typed field is promising the wrong thing. */}
              Draw {formatDateRangeLabel(wanted)}
            </Button>
            {pending && asked ? (
              <p className="text-xs text-text-muted">
                Showing {formatDateRangeLabel(asked)} — press to redraw for{' '}
                {formatDateRangeLabel(wanted)}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  /** Wraps every state below, so the controls never leave the screen. */
  function shell(body: React.ReactNode) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          {controls}
          {body}
        </CardContent>
      </Card>
    );
  }

  if (mode === 'range' && !asked) {
    return shell(
      <p className="text-sm text-text-muted">
        Pick the two days you want on the card, then press Draw. Every open
        finding between them goes on it — what was not fuel, not a deposit and
        not a card sale — and the totals cover the whole period. Anything you
        have already ignored or resolved stays off, exactly as on the Latest
        card.
      </p>,
    );
  }

  if (cardQ.isLoading) {
    return shell(
      <>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64 w-full max-w-md" />
      </>,
    );
  }

  if (cardQ.isError || !cardQ.data) {
    return shell(
      <EmptyState
        icon={<AlertCircle width={20} height={20} strokeWidth={1.75} aria-hidden />}
        title="The card could not be drawn"
        description={
          cardQ.error instanceof ApiError
            ? cardQ.error.message
            : 'Try again in a moment — the server may be busy reading a portal.'
        }
        cta={
          <Button variant="secondary" size="sm" onClick={() => void cardQ.refetch()}>
            Try again
          </Button>
        }
      />,
    );
  }

  const card = cardQ.data;
  const empty = card.movements.length === 0;
  /**
   * The period the SERVER drew, never the one in the fields.
   *
   * The fields keep moving while an admin types; captioning the figures from
   * them would put September's dates over August's card — the exact fault this
   * product exists to catch, committed by the screen that reports it.
   */
  const drawnWindow = card.window;
  const truncated = card.movements.length < card.totalMovements;

  function sendIt() {
    share.mutate(
      { dealerId, window: drawnWindow },
      {
        onSuccess: (r) =>
          toast.success(
            r.alreadyShared
              ? 'This exact card has already gone to the dealer.'
              : 'Sent — it is in the dealer’s chat now.',
          ),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not send the card'),
      },
    );
  }

  /** One sentence saying what is on the card and what its figures cover. */
  function describe(): string {
    const drawn = formatDateTime(card.renderedAt);
    if (drawnWindow) {
      // "on 26 Aug 2026", not "between 26 Aug 2026 and 26 Aug 2026" — the card
      // itself makes this split, and a caption that phrased a one-day window
      // differently from the picture beside it would read as a fault in one of
      // them.
      const period = periodPhrase(drawnWindow);
      if (empty) return `Nothing outside the routine traffic ${period}, so there is nothing to send.`;
      const n = card.totalMovements;
      return truncated
        ? `${n} entries ${period}. The card shows the ${card.movements.length} most recent; its totals cover all ${n}. Drawn ${drawn}.`
        : `${n} ${n === 1 ? 'entry' : 'entries'} ${period}, with their dates. The totals cover the period. Drawn ${drawn}.`;
    }
    if (empty) return 'Nothing outside the routine traffic, so there is nothing to send.';
    return `The last ${card.movements.length} of ${card.totalMovements} ${
      card.totalMovements === 1 ? 'entry' : 'entries'
    }, with their dates. Drawn ${drawn}.`;
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        {controls}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">Card for the dealer</p>
            <p className="mt-0.5 text-sm text-text-muted">{describe()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* `downloadUrl`, never `viewUrl` + a `download` attribute: that
                attribute is ignored cross-origin, so the click would open the
                image in a tab instead of saving it. The disposition is signed
                into this URL. */}
            <DownloadButton
              url={card.downloadUrl}
              filename={card.filename}
              contentType={card.contentType}
              // `image`, so the admin shell routes it into the phone's gallery —
              // which is where a card somebody is about to forward belongs.
              kind="image"
              label="Download PNG"
              variant="secondary"
              size="sm"
            />
            <Button
              size="sm"
              onClick={sendIt}
              disabled={empty}
              loading={share.isPending}
              leftIcon={<Send width={14} height={14} strokeWidth={1.75} aria-hidden />}
            >
              Send to dealer
            </Button>
          </div>
        </div>

        {/* What is ON the card, in words. An admin approving something that goes
            to a dealer should not have to squint at a thumbnail. */}
        {!empty ? (
          <ul className="grid gap-1.5 rounded-md border border-border bg-surface-subtle p-3">
            {card.movements.map((m, i) => (
              <li
                // The index is in the key because a window card can carry thirty
                // rows, and two identical fees on one day — the same ₹1,062
                // charged twice on 12-08 — are a real shape on these ledgers.
                key={`${m.date}-${m.titleEn}-${m.amount}-${i}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2 text-sm"
              >
                <span className="tabular-nums text-text-muted">{formatDmy(m.date)}</span>
                <span className="min-w-0 truncate text-text">{m.titleEn}</span>
                <span
                  className={cn(
                    'tabular-nums font-medium',
                    m.direction === 'CHARGED' ? 'text-danger' : 'text-success',
                  )}
                >
                  {inrFormat(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <img
          src={card.viewUrl}
          alt="The dealer's other-movements card"
          className="w-full max-w-md rounded-md border border-border"
          loading="lazy"
        />
      </CardContent>
    </Card>
  );
}
