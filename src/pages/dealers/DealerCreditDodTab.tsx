import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  History,
  ReceiptText,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  InfoBadge,
  Input,
  Label,
  MobileCardList,
  SegmentedControl,
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
  useCreditDodLedger,
  useCreditDodQuota,
  useCreditDodSnapshots,
} from '@/hooks/api/useCreditDod';
import { useDealerServicesQuery, useRunNow } from '@/hooks/api/useDealerServices';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatDmy, inrFormat } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { CreditDodQuota, CreditDodSnapshotRecord } from '@/types/creditDod';
import type { Dealer, ServiceRun } from '@dk/shared';

import { CreditDodHelpCta } from './CreditDodHelpCta';
import { CreditDodReportCard } from './CreditDodReportCard';
import { LedgerWatchBand } from './LedgerWatchBand';

interface Props {
  dealer: Dealer;
}

const CREDIT_DOD_PLUGIN = 'credit-dod-monitoring';

/** ₹ amount, or an em-dash placeholder for empty/zero cells. */
function money(n: number | null | undefined): string {
  return n ? inrFormat(n) : '-';
}

/** Two-digit pad. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` (from a date input) → `dd-mm-yyyy` (the SDMS / asOf format). */
function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

const STATE_INTENT: Record<string, Intent> = {
  due: 'warning',
  advance: 'success',
  clear: 'neutral',
};

/**
 * Report history sits directly under the generate controls: an admin comes to
 * this tab to get a report out to a dealer, and the maintained ledger is the
 * evidence behind it, not the headline. The PAD ledger follows.
 */
export function DealerCreditDodTab({ dealer }: Props) {
  return (
    <div className="grid gap-4">
      {/* ABOVE the generate controls, deliberately. This screen exists to get a
          card out to a dealer saying "deposit ₹X by the 6th", and the movements
          the band lists — a fee, an interest posting, a licence-fee recovery —
          are exactly what moved that ₹X without anybody being told. Placed
          below the controls it would be read after the report had gone out. */}
      <LedgerWatchBand dealerId={dealer.id} />
      <GenerateCard dealerId={dealer.id} />
      <SnapshotHistoryCard dealerId={dealer.id} />
      <LedgerCard dealerId={dealer.id} />
    </div>
  );
}

/** "2 of 3 generations left · resets 4:15 PM", or nothing for a super-admin. */
function QuotaLine({ quota }: { quota: CreditDodQuota | undefined }) {
  if (!quota || quota.exempt) return null;
  const exhausted = quota.remaining === 0;
  return (
    <span className={exhausted ? 'font-medium text-warning' : 'text-text-subtle'}>
      {exhausted
        ? 'No generations left this hour'
        : `${quota.remaining} of ${quota.limit} generation${
            quota.limit === 1 ? '' : 's'
          } left this hour`}
      {exhausted && quota.resetAt
        ? ` · next slot ${formatDateTime(quota.resetAt)}`
        : ''}
    </span>
  );
}

/**
 * Generate a report — today's, or reconstructed as of a past date. A back-dated
 * run is stateless (it never touches the maintained ledger); today's run is the
 * incremental one. Both are throttled per dealer, because both are a live SDMS
 * login.
 */
