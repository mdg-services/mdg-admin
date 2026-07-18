import {
  AlertCircle,
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
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import {
  useCreditDodLedger,
  useCreditDodSnapshots,
} from '@/hooks/api/useCreditDod';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, inrFormat } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { CreditDodSnapshotRecord } from '@/types/creditDod';
import type { Dealer } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

/** ₹ amount, or an em-dash placeholder for empty/zero cells. */
function money(n: number | null | undefined): string {
  return n ? inrFormat(n) : '-';
}

const STATE_INTENT: Record<string, Intent> = {
  due: 'warning',
  advance: 'success',
  clear: 'neutral',
};

export function DealerCreditDodTab({ dealer }: Props) {
  return (
    <div className="grid gap-4">
      <LedgerCard dealerId={dealer.id} />
      <SnapshotHistoryCard dealerId={dealer.id} />
    </div>
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
                        {formatDateTime(s.capturedAt)}
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
