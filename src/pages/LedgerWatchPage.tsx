import {
  AlertCircle,
  Check,
  EyeOff,
  RotateCw,
  ScanLine,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  FilterBar,
  HowThisWorks,
  Label,
  MobileCardList,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useLedgerFlagInbox,
  useLedgerMovementRules,
  useRunLedgerWatchSweep,
  useUpdateLedgerFlag,
  useUpdateLedgerMovementRule,
  type LedgerFlagFilters,
} from '@/hooks/api/useLedgerWatch';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDmy, inrFormat } from '@/lib/format';
import {
  dealerCodeLabel,
  LEDGER_FLAG_KINDS,
  LEDGER_FLAG_STATUSES,
  type LedgerFlagDto,
  type LedgerFlagKind,
  type LedgerFlagStatus,
  type LedgerMovementRuleDto,
} from '@dk/shared';

import {
  FLAG_KIND_LABEL,
  FLAG_SEVERITY_LABEL,
  FLAG_STATUS_LABEL,
  flagSeverityIntent,
  flagStatusIntent,
  MOVEMENT_CLASS_LABEL,
  movementClassIntent,
  rollupByDealer,
  sortFlags,
} from './dealers/ledgerWatchFormat';

/**
 * Ledger watch, across every dealer: the findings inbox.
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * A PAD ledger is meant to be a pair — fuel bought, money deposited. Every
 * other line on it moves the outstanding, and therefore the due amount and the
 * due date, with nobody told: interest on an overdue, a licence-fee recovery, a
 * participation fee, a fleet-card settlement clawed back. This is the one place
 * where all of those, for all eleven outlets, are in front of one person.
 *
 * ALERT FIRST, ALWAYS
 * -------------------
 * The three ALERT kinds — a line nobody can name, a class posted on a side it
 * has never used, a balance that will not reconcile — mean the ledger itself is
 * saying something impossible. One of those outranks any number of ordinary
 * ₹1,062 fees however fresh they are, so severity leads the sort and the dealer
 * code leads the row. Both rules live in `dealers/ledgerWatchFormat.ts` where
 * they can be read without running anything, because this app has no test
 * runner.
 *
 * MODELLED ON `KavachWorkQueuePage`
 * --------------------------------
 * Same shape and the same hard-won behaviours: filters collapse into one
 * button below md, the URL carries them so a reload keeps them, `replace` and
 * not `push` so the phone's Back button still leaves the screen, and a handled
 * row stays on screen marked rather than pulling the list up under the thumb.
 */

/** The 44px-tall action pair, in one place: the row and the card use both. */
type FlagAction = 'ACKNOWLEDGED' | 'IGNORED';

const ACTION_LABEL: Record<FlagAction, string> = {
  ACKNOWLEDGED: 'Acknowledged',
  IGNORED: 'Ignored',
};

/**
 * The filter, read off the URL.
 *
 * Anything unrecognised is dropped rather than passed through, so a stale link
 * cannot put the list into a state the controls above it cannot display.
 */
function filtersFromParams(params: URLSearchParams): LedgerFlagFilters {
  const filters: LedgerFlagFilters = {};
  const status = params.get('status');
  if (status && (LEDGER_FLAG_STATUSES as readonly string[]).includes(status)) {
    filters.status = status as LedgerFlagStatus;
  }
  const kind = params.get('kind');
  if (kind && (LEDGER_FLAG_KINDS as readonly string[]).includes(kind)) {
    filters.kind = kind as LedgerFlagKind;
  }
  return filters;
}

function paramsFromFilters(filters: LedgerFlagFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.kind) params.set('kind', filters.kind);
  return params;
}

