import {
  AlertCircle,
  Building2,
  ChevronLeft,
  PauseCircle,
  ReceiptText,
  Search,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
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
import { useCreditDodLedger, useCreditDodVault } from '@/hooks/api/useCreditDod';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatDmy, inrFormat } from '@/lib/format';
import type {
  CreditDodVaultDealerRow,
  CreditDodVaultOverview,
} from '@/types/creditDod';
import { compareDealerCodes, dealerCodeLabel } from '@dk/shared';

import { Amount, Balance } from './padLedgerFigures';
import { StatTile, StatTileRow, StatTileSkeletons } from './StatTile';
import type { VaultDatasetProps } from './types';

/**
 * Ledger rows fetched per page. The endpoint pages on `seq` — insertion order,
 * i.e. the order SDMS published the rows to us, most recent first. That is NOT
 * value-date order: the portal posts a transaction a day or two after its value
 * date, so a back-dated row arrives last and sorts first here while belonging in
 * the middle of the ledger. Every label on this screen has to say "published",
 * never "newest".
 */
const LEDGER_PAGE_SIZE = 50;

/** The facets that answer "which dealers need a look". */
type StatusFilter = 'all' | 'ledger' | 'empty' | 'paused';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All dealers' },
  { value: 'ledger', label: 'With ledger' },
  { value: 'empty', label: 'No ledger yet' },
  { value: 'paused', label: 'Paused' },
];

/**
 * Problems first, same rule as the IRAS dataset: a dealer configured for
 * Credit & DOD with nothing in the vault, then one whose ledger has stopped
 * growing, then everyone who is fine.
 */
function rowRank(row: CreditDodVaultDealerRow): number {
  if (row.rowCount === 0) return 0;
  return row.enabled ? 2 : 1;
}

function matchesStatus(row: CreditDodVaultDealerRow, status: StatusFilter): boolean {
  if (status === 'ledger') return row.rowCount > 0;
  if (status === 'empty') return row.rowCount === 0;
  if (status === 'paused') return !row.enabled;
  return true;
}

/**
 * The Credit & DOD monitoring dataset: every dealer's accumulated PAD ledger.
 *
 * Two levels, both in the URL. `?dataset=pad-ledger` is the dealer list;
 * `&dealer=<id>` is that dealer's transactions. The drill-in is a page swap
 * rather than the drawer the IRAS dataset uses — a ledger is a wide, paginated
 * table that an admin scrolls through, and a phone-width drawer is the worst
 * possible place to read one.
 */
export function PadLedgerPane({ params, patchParams }: VaultDatasetProps) {
  const { data, isLoading, isError, error } = useCreditDodVault();
  const navigate = useNavigate();

  const openDealerId = params.get('dealer');
  // Memoised because it is the dependency of the list's filter/sort: `?? []`
  // hands back a fresh array on every render, which would make that memo (and
  // every row it produces) recompute on every keystroke in the search box.
  const dealers = React.useMemo(() => data?.dealers ?? [], [data]);

  const openRow = openDealerId
    ? dealers.find((d) => d.dealerId === openDealerId) ?? null
    : null;

  /**
   * Opening a dealer PUSHES: on the admin app's WebView shell the hardware Back
   * button is the primary navigation, and it must leave the ledger.
   *
   * Which is exactly why leaving has to POP that entry instead of pushing the
   * list on top of it. Pushing gave the drill-in TWO history entries, so Back
   * from the list an admin had just returned to went forward into the ledger
   * they had explicitly left — the screen reading as if it would not let go.
   * The flag is a ref rather than derived from history state because only this
   * pane knows whether the entry below us is ours.
   */
  const pushedDrillIn = React.useRef(false);

  const openDealer = React.useCallback(
    (dealerId: string) => {
      pushedDrillIn.current = true;
      patchParams({ dealer: dealerId }, { push: true });
    },
    [patchParams],
  );

  const backToList = () => {
    if (pushedDrillIn.current) {
      pushedDrillIn.current = false;
      navigate(-1);
      return;
    }
    // Cold deep-link straight into `&dealer=` — there is no entry of ours to
    // pop, and pushing one would recreate the trap above. The drill-in and the
    // list are one screen at two depths, so an arrival that cost no history
    // entry costs none to leave either.
    patchParams({ dealer: null });
  };

  if (openDealerId) {
    return (
      <DealerLedger
        dealerId={openDealerId}
        row={openRow}
        listLoading={isLoading}
        listFailed={isError}
        onBack={backToList}
      />
    );
  }

  return (
    <DealerList
      dealers={dealers}
      overview={data?.overview}
      isLoading={isLoading}
      isError={isError}
      error={error}
      params={params}
      patchParams={patchParams}
      onOpen={openDealer}
    />
  );
}

