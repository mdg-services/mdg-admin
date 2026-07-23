import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  ReceiptText,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
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
  useCreditDodSnapshots,
} from '@/hooks/api/useCreditDod';
import { useDealerServicesQuery, useRunNow } from '@/hooks/api/useDealerServices';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, inrFormat } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { CreditDodSnapshotRecord } from '@/types/creditDod';
import type { Dealer, ServiceRun } from '@dk/shared';

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

export function DealerCreditDodTab({ dealer }: Props) {
  return (
    <div className="grid gap-4">
      <BackdatedGenerateCard dealerId={dealer.id} />
      <LedgerCard dealerId={dealer.id} />
      <SnapshotHistoryCard dealerId={dealer.id} />
    </div>
  );
}

/**
 * Generate a Credit & DOD report AS OF a past date. Runs the service statelessly
 * (a back-dated run never touches the maintained ledger) via the standard
 * run-now path with an `asOf` override, then surfaces the new snapshot in the
 * Report history below once the run finishes.
 */
function BackdatedGenerateCard({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: services } = useDealerServicesQuery(dealerId);
  const creditDodDs = (services ?? []).find(
    (s) => s.serviceId === CREDIT_DOD_PLUGIN,
  );
  const runNow = useRunNow(dealerId);

  const [date, setDate] = React.useState('');
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);

  const now = new Date();
  const maxDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // Poll the triggered run until it finishes, then refresh the snapshot history.
  const runPoll = useQuery({
    queryKey: ['run', activeRunId],
    queryFn: () => api.get<ServiceRun>(`/runs/${activeRunId}`),
    enabled: !!activeRunId,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === 'SUCCESS' || st === 'FAILED' ? false : 3000;
    },
  });

  React.useEffect(() => {
    const st = runPoll.data?.status;
    if (!activeRunId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    if (st === 'SUCCESS') {
      void qc.invalidateQueries({ queryKey: ['creditDodSnapshots', dealerId] });
      toast.success('Back-dated report ready — see Report history below.');
    } else {
      // Name the dealer's own tab, not the global /runs page — that one is
      // super-admin-only now, so it would be a dead end for a plain admin.
      toast.error("The back-dated run failed. Open this dealer's Run history tab for details.");
    }
    setActiveRunId(null);
  }, [runPoll.data?.status, activeRunId, dealerId, qc, toast]);

  const busy = runNow.isPending || activeRunId !== null;

  async function generate() {
    if (!creditDodDs) {
      toast.error('Attach the Credit & DOD service to this dealer first.');
      return;
    }
    if (!date) {
      toast.error('Pick a date to generate the report for.');
      return;
    }
    if (date > maxDate) {
      toast.error('Pick a date in the past (or today).');
      return;
    }
    try {
      const { runId } = await runNow.mutateAsync({
        dsId: creditDodDs.id,
        body: { configOverride: { asOf: isoToDmy(date) } },
      });
      setActiveRunId(runId);
      toast.success(
        `Generating the report as of ${formatDate(isoToDmy(date))} — it'll appear below shortly.`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not start the back-dated run',
      );
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarClock
              width={18}
              height={18}
              strokeWidth={1.75}
              className="shrink-0 text-brand"
            />
            <p className="text-base font-semibold text-text">
              Generate a back-dated report
            </p>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Reconstruct the Credit &amp; DOD card as of any past date. This runs
            without touching the live ledger.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="cd-asof">As-of date</Label>
            <Input
              id="cd-asof"
              type="date"
              value={date}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy || !creditDodDs}
              className="w-44"
            />
          </div>
          <Button onClick={generate} loading={busy} disabled={!creditDodDs}>
            Generate
          </Button>
        </div>
      </CardContent>
      {!creditDodDs ? (
        <div className="border-t border-border px-4 py-2 text-xs text-text-subtle">
          The Credit &amp; DOD service isn&apos;t attached to this dealer yet.
        </div>
      ) : busy ? (
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Generating… a live capture takes about a minute.
        </div>
      ) : null}
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
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
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
                      {r.date}
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
            <div className="flex items-center justify-between gap-3 border-t border-border p-3">
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

function SnapshotHistoryCard({ dealerId }: { dealerId: string }) {
  const { data, isLoading, isError, error } = useCreditDodSnapshots(dealerId);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const snapshots = data ?? [];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border p-4">
          <p className="text-base font-semibold text-text">Report history</p>
          <p className="text-sm text-text-muted">
            Past Credit &amp; DOD snapshots for this dealer.
          </p>
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
            description="Snapshots appear here after each Credit & DOD run for this dealer."
          />
        ) : (
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
                              As of {s.asOf ? formatDate(s.asOf) : '—'}
                            </Badge>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap text-right font-medium tabular-nums">
                        {inrFormat(s.dueAmount)}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {s.dueDate ? formatDate(s.dueDate) : '-'}
                      </TD>
                      <TD>
                        <Badge intent={STATE_INTENT[s.state] ?? 'neutral'}>
                          {s.state}
                        </Badge>
                      </TD>
                      <TD>
                        {s.reconciles ? (
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
                          <span className="text-text-subtle">-</span>
                        )}
                      </TD>
                    </TRow>
                    {isOpen ? (
                      <TRow>
                        <TD colSpan={7} className="bg-surface-2 p-0">
                          <SnapshotDetail snapshot={s} />
                        </TD>
                      </TRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotDetail({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
      <DetailRow label="Current limit" value={money(snapshot.currentLimit)} />
      <DetailRow label="Availed limit" value={money(snapshot.availedLimit)} />
      <DetailRow
        label="Available limit"
        value={money(snapshot.availableLimit)}
      />
      <DetailRow label="Form of limit" value={snapshot.formOfLimit || '-'} />
      <DetailRow
        label="Risk category"
        value={snapshot.riskCategory ?? '-'}
      />
      <DetailRow
        label="Window"
        value={`${formatDate(snapshot.window.fromDate)} → ${formatDate(
          snapshot.window.toDate,
        )}`}
      />
      {snapshot.backdated ? (
        <DetailRow
          label="As of (back-dated)"
          value={snapshot.asOf ? formatDate(snapshot.asOf) : '-'}
        />
      ) : null}
    </dl>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0 sm:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="break-words text-right font-medium tabular-nums text-text">
        {value}
      </dd>
    </div>
  );
}