export function LedgerWatchPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // Seeded once from the URL; after that the URL follows the controls and not
  // the other way round, so a re-render can never fight a half-made choice.
  const [filters, setFilters] = React.useState<LedgerFlagFilters>(() => {
    const fromUrl = filtersFromParams(searchParams);
    // No status in the URL means the working default: what still needs
    // somebody. An inbox that opened on every finding ever raised would be a
    // history, and nobody works down a history.
    return fromUrl.status || fromUrl.kind ? fromUrl : { status: 'OPEN' };
  });
  const [handled, setHandled] = React.useState<Record<string, FlagAction>>({});

  const inboxQ = useLedgerFlagInbox(filters);
  const updateFlag = useUpdateLedgerFlag();

  const flags = React.useMemo(
    () => sortFlags(inboxQ.data?.pages.flatMap((p) => p.rows) ?? []),
    [inboxQ.data],
  );
  // Both figures come from the SERVER's `counts`, which it computes over the
  // whole filter rather than the loaded page — and, for the severity tallies,
  // deliberately without the severity filter applied, so the header can say how
  // many alerts exist while the list shows only the notices an admin narrowed
  // to. Counting the loaded rows instead was the earlier version, and it
  // undercounted the moment a filter matched more than one page.
  const counts = inboxQ.data?.pages[0]?.counts;
  const total = counts?.total ?? 0;
  const alertCount = counts?.alerts ?? 0;
  const rollup = React.useMemo(() => rollupByDealer(flags), [flags]);
  const sweep = useRunLedgerWatchSweep();

  function patchFilters(patch: Partial<LedgerFlagFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    // `replace`, not push: on a phone the hardware Back button is the only way
    // off a screen, and one history entry per dropdown change turns it into an
    // undo stack the admin has to walk backwards through to leave.
    setSearchParams(paramsFromFilters(next), { replace: true });
  }

  function clearFilters() {
    setFilters({});
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  function refresh() {
    setHandled({});
    void inboxQ.refetch();
  }

  /**
   * Re-run detection across every outlet.
   *
   * The toast reports what actually happened rather than "done", because the two
   * things this does that nothing else can are both invisible until the list
   * reloads: it compares each outlet's charges against its peers, and it asks
   * for a name for any line the catalogue cannot place. A sweep that found
   * nothing new is a real and useful answer, and it has to be said out loud —
   * otherwise pressing the button looks identical whether it worked or not.
   */
  function runSweep() {
    setHandled({});
    sweep.mutate(
      {},
      {
        onSuccess: (r) => {
          const parts: string[] = [];
          if (r.flagsInserted > 0) parts.push(`${r.flagsInserted} new`);
          if (r.flagsWithdrawn > 0) parts.push(`${r.flagsWithdrawn} closed`);
          const written = r.proposals.filter((p) => p.status === 'written').length;
          if (written > 0) parts.push(`${written} waiting to be named`);
          if (r.failed > 0) parts.push(`${r.failed} outlet${r.failed === 1 ? '' : 's'} could not be read`);
          toast.success(
            parts.length > 0
              ? `Checked ${r.dealers} outlets — ${parts.join(', ')}.`
              : `Checked ${r.dealers} outlets — nothing new.`,
          );
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not check the outlets',
          ),
      },
    );
  }

  function act(flag: LedgerFlagDto, status: FlagAction) {
    updateFlag.mutate(
      { id: flag.id, body: { status } },
      {
        onSuccess: () => {
          setHandled((prev) => ({ ...prev, [flag.id]: status }));
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not update the flag',
          ),
      },
    );
  }

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.status) {
    activeChips.push({
      key: 'status',
      label: FLAG_STATUS_LABEL[filters.status],
      onRemove: () => patchFilters({ status: undefined }),
    });
  }
  if (filters.kind) {
    activeChips.push({
      key: 'kind',
      label: FLAG_KIND_LABEL[filters.kind],
      onRemove: () => patchFilters({ kind: undefined }),
    });
  }
  const filtersActive = activeChips.length > 0;
  const partial = flags.length > 0 && flags.length < total;

  return (
    <div>
      <PageHeader
        title="Ledger watch"
        subtitle="Every movement on a dealer's PAD ledger that is not the routine buy-and-pay pair. Ledger watch observes; it never changes a due amount or a due date."
        actions={
          <>
            {/* THE COUNT IS THE SERVER'S, NOT THE PAGE'S. Both figures cover
                the whole filter, not the rows currently loaded, so the badge
                states the alert count unconditionally — an earlier version
                derived it from the loaded rows and had to suppress itself
                whenever a second page existed, which meant the header went
                quiet on exactly the busy days it is for. */}
            <Badge
              intent={
                alertCount > 0 ? 'danger' : total > 0 ? 'warning' : 'success'
              }
              className="h-7 px-3"
            >
              {alertCount > 0
                ? `${alertCount} ${alertCount === 1 ? 'alert' : 'alerts'}`
                : filters.status === 'OPEN'
                  ? `${total} open`
                  : `${total} ${total === 1 ? 'finding' : 'findings'}`}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              loading={inboxQ.isRefetching}
              aria-label="Refresh the findings"
              leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
            >
              Refresh
            </Button>
            {/* TWO DIFFERENT ACTIONS, AND THE LABELS HAVE TO SAY SO. "Refresh"
                re-reads what is already stored. "Check all outlets" re-runs
                detection across the estate: it is the only thing that compares
                one outlet's charges against the others', and the only thing
                that asks for a name for a line nobody can place. It reads every
                dealer's ledger, so it is a button somebody presses rather than
                something that fires on load. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={runSweep}
              loading={sweep.isPending}
              leftIcon={<Users width={14} height={14} strokeWidth={1.75} />}
            >
              Check all outlets
            </Button>
            {/* Icon: the badge and two buttons already fill this row. */}
            <HowThisWorks surface="admin-ledger-watch" label="Ledger watch" variant="icon" />
          </>
        }
      />

      <FilterBar
        className="mb-4"
        columnsAtMd={2}
        activeCount={activeChips.length}
        onClear={clearFilters}
        chips={activeChips.map((chip) => (
          <Button
            key={chip.key}
            variant="secondary"
            size="sm"
            onClick={chip.onRemove}
            rightIcon={<X width={14} height={14} strokeWidth={1.75} />}
          >
            {chip.label}
          </Button>
        ))}
      >
        <div>
          <Label htmlFor="ledger-watch-status">Status</Label>
          <Select
            id="ledger-watch-status"
            value={filters.status ?? ''}
            onChange={(e) =>
              patchFilters({
                status: (e.target.value || undefined) as
                  | LedgerFlagStatus
                  | undefined,
              })
            }
          >
            <option value="">Every status</option>
            {LEDGER_FLAG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FLAG_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="ledger-watch-kind">Kind</Label>
          <Select
            id="ledger-watch-kind"
            value={filters.kind ?? ''}
            onChange={(e) =>
              patchFilters({
                kind: (e.target.value || undefined) as
                  | LedgerFlagKind
                  | undefined,
              })
            }
          >
            <option value="">Every kind</option>
            {LEDGER_FLAG_KINDS.map((k) => (
              <option key={k} value={k}>
                {FLAG_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      {/* The roll-up covers the flags LOADED, not the whole filter — the list
          is keyset-paginated and cannot be grouped server-side without reading
          all of it. Saying so is the difference between a partial count and a
          wrong one. */}
      {partial ? (
        <Callout intent="warning" className="mb-4">
          Showing {flags.length} of {total}. Worst-first ordering and the
          per-outlet counts below both cover only what is loaded, so an alert on
          a later page will move up the list when you load it.
        </Callout>
      ) : null}

      {rollup.length > 1 ? <DealerRollup rows={rollup} /> : null}

      <Card>
        <CardContent padding="none" className="md:p-4">
          {inboxQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : inboxQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the findings"
              description={
                inboxQ.error instanceof ApiError
                  ? inboxQ.error.message
                  : 'Please try again.'
              }
              cta={
                <Button
                  onClick={() => void inboxQ.refetch()}
                  leftIcon={
                    <RotateCw width={16} height={16} strokeWidth={1.75} />
                  }
                >
                  Try again
                </Button>
              }
            />
          ) : flags.length === 0 ? (
            <EmptyState
              icon={<ScanLine width={28} height={28} strokeWidth={1.75} />}
              title={
                filtersActive ? 'Nothing matches these filters' : 'Nothing open'
              }
              description={
                filtersActive
                  ? 'Every finding under this filter has been dealt with.'
                  : 'Every movement outside the routine pair has been looked at, across every outlet.'
              }
              cta={
                filtersActive ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              {/* Desktop table (≥ md). `minWidth` guarantees the wrapper's own
                  horizontal scroller engages instead of seven columns crushing
                  each other — the page body never scrolls sideways. */}
              <div className="hidden md:block">
                <Table minWidth="64rem">
                  <THead>
                    <TRow>
                      <TH>Outlet</TH>
                      <TH>Severity</TH>
                      <TH>Finding</TH>
                      <TH>Date</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Status</TH>
                      <TH />
                    </TRow>
                  </THead>
                  <TBody>
                    {flags.map((flag) => {
                      const mark = handled[flag.id];
                      const status = mark ?? flag.status;
                      return (
                        <TRow
                          key={flag.id}
                          className={cn(mark && 'opacity-60')}
                        >
                          <TD className="whitespace-nowrap font-mono font-medium">
                            {/* A dealer IS its code, so it leads — and it is a
                                link, because the answer to almost every finding
                                is "open that outlet's ledger". */}
                            <Link
                              className="hover:underline"
                              to={`/dealers/${flag.dealerId}?tab=data-vault&vault=ledger-watch`}
                            >
                              {dealerCodeLabel(flag.dealerCode)}
                            </Link>
                          </TD>
                          <TD>
                            <Badge intent={flagSeverityIntent(flag.severity)}>
                              {FLAG_SEVERITY_LABEL[flag.severity]}
                            </Badge>
                          </TD>
                          <TD>
                            <span className="block font-medium text-text">
                              {flag.titleEn}
                            </span>
                            <span className="mt-0.5 block text-xs text-text-muted">
                              {flag.detailEn}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge
                                intent={movementClassIntent(flag.movementClass)}
                              >
                                {MOVEMENT_CLASS_LABEL[flag.movementClass]}
                              </Badge>
                              <span className="text-xs text-text-subtle">
                                {FLAG_KIND_LABEL[flag.kind]}
                              </span>
                            </span>
                          </TD>
                          <TD className="whitespace-nowrap text-text-muted">
                            {formatDmy(flag.date)}
                          </TD>
                          <TD className="whitespace-nowrap text-right tabular-nums">
                            {inrFormat(flag.amount)}
                          </TD>
                          <TD>
                            <Badge intent={flagStatusIntent(status)}>
                              {mark
                                ? ACTION_LABEL[mark]
                                : FLAG_STATUS_LABEL[status]}
                            </Badge>
                          </TD>
                          <TD className="text-right">
                            {mark || flag.status !== 'OPEN' ? null : (
                              <span className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={updateFlag.isPending}
                                  onClick={() => act(flag, 'ACKNOWLEDGED')}
                                  aria-label="Acknowledge this finding"
                                  title="Acknowledge"
                                >
                                  <Check
                                    width={14}
                                    height={14}
                                    strokeWidth={1.75}
                                  />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={updateFlag.isPending}
                                  onClick={() => act(flag, 'IGNORED')}
                                  aria-label="Ignore this finding"
                                  title="Ignore"
                                >
                                  <EyeOff
                                    width={14}
                                    height={14}
                                    strokeWidth={1.75}
                                  />
                                </Button>
                              </span>
                            )}
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md). The outlet code and the severity lead
                  the card, the sentence is the body, and the two actions sit in
                  the footer — a card cannot be one big tap target AND hold
                  buttons of its own. */}
              <MobileCardList
                variant="rows"
                cards={flags.map((flag) => {
                  const mark = handled[flag.id];
                  const status = mark ?? flag.status;
                  const actionable = !mark && flag.status === 'OPEN';
                  return {
                    key: flag.id,
                    tone: mark ? ('muted' as const) : ('default' as const),
                    primary: (
                      <span className="block break-words font-medium text-text">
                        <Link
                          className="font-mono"
                          to={`/dealers/${flag.dealerId}?tab=data-vault&vault=ledger-watch`}
                        >
                          {dealerCodeLabel(flag.dealerCode)}
                        </Link>{' '}
                        · {flag.titleEn}
                      </span>
                    ),
                    primaryRight: (
                      <Badge intent={flagSeverityIntent(flag.severity)}>
                        {FLAG_SEVERITY_LABEL[flag.severity]}
                      </Badge>
                    ),
                    secondary: (
                      <span className="block break-words text-xs text-text-muted">
                        {flag.detailEn}
                      </span>
                    ),
                    meta: (
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span>{formatDmy(flag.date)} ·</span>
                        <span className="tabular-nums">
                          {inrFormat(flag.amount)} ·
                        </span>
                        <span>{FLAG_KIND_LABEL[flag.kind]}</span>
                        {mark || status !== 'OPEN' ? (
                          <Badge intent={flagStatusIntent(status)}>
                            {mark ? ACTION_LABEL[mark] : FLAG_STATUS_LABEL[status]}
                          </Badge>
                        ) : null}
                      </span>
                    ),
                    actionsLayout: 'wrap' as const,
                    actions: actionable ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={updateFlag.isPending}
                          onClick={() => act(flag, 'ACKNOWLEDGED')}
                          leftIcon={
                            <Check width={14} height={14} strokeWidth={1.75} />
                          }
                        >
                          Acknowledge
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updateFlag.isPending}
                          onClick={() => act(flag, 'IGNORED')}
                          leftIcon={
                            <EyeOff width={14} height={14} strokeWidth={1.75} />
                          }
                        >
                          Ignore
                        </Button>
                      </>
                    ) : undefined,
                  };
                })}
              />

              {inboxQ.hasNextPage ? (
                <div className="flex justify-center p-4">
                  <Button
                    variant="secondary"
                    loading={inboxQ.isFetchingNextPage}
                    onClick={() => void inboxQ.fetchNextPage()}
                  >
                    Load more ({total - flags.length} left)
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <PendingRules />
    </div>
  );
}

/**
 * Which outlet is worst, before anybody scrolls.
 *
 * Not a filter and not a link target — a statement. Eleven outlets produce a
 * list long enough that "who do I ring" is a real question, and the answer is
 * two numbers per dealer: how many alerts, and how many lines nobody could
 * name. Hidden entirely when only one outlet has findings, where it would just
 * repeat the list underneath it.
 */
function DealerRollup({
  rows,
}: {
  rows: ReturnType<typeof rollupByDealer>;
}) {
  return (
    <Card className="mb-4">
      <CardContent padding="none" className="p-3 md:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          By outlet, worst first
        </p>
        <ul className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <li key={row.dealerId}>
              <Link
                to={`/dealers/${row.dealerId}?tab=data-vault&vault=ledger-watch`}
                className="tap-target flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm hover:border-border-strong"
              >
                <span className="font-mono font-medium text-text">
                  {dealerCodeLabel(row.dealerCode)}
                </span>
                {row.alerts > 0 ? (
                  <Badge intent="danger">{row.alerts} alert</Badge>
                ) : null}
                {row.unknownEntries > 0 ? (
                  <Badge intent="warning">{row.unknownEntries} unnamed</Badge>
                ) : null}
                <span className="tabular-nums text-xs text-text-subtle">
                  {row.openFlags} open
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Rules waiting for a person.
 *
 * A signature nobody has a rule for raises an `UNKNOWN_ENTRY` alert on every
 * row that carries it, and the fix is not to dismiss the alerts — it is to name
 * the movement once. A proposal classifies nothing while it is inactive, so
 * this card is the only place that inertia gets broken.
 *
 * THERE IS NO REJECT BUTTON, DELIBERATELY. A proposal that is never confirmed
 * is already rejected: it is inactive, it classifies nothing, and the findings
 * it would have named stay open. A button that wrote "still inactive" would
 * look like a decision and record none.
 */
function PendingRules() {
  const toast = useToast();
  const rulesQ = useLedgerMovementRules();
  const updateRule = useUpdateLedgerMovementRule();

  if (rulesQ.isLoading || rulesQ.isError || !rulesQ.data) return null;

  // `.rows`, not the response itself: `GET /ledger-watch/rules` answers with a
  // `{ total, rows }` envelope. Calling `.filter` on that object threw on every
  // render of this page, and because the API client casts without checking,
  // nothing said so until the whole screen hit its error boundary.
  const pending = rulesQ.data.rows.filter((r) => !r.active);
  const activeCount = rulesQ.data.rows.length - pending.length;

  if (pending.length === 0) {
    return (
      <p className="mt-4 text-xs text-text-subtle">
        {activeCount} classification {activeCount === 1 ? 'rule' : 'rules'}{' '}
        active, none waiting for a decision.
      </p>
    );
  }

  function confirmRule(rule: LedgerMovementRuleDto) {
    updateRule.mutate(
      { id: rule.id, body: { active: true } },
      {
        onSuccess: () =>
          toast.success(
            `"${rule.titleEn}" now classifies every row that matches it.`,
          ),
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not confirm the rule',
          ),
      },
    );
  }

  return (
    <Card className="mt-4">
      <CardContent padding="none" className="md:p-4">
        <CardHeader align="center" padding="comfortable">
          <p className="text-base font-semibold text-text">
            Rules waiting for a decision
          </p>
          <p className="text-sm text-text-muted">
            A proposed name for a ledger line nobody has seen before. It
            classifies nothing until you confirm it.
          </p>
        </CardHeader>
        <ul className="divide-y divide-border">
          {pending.map((rule) => (
            <li key={rule.id} className="grid gap-2 p-3 md:p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge intent={movementClassIntent(rule.movementClass)}>
                  {MOVEMENT_CLASS_LABEL[rule.movementClass]}
                </Badge>
                <span className="text-xs text-text-subtle">
                  {rule.direction === 'CHARGED'
                    ? 'money off the dealer'
                    : 'money to the dealer'}
                </span>
              </div>
              <p className="break-words font-medium text-text">{rule.titleEn}</p>
              {/* The portal's own words, verbatim and unformatted — the one
                  thing a person can check the proposed name against. */}
              <p className="break-words font-mono text-xs text-text-muted">
                {rule.txnType} · {rule.signature} · {rule.side}
              </p>
              {rule.sampleDoc ? (
                <p className="break-words font-mono text-xs text-text-subtle">
                  {rule.sampleDoc}
                </p>
              ) : null}
              {rule.rowsSeen ? (
                <p className="text-xs text-text-subtle">
                  {rule.rowsSeen.toLocaleString('en-IN')}{' '}
                  {rule.rowsSeen === 1 ? 'row' : 'rows'}
                  {rule.minAmount != null && rule.maxAmount != null
                    ? `, ${inrFormat(rule.minAmount)} – ${inrFormat(rule.maxAmount)}`
                    : ''}
                </p>
              ) : null}
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={updateRule.isPending}
                  onClick={() => confirmRule(rule)}
                  leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
                >
                  Confirm this name
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