function GenerateCard({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: services } = useDealerServicesQuery(dealerId);
  const creditDodDs = (services ?? []).find(
    (s) => s.serviceId === CREDIT_DOD_PLUGIN,
  );
  const runNow = useRunNow(dealerId);
  const { data: quota } = useCreditDodQuota(dealerId);
  const outOfQuota = !!quota && !quota.exempt && quota.remaining === 0;

  const [date, setDate] = React.useState('');
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'today' | 'backdated'>('today');

  // The dealer detail page reuses this component across dealers instead of
  // remounting it, so a run started for dealer A would otherwise keep polling
  // after the user navigates to dealer B — and then invalidate B's caches and
  // toast about B's report. Drop the in-flight run when the dealer changes; the
  // run itself carries on server-side and shows up in A's Report history.
  const watchedDealer = React.useRef(dealerId);
  if (watchedDealer.current !== dealerId) {
    watchedDealer.current = dealerId;
    if (activeRunId !== null) setActiveRunId(null);
  }

  const now = new Date();
  const maxDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // Poll the triggered run until it finishes, then refresh the snapshot history.
  const runPoll = useQuery({
    queryKey: ['run', activeRunId],
    queryFn: () => api.get<ServiceRun>(`/runs/${activeRunId}`),
    enabled: !!activeRunId,
    // Give up rather than retry forever: the effect below only releases the
    // "Generating…" state on a terminal status, so a permanently failing poll
    // would wedge the card until a page reload.
    retry: 2,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === 'SUCCESS' || st === 'FAILED' ? false : 3000;
    },
  });

  React.useEffect(() => {
    if (!activeRunId || !runPoll.isError) return;
    // We can't see the run any more, but it is still running server-side.
    setActiveRunId(null);
    void qc.invalidateQueries({ queryKey: ['creditDodSnapshots', dealerId] });
    toast.info(
      'Lost track of that run. It is probably still finishing — refresh Report history in a minute.',
    );
  }, [runPoll.isError, activeRunId, dealerId, qc, toast]);

  React.useEffect(() => {
    const st = runPoll.data?.status;
    if (!activeRunId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    if (st === 'SUCCESS') {
      void qc.invalidateQueries({ queryKey: ['creditDodSnapshots', dealerId] });
      void qc.invalidateQueries({ queryKey: ['creditDodLedger', dealerId] });
      // The Data Vault's PAD digest is cross-dealer, so it has no dealer in its
      // key and would not be caught by the two above. A run moves the row count,
      // the balance and "Last synced" — and "when was this last reconciled" is
      // the entire point of that screen, so an admin who walks back to it must
      // not be shown figures from before the run they just watched succeed.
      void qc.invalidateQueries({ queryKey: ['creditDodVault'] });
      toast.success('Report ready — it is at the top of Report history below.');
    } else {
      // Name the dealer's own tab, not the global /runs page — that one is
      // super-admin-only now, so it would be a dead end for a plain admin.
      toast.error("The run failed. Open this dealer's Run history tab for details.");
    }
    setActiveRunId(null);
  }, [runPoll.data?.status, activeRunId, dealerId, qc, toast]);

  const busy = runNow.isPending || activeRunId !== null;

  async function generate(asOf?: string) {
    if (!creditDodDs) {
      toast.error('Attach the Credit & DOD service to this dealer first.');
      return;
    }
    try {
      const { runId } = await runNow.mutateAsync({
        dsId: creditDodDs.id,
        body: asOf ? { configOverride: { asOf } } : {},
      });
      setActiveRunId(runId);
      void qc.invalidateQueries({ queryKey: ['creditDodQuota', dealerId] });
      toast.success(
        asOf
          ? `Generating the report as of ${formatDmy(asOf)} — it'll appear below shortly.`
          : "Generating today's report — it'll appear below shortly.",
      );
    } catch (err) {
      // A refused generation still changes what the quota line should say.
      void qc.invalidateQueries({ queryKey: ['creditDodQuota', dealerId] });
      toast.error(
        err instanceof ApiError ? err.message : 'Could not start the run',
      );
    }
  }

  function generateBackdated() {
    if (!date) {
      toast.error('Pick a date to generate the report for.');
      return;
    }
    if (date > maxDate) {
      toast.error('Pick a date in the past (or today).');
      return;
    }
    void generate(isoToDmy(date));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">
              Generate a Credit &amp; DOD report
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Each report is a live login to the dealer&apos;s IndianOil SDMS
              account, so it takes about a minute.
            </p>
          </div>
          <CreditDodHelpCta />
        </div>

        {/* Was a hand-rolled 32px pill pair 4px apart — the gate to back-dated
            generation, on a target a thumb cannot reliably hit. The shared
            control is 44px below md and the compact row again at md. */}
        <SegmentedControl
          aria-label="Report date"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'today',
              label: 'Today',
              icon: <RefreshCw width={15} height={15} strokeWidth={1.75} />,
            },
            {
              value: 'backdated',
              label: 'Past date',
              icon: <CalendarClock width={15} height={15} strokeWidth={1.75} />,
            },
          ]}
        />

        {mode === 'today' ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-md text-sm text-text-muted">
              Pulls everything new from the portal, updates the maintained
              ledger, and produces today&apos;s card.
            </p>
            <Button
              className="w-full md:w-auto"
              onClick={() => void generate()}
              loading={busy}
              disabled={!creditDodDs || outOfQuota}
            >
              Generate now
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-md text-sm text-text-muted">
              Reconstruct the card as of any past date. This runs without
              touching the live ledger.
            </p>
            {/* 176px of date input + 8px + ~110px of button is 294px against
                the ~296px a Card offers at 360px — flush before Android's own
                date control adds its intrinsic width, and `main` is
                `overflow-x-hidden`, so Generate's right edge was CLIPPED rather
                than scrollable. Stacked below md; the same row at md. */}
            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:flex-row md:items-end">
              <div>
                <Label htmlFor="cd-asof">As-of date</Label>
                <Input
                  id="cd-asof"
                  type="date"
                  value={date}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={busy || !creditDodDs}
                  className="w-full md:w-44"
                />
              </div>
              <Button
                className="w-full md:w-auto"
                onClick={generateBackdated}
                loading={busy}
                disabled={!creditDodDs || outOfQuota}
              >
                Generate
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs">
        {!creditDodDs ? (
          <span className="text-text-subtle">
            The Credit &amp; DOD service isn&apos;t attached to this dealer yet.
          </span>
        ) : busy ? (
          <span className="text-text-muted">
            Generating… a live capture takes about a minute.
          </span>
        ) : (
          <span className="text-text-subtle">
            Reports are never sent automatically — you review, then share.
          </span>
        )}
        <QuotaLine quota={quota} />
      </div>
    </Card>
  );
}