/* ──────────────────────────────── Level 1 ───────────────────────────────── */

function DealerList({
  dealers,
  overview,
  isLoading,
  isError,
  error,
  params,
  patchParams,
  onOpen,
}: {
  dealers: CreditDodVaultDealerRow[];
  overview: CreditDodVaultOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  params: URLSearchParams;
  patchParams: VaultDatasetProps['patchParams'];
  /** Drill into one dealer. Owned by the pane, which has to remember that it
   *  pushed a history entry so the way back can pop it. */
  onOpen: (dealerId: string) => void;
}) {
  const statusParam = params.get('status');
  const status: StatusFilter = STATUS_OPTIONS.some((o) => o.value === statusParam)
    ? (statusParam as StatusFilter)
    : 'all';
  const query = params.get('q') ?? '';
  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    return dealers
      .filter((row) => matchesStatus(row, status))
      .filter((row) => {
        if (!needle) return true;
        return [row.dealerCode]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = rowRank(a) - rowRank(b);
        if (rank !== 0) return rank;
        return compareDealerCodes(a.dealerCode, b.dealerCode);
      });
  }, [dealers, status, needle]);

  const paused = dealers.filter((d) => !d.enabled).length;

  return (
    <div>
      {/* Same rule as the IRAS tiles: no counters and not loading means the
          request failed, and the list below already says so — skeletons that
          never resolve would read as a hung screen. */}
      {isLoading ? (
        <StatTileSkeletons />
      ) : overview ? (
        <StatTileRow>
          <StatTile
            label="Dealers configured"
            value={overview.dealersConfigured}
            tone="neutral"
            icon={<Building2 width={16} height={16} strokeWidth={1.75} />}
            hint="On Credit & DOD monitoring"
          />
          <StatTile
            label="With ledger"
            value={overview.dealersWithLedger}
            tone="success"
            icon={<ReceiptText width={16} height={16} strokeWidth={1.75} />}
            hint={
              overview.lastSyncedAt
                ? `Last synced ${formatDateTime(overview.lastSyncedAt)}`
                : 'Nothing collected yet'
            }
          />
          <StatTile
            label="Transactions"
            value={overview.transactions}
            tone="neutral"
            icon={<Wallet width={16} height={16} strokeWidth={1.75} />}
            hint="Live rows held in the vault"
          />
          <StatTile
            label="Paused"
            value={paused}
            tone="warning"
            icon={<PauseCircle width={16} height={16} strokeWidth={1.75} />}
            hint={paused > 0 ? 'Ledger has stopped growing' : 'All attachments active'}
          />
        </StatTileRow>
      ) : null}

      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                width={15}
                height={15}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => patchParams({ q: e.target.value })}
                placeholder="Search dealer or code"
                aria-label="Search dealers"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              aria-label="Filter by ledger state"
              onChange={(e) =>
                patchParams({
                  status: e.target.value === 'all' ? null : e.target.value,
                })
              }
              className="w-full sm:w-44"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the PAD ledger"
              description={
                error instanceof ApiError ? error.message : 'Please try again.'
              }
            />
          ) : dealers.length === 0 ? (
            <EmptyState
              icon={<ReceiptText width={28} height={28} strokeWidth={1.75} />}
              title="No dealer is on Credit & DOD monitoring yet"
              description="Attach the Credit & DOD service to a dealer and their PAD ledger will accumulate here."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search width={28} height={28} strokeWidth={1.75} />}
              title="No dealer matches this filter"
              description="Try a different state or clear the search."
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Dealer</TH>
                      <TH className="text-right">Transactions</TH>
                      <TH>Covers</TH>
                      <TH className="text-right">Balance</TH>
                      <TH>Last synced</TH>
                      <TH className="text-right">Action</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {visible.map((row) => {
                      const hasLedger = row.rowCount > 0;
                      return (
                        <TRow
                          key={row.dealerId}
                          clickable={hasLedger}
                          onClick={hasLedger ? () => onOpen(row.dealerId) : undefined}
                        >
                          <TD>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {dealerCodeLabel(row.dealerCode)}
                              </span>
                              {row.enabled ? null : (
                                <Badge intent="neutral">Paused</Badge>
                              )}
                            </div>
                            <div className="font-mono text-xs text-text-subtle">
                              {row.dealerCode || '—'}
                            </div>
                          </TD>
                          <TD className="text-right tabular-nums">
                            {hasLedger ? (
                              row.rowCount.toLocaleString('en-IN')
                            ) : (
                              <span className="text-text-subtle">—</span>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-text-muted">
                            {hasLedger ? (
                              <>
                                {formatDmy(row.earliestDate)} &rarr;{' '}
                                {formatDmy(row.latestDate)}
                              </>
                            ) : (
                              <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-dashed border-border px-2 text-xs font-medium text-text-subtle">
                                No ledger yet
                              </span>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-right font-medium tabular-nums">
                            {row.closingBalance === null ? (
                              <span className="text-text-subtle">—</span>
                            ) : (
                              <Balance value={row.closingBalance} />
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-text-muted">
                            {row.lastSyncedAt ? formatDateTime(row.lastSyncedAt) : '—'}
                          </TD>
                          <TD className="text-right">
                            {hasLedger ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpen(row.dealerId);
                                }}
                              >
                                View ledger
                              </Button>
                            ) : (
                              <span className="text-xs text-text-subtle">
                                Nothing collected
                              </span>
                            )}
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md). A dealer with a ledger is one tap
                  target; an empty one carries no action, so it is a plain card
                  rather than a button that would do nothing. */}
              <MobileCardList
                className="p-3"
                cards={visible.map((row) => {
                  const hasLedger = row.rowCount > 0;
                  return {
                    key: row.dealerId,
                    onClick: hasLedger ? () => onOpen(row.dealerId) : undefined,
                    primary: (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-text">
                          {dealerCodeLabel(row.dealerCode)}
                        </span>
                        {row.enabled ? null : <Badge intent="neutral">Paused</Badge>}
                      </span>
                    ),
                    primaryRight: hasLedger ? (
                      <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                        {row.closingBalance === null ? (
                          '—'
                        ) : (
                          <Balance value={row.closingBalance} />
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-dashed border-border px-2 text-xs font-medium text-text-subtle">
                        No ledger
                      </span>
                    ),
                    secondary: (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-xs">
                          {row.dealerCode || '—'}
                        </span>
                        {hasLedger ? (
                          <span className="text-xs tabular-nums">
                            · {row.rowCount.toLocaleString('en-IN')} txns
                          </span>
                        ) : null}
                      </span>
                    ),
                    meta: hasLedger ? (
                      <span className="flex flex-col gap-0.5">
                        <span>
                          {formatDmy(row.earliestDate)} → {formatDmy(row.latestDate)}
                        </span>
                        {row.lastSyncedAt ? (
                          <span>Last synced {formatDateTime(row.lastSyncedAt)}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span>
                        Nothing collected yet — the service has not produced a
                        statement for this dealer.
                      </span>
                    ),
                  };
                })}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────────────────────── Level 2 ───────────────────────────────── */

/**
 * One dealer's transactions, in the order SDMS published them.
 *
 * `row` is the digest from the list, used for the heading. It can legitimately
 * be absent — a bookmarked `&dealer=` for a dealer who has since been archived,
 * or whose Credit & DOD attachment was removed — so that case says so plainly
 * instead of bouncing back to the list and looking like the link was ignored.
 *
 * THE HEADER AND THE TABLE ARE IN DIFFERENT ORDERS, and the copy has to admit
 * it. The header's closing balance is the last row by VALUE DATE (the digest
 * maxes over (date, portalOrder, seq)); the table is paged by `seq`, i.e. by
 * when the portal published each row. A back-dated posting — routine here, a
 * payment made on the 1st is published on the 2nd or 3rd — puts an older date,
 * with a smaller running balance, at the top of the table while the header
 * reports the balance from the day below it. Labelling the table "newest first"
 * made that read as the summary contradicting the transactions; the balance now
 * carries the date it belongs to, and the table says which order it is in.
 */
function DealerLedger({
  dealerId,
  row,
  listLoading,
  listFailed,
  onBack,
}: {
  dealerId: string;
  row: CreditDodVaultDealerRow | null;
  listLoading: boolean;
  listFailed: boolean;
  onBack: () => void;
}) {
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCreditDodLedger(dealerId, { limit: LEDGER_PAGE_SIZE });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      leftIcon={<ChevronLeft width={16} height={16} strokeWidth={1.75} />}
      onClick={onBack}
    >
      All dealers
    </Button>
  );

  if (!row && !listLoading) {
    return (
      <Card>
        <CardContent className="p-3">
          {backButton}
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title={
              listFailed
                ? 'Could not load the PAD ledger'
                : 'This dealer is not in the PAD ledger'
            }
            description={
              listFailed
                ? 'The dealer list failed to load, so this link cannot be resolved. Please try again.'
                : 'They may have been archived, or the Credit & DOD service may have been removed from them.'
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="p-3">
          {backButton}
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-text">
                  {dealerCodeLabel(row?.dealerCode)}
                </h2>
                {row && !row.enabled ? (
                  <Badge intent="neutral">Paused</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-xs text-text-subtle">
                {row?.dealerCode || '—'}
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
                    row.closingBalance === null ? (
                      '—'
                    ) : (
                      <Balance value={row.closingBalance} />
                    )
                  }
                  // The date is not decoration: it is what stops this figure
                  // reading as a contradiction of the first row of the table
                  // below, which after a late posting is an earlier day.
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
            ) : (
              <Skeleton className="h-10 w-56" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {/* `CardHeader action`: the `whitespace-nowrap` count badge does not
              shrink, so in a `justify-between` row that cannot wrap it left the
              three-sentence description ~204px at 360px — six or seven lines. */}
          <CardHeader
            align="center"
            padding="comfortable"
            action={
              total > 0 ? (
                <Badge intent="neutral" className="tabular-nums">
                  {total.toLocaleString('en-IN')} txns
                </Badge>
              ) : undefined
            }
          >
            <p className="text-base font-semibold text-text">Maintained PAD ledger</p>
            <p className="text-sm text-text-muted">
              Accumulated transactions reconstructed from SDMS statements, most
              recently published first. SDMS posts a transaction a day or two
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
              description={
                error instanceof ApiError ? error.message : 'Please try again.'
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
              {/* Desktop table (≥ md). Eight columns is wide; `Table` scrolls it
                  inside the card, and the pane's own `min-w-0` track keeps that
                  from turning into a sideways scroll of the whole page. */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Date</TH>
                      <TH>Document</TH>
                      <TH>Type</TH>
                      <TH>Terminal</TH>
                      <TH>Product</TH>
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
                        <TD className="font-medium">{r.doc || '—'}</TD>
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

              {/* Mobile card-stack (< md). Debit and credit are the numbers an
                  admin scans for, so they lead; the descriptive columns follow. */}
              <MobileCardList
                className="p-3"
                cards={rows.map((r) => ({
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
                      {r.debit ? (
                        <span>Debit {inrFormat(r.debit)}</span>
                      ) : null}
                      {r.credit ? (
                        <span className="text-success">
                          Credit {inrFormat(r.credit)}
                        </span>
                      ) : null}
                      {!r.debit && !r.credit ? <span>No amount</span> : null}
                    </span>
                  ),
                  meta: (
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span>{r.txnType || '—'}</span>
                      {r.terminal ? <span>· {r.terminal}</span> : null}
                      {r.product ? <span>· {r.product}</span> : null}
                    </span>
                  ),
                }))}
              />

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
    </div>
  );
}

function Digest({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  /** Qualifier under the figure — which day it describes, and the like. */
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      {/* The hint lives INSIDE the <dd>: a <dl><div> may only hold dt/dd pairs,
          so a sibling paragraph here would be invalid markup. */}
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
