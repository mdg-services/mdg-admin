import { AlertCircle, ReceiptText } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  EmptyState,
  HowThisWorks,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useCreditDodLedger, useCreditDodVault } from '@/hooks/api/useCreditDod';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatDmy, inrFormat } from '@/lib/format';
import { Amount, Balance } from '@/pages/dataVault/padLedgerFigures';
import {
  asMovementClass,
  classifiedRowCount,
  MOVEMENT_CLASS_LABEL,
  movementClassIntent,
  visibleLedgerRows,
} from '@/pages/dealers/ledgerWatchFormat';

import type { DealerVaultPaneProps } from './types';

const LEDGER_PAGE_SIZE = 50;

/**
 * This dealer's slice of the PAD ledger — the same accumulated Credit & DOD
 * transactions the cross-dealer Vault shows, scoped to one dealer. Rows come back
 * in PUBLICATION order (descending `seq`, the order SDMS listed them), which is
 * not value-date order: a back-dated posting arrives with the highest `seq`, so
 * the dates do not run strictly downwards — every label says "published".
 */
export function DealerPadLedgerPane({ dealer }: DealerVaultPaneProps) {
  const vaultQ = useCreditDodVault();
  const row = React.useMemo(
    () => vaultQ.data?.dealers.find((d) => d.dealerId === dealer.id) ?? null,
    [vaultQ.data, dealer.id],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCreditDodLedger(dealer.id, { limit: LEDGER_PAGE_SIZE });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  /**
   * "Hide the routine pair" — the ledger with the 97% taken out.
   *
   * A PAD ledger is meant to be a pair: fuel bought (a debit) and money
   * deposited (a credit). Across the eleven live outlets that pair plus the
   * card settlements is 3,016 of 3,163 rows, so an admin looking for the ₹1,062
   * participation fee or the one fleet-card posting that came through as a
   * DEBIT is reading past sixty screens of ordinary trading to find it. Ticking
   * this leaves exactly the movements nobody was ever told about.
   *
   * Client-side, over the rows LOADED, and deliberately so: the filter is a way
   * of reading the page in front of you, not a query. The footer says how many
   * of how many, so a short filtered list can never be read as a complete one.
   */
  const [hidePair, setHidePair] = React.useState(false);
  const classified = classifiedRowCount(rows);
  const visibleRows = visibleLedgerRows(rows, hidePair);

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-text">PAD ledger</h2>
                {row && !row.enabled ? <Badge intent="neutral">Paused</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">
                Accumulated PAD transactions reconstructed from SDMS statements.
              </p>
            </div>
            {row ? (
              <dl className="flex flex-wrap gap-x-6 gap-y-2">
                <Digest
                  label="Covers"
                  value={
                    row.earliestDate && row.latestDate
                      ? `${formatDmy(row.earliestDate)} → ${formatDmy(row.latestDate)}`
                      : '—'
                  }
                />
                <Digest
                  label="Closing balance"
                  value={
                    row.closingBalance === null ? '—' : <Balance value={row.closingBalance} />
                  }
                  hint={
                    row.closingBalance !== null && row.latestDate
                      ? `as on ${formatDmy(row.latestDate)}`
                      : undefined
                  }
                />
                <Digest
                  label="Last synced"
                  value={row.lastSyncedAt ? formatDateTime(row.lastSyncedAt) : '—'}
                />
              </dl>
            ) : vaultQ.isLoading ? (
              <Skeleton className="h-10 w-56" />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent padding="none" className="md:p-4">
          {/* `CardHeader action`: the `whitespace-nowrap` count badge does not
              shrink, so in a `justify-between` row that cannot wrap it squeezed
              the description beside it at 296px. */}
          <CardHeader
            align="center"
            padding="comfortable"
            action={
              <span className="flex flex-wrap items-center gap-3">
                {total > 0 || classified > 0 ? (
                  <span className="flex flex-wrap items-center gap-3">
                    {/* Offered only once at least one loaded row carries a
                        classification. Before Ledger Watch has run for a dealer
                        every row is unclassified, so the toggle would hide
                        nothing at all and read as broken. */}
                    {classified > 0 ? (
                      <Checkbox
                        label="Hide the routine pair"
                        checked={hidePair}
                        onChange={(e) => setHidePair(e.target.checked)}
                      />
                    ) : null}
                    {total > 0 ? (
                      <Badge intent="neutral" className="tabular-nums">
                        {total.toLocaleString('en-IN')} txns
                      </Badge>
                    ) : null}
                  </span>
                ) : null}
                <HowThisWorks
                  surface="admin-dealer-vault-pad-ledger"
                  label="PAD ledger"
                  variant="icon"
                />
              </span>
            }
          >
            <p className="text-base font-semibold text-text">Maintained PAD ledger</p>
            <p className="text-sm text-text-muted">
              Most recently published first. SDMS posts a transaction a day or two
              after its value date, so the dates do not run strictly downwards.
            </p>
          </CardHeader>

          {isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load this ledger"
              description={error instanceof ApiError ? error.message : 'Please try again.'}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptText width={28} height={28} strokeWidth={1.75} />}
              title="No PAD ledger yet"
              description="Transactions appear here once the Credit & DOD service has run for this dealer."
            />
          ) : (
            <>
              {/* Desktop table (≥ md). The pane's own `min-w-0` track keeps a wide
                  ledger scrolling inside the card, not sideways across the page. */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Date</TH>
                      <TH>Document</TH>
                      <TH>Movement</TH>
                      <TH>Type</TH>
                      <TH>Terminal</TH>
                      <TH>Product</TH>
                      <TH className="text-right">Debit</TH>
                      <TH className="text-right">Credit</TH>
                      <TH className="text-right">Balance</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {visibleRows.map((r) => (
                      <TRow key={r.seq}>
                        <TD className="whitespace-nowrap text-text-muted">
                          {formatDmy(r.date)}
                        </TD>
                        <TD className="font-medium">{r.doc || '—'}</TD>
                        <TD>
                          <MovementChip movementClass={r.movementClass} />
                        </TD>
                        <TD className="text-text-muted">{r.txnType || '—'}</TD>
                        <TD className="text-text-muted">{r.terminal || '—'}</TD>
                        <TD className="text-text-muted">{r.product || '—'}</TD>
                        <TD className="whitespace-nowrap text-right tabular-nums">
                          <Amount value={r.debit} />
                        </TD>
                        <TD className="whitespace-nowrap text-right tabular-nums">
                          <Amount value={r.credit} />
                        </TD>
                        <TD className="whitespace-nowrap text-right font-medium tabular-nums">
                          <Balance value={r.balance} />
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md). Debit/credit lead — the numbers an
                  admin scans for — with the descriptive columns as meta. */}
              <MobileCardList
                className="p-3"
                cards={visibleRows.map((r) => ({
                  key: String(r.seq),
                  primary: (
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="whitespace-nowrap text-sm font-medium text-text">
                        {formatDmy(r.date)}
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {r.doc || '—'}
                      </span>
                    </span>
                  ),
                  primaryRight: (
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                      <Balance value={r.balance} />
                    </span>
                  ),
                  secondary: (
                    <span className="flex flex-wrap items-center gap-x-3 text-xs tabular-nums">
                      {r.debit ? <span>Debit {inrFormat(r.debit)}</span> : null}
                      {r.credit ? (
                        <span className="text-success">Credit {inrFormat(r.credit)}</span>
                      ) : null}
                      {!r.debit && !r.credit ? <span>No amount</span> : null}
                    </span>
                  ),
                  meta: (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <MovementChip movementClass={r.movementClass} />
                      <span>{r.txnType || '—'}</span>
                      {r.terminal ? <span>· {r.terminal}</span> : null}
                      {r.product ? <span>· {r.product}</span> : null}
                    </span>
                  ),
                }))}
              />

              {/* Every loaded row was part of the pair. Said out loud, because
                  a table that renders nothing under a heading reads as a
                  failure to load rather than as a filter doing its job. */}
              {visibleRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">
                  Every one of the {rows.length.toLocaleString('en-IN')} loaded
                  rows is a fuel purchase or a deposit. Load more, or untick
                  &ldquo;Hide the routine pair&rdquo;.
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border p-3">
                {/* Two figures and not one whenever the filter is on: how many
                    of the loaded rows are being shown, and how much ledger
                    exists in total. A single "showing 4 of 3,163" would let a
                    filtered view be read as the whole ledger. */}
                <span className="text-xs text-text-subtle">
                  {hidePair
                    ? `Showing ${visibleRows.length.toLocaleString('en-IN')} movements outside the pair, from ${rows.length.toLocaleString('en-IN')} loaded of ${total.toLocaleString('en-IN')}`
                    : `Showing ${rows.length.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`}
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
    </div>
  );
}

/**
 * What Ledger Watch decided this row is.
 *
 * An em-dash and not a chip when there is no classification, and the difference
 * matters: a row with no class has not been read yet — the dealer's ledger was
 * synced before Ledger Watch shipped, or the run has not reached them — and
 * that is nothing like a row Ledger Watch looked at and could not name. The
 * second case has its own class, `UNCLASSIFIED`, its own red chip reading
 * "Unnamed", and an `ALERT`-level finding beside it in the Ledger watch pane.
 * Painting both the same colour would hide the one row an admin must open.
 */
function MovementChip({ movementClass }: { movementClass?: string | null }) {
  const cls = asMovementClass(movementClass);
  if (!cls) {
    return (
      <span className="text-text-subtle" title="Not classified yet">
        —
      </span>
    );
  }
  return (
    <Badge intent={movementClassIntent(cls)}>{MOVEMENT_CLASS_LABEL[cls]}</Badge>
  );
}

function Digest({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-nowrap text-sm font-medium tabular-nums text-text">
        {value}
        {hint ? (
          <span className="block whitespace-nowrap text-[11px] font-normal text-text-subtle">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