function LedgerCard({ dealerId }: { dealerId: string }) {
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCreditDodLedger(dealerId, { limit: 50 });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Card>
      <CardContent padding="none" className="md:p-4">
        {/* `flex-wrap`, as the Report history header two components down already
            has. Without it the transaction-count Badge — a hard 22px box — was
            squeezed at 360px until its own label wrapped inside it and clipped. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">
              Maintained PAD ledger
            </p>
            <p className="text-sm text-text-muted">
              Accumulated transactions reconstructed from SDMS statements.
            </p>
          </div>
          {total > 0 ? (
            <Badge intent="neutral" className="tabular-nums">
              {total.toLocaleString('en-IN')} txns
            </Badge>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load ledger"
            description={
              error instanceof ApiError
                ? error.message
                : 'Something went wrong while loading the ledger.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText width={28} height={28} strokeWidth={1.75} />}
            title="No ledger yet"
            description="Transactions appear here once the Credit & DOD service has run for this dealer."
          />
        ) : (
          <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Type</TH>
                    <TH>Terminal</TH>
                    <TH className="text-right">Debit</TH>
                    <TH className="text-right">Credit</TH>
                    <TH className="text-right">Balance</TH>
                  </TRow>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TRow key={r.seq}>
                      <TD className="whitespace-nowrap text-text-muted">
                        {formatDmy(r.date)}
                      </TD>
                      <TD className="font-medium">{r.doc || '-'}</TD>
                      <TD className="text-text-muted">{r.txnType || '-'}</TD>
                      <TD className="text-text-muted">{r.terminal || '-'}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {money(r.debit)}
                      </TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {money(r.credit)}
                      </TD>
                      <TD
                        className={
                          'whitespace-nowrap text-right font-medium tabular-nums ' +
                          (r.balance < 0 ? 'text-green-600' : 'text-text')
                        }
                      >
                        {inrFormat(r.balance)}
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Mobile card-stack (< md). This was the one table in the area with
                no phone form at all: about two and a half of its seven columns
                fit at 360px, so Balance — the running figure the whole ledger
                exists to show — sat off the right edge of a nested scroller
                with no sticky Date column to say which transaction you had
                reached. A card, not a frozen-column table: a ledger row is read
                one at a time, not compared across. */}
            <MobileCardList
              className="p-3"
              cards={rows.map((r) => ({
                key: String(r.seq),
                primary: (
                  <span className="block break-words font-medium text-text">
                    {r.doc || 'No document reference'}
                  </span>
                ),
                primaryRight: (
                  <span
                    className={
                      'whitespace-nowrap text-sm font-semibold tabular-nums ' +
                      (r.balance < 0 ? 'text-green-600' : 'text-text')
                    }
                  >
                    {inrFormat(r.balance)}
                  </span>
                ),
                secondary: (
                  <span className="text-xs">{formatDmy(r.date)}</span>
                ),
                kv: [
                  { label: 'Debit', value: money(r.debit), numeric: true },
                  { label: 'Credit', value: money(r.credit), numeric: true },
                  // "Balance" repeated as a labelled row: the figure in the
                  // right rail above is a headline, and a negative one means
                  // the dealer is in credit — which a bare red/green number
                  // does not say.
                  {
                    label: r.balance < 0 ? 'Balance (in credit)' : 'Balance owed',
                    value: inrFormat(Math.abs(r.balance)),
                    numeric: true,
                  },
                ],
                meta: (
                  <span>
                    {[r.txnType, r.terminal].filter(Boolean).join(' · ') ||
                      'No type or terminal recorded'}
                  </span>
                ),
              }))}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
              <span className="text-xs text-text-subtle">
                Showing {rows.length.toLocaleString('en-IN')} of{' '}
                {total.toLocaleString('en-IN')}
              </span>
              {hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  Load more
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Marks a report whose sums the portal changed after the fact: transactions it
 * published late, or — worse — a report already sent to the dealer that those
 * transactions have made wrong. Scanning history should show which reports were
 * revised without opening every one.
 */
function LateEntriesBadge({
  snapshot,
  className,
}: {
  snapshot: CreditDodSnapshotRecord;
  className?: string;
}) {
  const { backdatedRows, supersededSharedAt } = snapshot;
  if (!supersededSharedAt && backdatedRows === 0) return null;
  // The badge is one word; everything it means was in `title`, and a phone has
  // no hover. `InfoBadge` keeps the desktop tooltip byte for byte and, below
  // md, opens the same sentence in a sheet.
  return (
    <InfoBadge
      className={className}
      intent={supersededSharedAt ? 'warning' : 'neutral'}
      label="Late entries"
      sheetTitle="Late entries"
      detail={
        supersededSharedAt
          ? `The report shared on ${formatDateTime(
              supersededSharedAt,
            )} was worked out without transactions the portal published later.`
          : `Includes ${backdatedRows} transaction${
              backdatedRows === 1 ? '' : 's'
            } the portal published after their own date.`
      }
    />
  );
}

/**
 * A deadline that has already gone by. Replaces the `state` badge rather than
 * sitting beside it: `state` reads "due" whether the deadline is next week or
 * was three weeks ago, and in a scannable list that is the one distinction that
 * matters. Amber while the miss is still inside IndianOil's publishing lag —
 * the dealer may have paid on time — and red once it is a real breach.
 */
function OverdueBadge({
  snapshot,
  className,
}: {
  snapshot: CreditDodSnapshotRecord;
  className?: string;
}) {
  const od = snapshot.overdue;
  if (!od) return null;
  const dayCount = `${od.days} day${od.days === 1 ? '' : 's'}`;
  return (
    <InfoBadge
      className={className}
      intent={od.withinPortalLag ? 'warning' : 'danger'}
      label={
        od.withinPortalLag
          ? `Past deadline · ${dayCount}`
          : `Overdue ${dayCount}`
      }
      sheetTitle="Past its deposit deadline"
      detail={
        od.withinPortalLag
          ? `${inrFormat(od.amount)} was due on ${formatDmy(
              od.since,
            )}, ${dayCount} ago. A deposit made on time may not be published yet.`
          : `${inrFormat(od.amount)} has been past its deadline since ${formatDmy(
              od.since,
            )} — ${od.estimatedFrom ? 'at least ' : ''}${dayCount}, across ${
              od.deadlines
            } deadline${od.deadlines === 1 ? '' : 's'}.`
      }
    />
  );
}

/**
 * The credit line was locked because its review date lapsed.
 *
 * Sits BESIDE the state badge rather than replacing it, unlike `OverdueBadge`.
 * The two are independent: a locked dealer may be squarely up to date on
 * deposits, and a dealer three deadlines behind may hold a perfectly live limit.
 * Collapsing them into one badge would hide whichever arrived second.
 */
function CreditLockBadge({
  snapshot,
  className,
}: {
  snapshot: CreditDodSnapshotRecord;
  className?: string;
}) {
  const review = snapshot.creditReview;
  if (!review?.lapsed) return null;
  const days = Math.max(1, -review.daysUntil);
  return (
    <InfoBadge
      className={className}
      intent="danger"
      label="Credit locked"
      sheetTitle="Credit locked"
      detail={`The credit review date of ${formatDmy(review.on)} passed ${days} day${
        days === 1 ? '' : 's'
      } before the date these figures describe. IndianOil has stopped the credit line — the dealer buys cash and carry until their sales officer reopens the account.`}
    />
  );
}

/**
 * The desktop table's Reconciles column, in a shape a phone can read.
 *
 * On desktop this is a bare tick / cross / question mark whose meaning lives in
 * an `aria-label` — invisible to a sighted touch user, since nothing on a phone
 * ever hovers it. Here the word is on screen beside the glyph, which is also
 * the second encoding channel a colour-only signal needs.
 */
function ReconcileChip({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  if (!snapshot.reconcileChecked) {
    return (
      <span className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2 text-xs font-medium text-warning">
        <HelpCircle width={12} height={12} strokeWidth={2} aria-hidden />
        Unchecked
      </span>
    );
  }
  return snapshot.reconciles ? (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-success-soft px-2 text-xs font-medium text-success">
      <CheckCircle2 width={12} height={12} strokeWidth={2} aria-hidden />
      Reconciles
    </span>
  ) : (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-danger-soft px-2 text-xs font-medium text-danger">
      <XCircle width={12} height={12} strokeWidth={2} aria-hidden />
      Mismatch
    </span>
  );
}

/**
 * The sheet. Expanding a row shows the full report — card image, figures, source
 * files and the Share action — so an admin never has to hunt through Run history
 * to send a dealer their card.
 */
function SnapshotHistoryCard({ dealerId }: { dealerId: string }) {
  const { data, isLoading, isError, error } = useCreditDodSnapshots(dealerId);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const snapshots = data ?? [];

  // Open the newest report by default: it is what an admin came here to send.
  const newestId = snapshots[0]?.id;
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (newestId && seededFor.current !== newestId) {
      seededFor.current = newestId;
      setExpanded(newestId);
    }
  }, [newestId]);

  const unshared = snapshots.filter((s) => !s.shared).length;

  return (
    <Card>
      <CardContent padding="none" className="md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-base font-semibold text-text">Report history</p>
            <p className="text-sm text-text-muted">
              Open a row to review the card and share it with the dealer.
            </p>
          </div>
          {unshared > 0 ? (
            <Badge intent="info">
              {unshared} not shared yet
            </Badge>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load report history"
            description={
              error instanceof ApiError
                ? error.message
                : 'Something went wrong while loading the report history.'
            }
          />
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={<History width={28} height={28} strokeWidth={1.75} />}
            title="No reports yet"
            description="Generate one above, or wait for the daily scheduled run."
            cta={<CreditDodHelpCta />}
          />
        ) : (
          <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH className="w-8" />
                    <TH>Captured at</TH>
                    <TH className="text-right">Due amount</TH>
                    <TH>Due date</TH>
                    <TH>State</TH>
                    <TH>Reconciles</TH>
                    <TH>Shared</TH>
                  </TRow>
                </THead>
                <TBody>
                  {snapshots.map((s) => {
                    const isOpen = expanded === s.id;
                    return (
                      <React.Fragment key={s.id}>
                        <TRow
                          clickable
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                        >
                          <TD className="text-text-muted">
                            {isOpen ? (
                              <ChevronDown
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                              />
                            ) : (
                              <ChevronRight
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                              />
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-text-muted">
                            <div className="flex items-center gap-2">
                              <span>{formatDateTime(s.capturedAt)}</span>
                              {s.backdated ? (
                                <Badge intent="info">
                                  As of {s.asOf ? formatDmy(s.asOf) : '—'}
                                </Badge>
                              ) : null}
                              <LateEntriesBadge snapshot={s} />
                            </div>
                          </TD>
                          <TD className="whitespace-nowrap text-right font-medium tabular-nums">
                            {/* Once a deadline lapses the amount that clears it
                                is the overdue total, not the oldest lot. Listing
                                the smaller one beside a red badge reads as a
                                contradiction the admin must open the row to
                                resolve. */}
                            {s.overdue ? (
                              <span className="text-danger">
                                {inrFormat(s.overdue.amount)}
                              </span>
                            ) : (
                              inrFormat(s.dueAmount)
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-text-muted">
                            {s.overdue ? (
                              <span className="text-danger">
                                was {formatDmy(s.overdue.since)}
                              </span>
                            ) : s.dueDate ? (
                              formatDmy(s.dueDate)
                            ) : (
                              '-'
                            )}
                          </TD>
                          <TD>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {s.overdue ? (
                                <OverdueBadge snapshot={s} />
                              ) : (
                                <Badge intent={STATE_INTENT[s.state] ?? 'neutral'}>
                                  {s.state}
                                </Badge>
                              )}
                              <CreditLockBadge snapshot={s} />
                            </div>
                          </TD>
                          <TD>
                            {!s.reconcileChecked ? (
                              // Same rule as the report card: with nothing to
                              // compare against, a green tick would claim a
                              // check that never ran.
                              <HelpCircle
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                                className="text-warning"
                                aria-label="Not cross-checked"
                              />
                            ) : s.reconciles ? (
                              <CheckCircle2
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                                className="text-green-600"
                                aria-label="Reconciles"
                              />
                            ) : (
                              <XCircle
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                                className="text-danger"
                                aria-label="Does not reconcile"
                              />
                            )}
                          </TD>
                          <TD>
                            {s.shared ? (
                              <CheckCircle2
                                width={16}
                                height={16}
                                strokeWidth={1.75}
                                className="text-green-600"
                                aria-label="Shared with dealer"
                              />
                            ) : (
                              <Badge intent="info">Not shared</Badge>
                            )}
                          </TD>
                        </TRow>
                        {isOpen ? (
                          <TRow>
                            <TD colSpan={7} className="bg-surface-2 p-4">
                              <CreditDodReportCard
                                snapshot={s}
                                runId={s.runId}
                              />
                            </TD>
                          </TRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TBody>
              </Table>
            </div>

            {/* Mobile card-stack (< md).
                Three things changed here. The headline carried `truncate` while
                holding the two figures that decide everything — "₹12,34,567 ·
                was due 12-08-2026" needs ~215px and had ~165px — so the due
                date, and on a large overdue amount the amount itself, were cut
                off. The badges moved OUT of the tap target: below md an
                `InfoBadge` is a real button, and a button inside a button is
                both invalid and a tap the wrong control wins. And the Reconciles
                column the desktop table shows is back, with a word beside the
                glyph, so "can I trust this one?" is answerable without opening
                every row. */}
            <ul className="grid gap-2 p-3 md:hidden">
              {snapshots.map((s) => {
                const isOpen = expanded === s.id;
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                      aria-expanded={isOpen}
                      className="flex min-h-11 w-full items-start justify-between gap-3 p-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-base font-semibold tabular-nums text-text">
                          {s.overdue ? (
                            <span className="text-danger">
                              {inrFormat(s.overdue.amount)}
                            </span>
                          ) : (
                            inrFormat(s.dueAmount)
                          )}
                        </span>
                        <span className="mt-0.5 block break-words text-sm">
                          {s.overdue ? (
                            <span className="text-danger">
                              was due {formatDmy(s.overdue.since)}
                            </span>
                          ) : s.dueDate ? (
                            <span className="text-text-muted">
                              by {formatDmy(s.dueDate)}
                            </span>
                          ) : (
                            <span className="text-text-subtle">
                              no due date
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-text-subtle">
                          {formatDateTime(s.capturedAt)}
                          {s.backdated && s.asOf
                            ? ` · as of ${formatDmy(s.asOf)}`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-text-muted">
                        {isOpen ? (
                          <ChevronDown width={20} height={20} strokeWidth={1.75} />
                        ) : (
                          <ChevronRight width={20} height={20} strokeWidth={1.75} />
                        )}
                      </span>
                    </button>
                    {/* `gap-2`, not `gap-1.5`: below md an `InfoBadge` carries
                        a `.tap-target` halo inset -12px, and two of them closer
                        than 8px let the wrong one take the tap. */}
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                      {s.shared ? (
                        <Badge intent="success">Shared</Badge>
                      ) : (
                        <Badge intent="info">Not shared</Badge>
                      )}
                      <ReconcileChip snapshot={s} />
                      <OverdueBadge snapshot={s} />
                      <CreditLockBadge snapshot={s} />
                      <LateEntriesBadge snapshot={s} />
                    </div>
                    {isOpen ? (
                      <div className="border-t border-border bg-surface-2 p-3">
                        <CreditDodReportCard snapshot={s} runId={s.runId} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

