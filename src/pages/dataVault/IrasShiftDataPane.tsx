import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Database,
  DownloadCloud,
  Search,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  MIN_SELECTABLE_YMD,
  MobileCardList,
  Select,
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useCollectIrasData,
  useIrasSnapshotQuery,
  useIrasVaultQuery,
} from '@/hooks/api/useIrasData';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd, istTodayYmd, isYmd, toYmd } from '@/lib/format';
import {
  IRAS_REPORT_CODES,
  IRAS_REPORT_LABELS,
  compareDealerCodes,
  dealerCodeLabel,
} from '@dk/shared';
import type {
  IrasDataVaultDealerRow,
  IrasDataVaultOverview,
  IrasReportCode,
  IrasSnapshotStatus,
} from '@dk/shared';

import { SnapshotDetail } from './SnapshotDetail';
import { StatTile, StatTileRow, StatTileSkeletons } from './StatTile';
import type { VaultDatasetProps } from './types';

/** The status facet, widened with the two states a snapshot cannot express. */
type StatusFilter = 'all' | IrasSnapshotStatus | 'missing';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All dealers' },
  { value: 'COMPLETE', label: 'Collected' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'missing', label: 'Not collected' },
];

/**
 * Problems first: a failed or missing dealer is why an admin opened this screen,
 * so they sort above the dealers that are fine.
 */
const STATUS_RANK: Record<StatusFilter, number> = {
  all: 9,
  FAILED: 0,
  missing: 1,
  PARTIAL: 2,
  COMPLETE: 3,
};

/**
 * Step a `YYYY-MM-DD` date by whole days, staying on the calendar.
 *
 * The floor is part of the arithmetic, not just a policy the caller applies:
 * `new Date(y, …)` honours the two-digit-year legacy and reads year 2 as 1902,
 * so stepping a half-typed `0002-07-12` returned `1902-07-11` and the arrow
 * teleported the Vault 1900 years with nothing on screen to say so. Starting
 * from `MIN_SELECTABLE_YMD` whenever the input is not a day this product could
 * hold keeps the helper correct on its own rather than merely fenced off from
 * the problem by whoever calls it.
 */
function shiftIso(iso: string, days: number): string {
  const from = isYmd(iso) && iso >= MIN_SELECTABLE_YMD ? iso : MIN_SELECTABLE_YMD;
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7));
  const d = Number(from.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const next = toYmd(dt);
  return next < MIN_SELECTABLE_YMD ? MIN_SELECTABLE_YMD : next;
}

/** The facet a dealer row belongs to. */
function rowStatus(row: IrasDataVaultDealerRow): StatusFilter {
  return row.latest ? row.latest.status : 'missing';
}

/**
 * The business date the Vault is showing. Read from `?date` on every render
 * rather than held in state — the header control and the pane are two separate
 * components, and the URL is the only thing they share.
 *
 * `?date` is hand-editable and shareable, so "is this a real day" is not enough:
 * `isYmd` answers only that, and a link carrying `?date=0002-07-12` would be
 * honoured — scoping the whole pane, and every "Collect now" on it, to a date no
 * dealer can have data for. Anything outside the range the control itself offers
 * falls back to today.
 */
function useBusinessDate(params: URLSearchParams): { today: string; businessDate: string } {
  // IST today (matching the backend future-date guard), recomputed each render so
  // it advances past IST midnight and a non-IST browser can't disagree with the
  // server's ceiling.
  const today = istTodayYmd();
  const dateParam = params.get('date');
  // A ceiling of `today` matters as much as the floor: a hand-edited or shared
  // link like `?date=2099-01-01` would otherwise scope the pane — and every
  // "Collect now" on it — to a future day that has no shift and that the backend
  // now rejects with a 400. Anything out of range falls back to today.
  const usable =
    isYmd(dateParam) && dateParam >= MIN_SELECTABLE_YMD && dateParam <= today
      ? dateParam
      : today;
  return { today, businessDate: usable };
}

/**
 * The IRAS dataset's header control: the business date the whole pane is scoped
 * to. Lives in the page header rather than in the pane because it scopes the
 * counters as well as the list.
 */
export function IrasShiftDataActions({ params, patchParams }: VaultDatasetProps) {
  const { today, businessDate } = useBusinessDate(params);
  return (
    <BusinessDateControl
      value={businessDate}
      max={today}
      onChange={(next) => patchParams({ date: next, dealer: null })}
    />
  );
}

/**
 * The cross-dealer IRAS shift data.
 *
 * Digest first: four counters, then one line per dealer, then — and only on
 * request — the rows themselves in a drawer. The business date, the status
 * facet and the open dealer all live in the URL, so any view is a shareable
 * link.
 */
export function IrasShiftDataPane({ params, patchParams }: VaultDatasetProps) {
  const { businessDate } = useBusinessDate(params);

  const statusParam = params.get('status');
  const status: StatusFilter = STATUS_OPTIONS.some(
    (o) => o.value === statusParam,
  )
    ? (statusParam as StatusFilter)
    : 'all';
  const query = params.get('q') ?? '';
  const openDealerId = params.get('dealer');

  const { data, isLoading, isError, error } = useIrasVaultQuery(businessDate);

  // Memoised, not just defaulted: `?? []` is a fresh array on every render, so
  // the filter/sort below it would re-run (and hand every row a new identity) on
  // every keystroke in the search box rather than only when the data changes.
  const dealers = React.useMemo(() => data?.dealers ?? [], [data]);
  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    return dealers
      .filter((row) => status === 'all' || rowStatus(row) === status)
      .filter((row) => {
        if (!needle) return true;
        return [row.dealerCode, row.roCode]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = STATUS_RANK[rowStatus(a)] - STATUS_RANK[rowStatus(b)];
        if (rank !== 0) return rank;
        return compareDealerCodes(a.dealerCode, b.dealerCode);
      });
  }, [dealers, status, needle]);

  const openRow = openDealerId
    ? dealers.find((d) => d.dealerId === openDealerId) ?? null
    : null;

  return (
    <div>
      <OverviewTiles
        overview={data?.overview}
        loading={isLoading}
        businessDate={businessDate}
      />

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
                placeholder="Search dealer, code or RO"
                aria-label="Search dealers"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={status}
                aria-label="Filter by collection status"
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
              title="Could not load the Data Vault"
              description={
                error instanceof ApiError ? error.message : 'Please try again.'
              }
            />
          ) : dealers.length === 0 ? (
            <EmptyState
              icon={<Database width={28} height={28} strokeWidth={1.75} />}
              title="No dealer is collecting IRAS data yet"
              description="Attach the IRAS data pipeline to a dealer and their shift data will appear here."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search width={28} height={28} strokeWidth={1.75} />}
              title="No dealer matches this filter"
              description="Try a different status or clear the search."
            />
          ) : (
            <DealerList
              rows={visible}
              businessDate={businessDate}
              onOpen={(dealerId) => patchParams({ dealer: dealerId })}
            />
          )}
        </CardContent>
      </Card>

      <SnapshotDrawer
        row={openRow}
        businessDate={businessDate}
        onClose={() => patchParams({ dealer: null })}
      />
    </div>
  );
}

/* ────────────────────────────── Date control ────────────────────────────── */

function BusinessDateControl({
  value,
  max,
  onChange,
}: {
  value: string;
  max: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {/* `IconButton`, not `Button className="px-2"`. `cn` is plain clsx, so
          that `px-2` landed BESIDE the size's `px-3` and lost on stylesheet
          order — the override never did anything. And a 16px glyph in a Button
          is 40×44: wide enough on paper, square on screen, and short on the axis
          a thumb travels along. */}
      <IconButton
        variant="secondary"
        size="sm"
        aria-label="Previous day"
        // Bounded at both ends, like "Next day" is at today: an arrow that walks
        // out of the range the field itself offers has nowhere real to land.
        disabled={value <= MIN_SELECTABLE_YMD}
        onClick={() => onChange(shiftIso(value, -1))}
      >
        <ChevronLeft width={16} height={16} strokeWidth={1.75} />
      </IconButton>
      <Input
        type="date"
        value={value}
        min={MIN_SELECTABLE_YMD}
        max={max}
        aria-label="Business date"
        onChange={(e) => {
          // The floor is load-bearing, not decoration. Per the browser behaviour
          // DateRangeFilter documents, a year typed digit-by-digit emits four
          // COMPLETE dates on the way to one real one (0002-…, 0020-…, 0202-…,
          // 2026-…), and each one that gets through re-scopes the pane and costs
          // another `/iras-data/vault` round-trip — not free on 2G. Committing
          // only days this product could hold leaves exactly one.
          const next = e.target.value;
          if (isYmd(next) && next >= MIN_SELECTABLE_YMD && next <= max) onChange(next);
        }}
        // A hard 150px is 14px of slack once the two arrows and "Today" are
        // beside it at 360px, and an Android WebView draws `dd-mm-yyyy` plus a
        // calendar glyph, which can exceed it and truncate the visible date.
        className="w-full max-w-[170px] md:w-[150px]"
      />
      <IconButton
        variant="secondary"
        size="sm"
        aria-label="Next day"
        disabled={value >= max}
        onClick={() => onChange(shiftIso(value, 1))}
      >
        <ChevronRight width={16} height={16} strokeWidth={1.75} />
      </IconButton>
      {value !== max ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(max)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────── Tiles ────────────────────────────────── */

function OverviewTiles({
  overview,
  loading,
  businessDate,
}: {
  overview: IrasDataVaultOverview | undefined;
  loading: boolean;
  businessDate: string;
}) {
  // No counters and not loading means the request failed — the list below already
  // says so. Four skeletons that never resolve would read as a hung screen.
  if (!loading && !overview) return null;

  if (loading || !overview) return <StatTileSkeletons />;

  return (
    <StatTileRow>
      <StatTile
        label="Dealers configured"
        value={overview.dealersConfigured}
        tone="neutral"
        icon={<Building2 width={16} height={16} strokeWidth={1.75} />}
        hint={formatYmd(businessDate, { weekday: true })}
      />
      <StatTile
        label="Collected"
        value={overview.dealersCollected}
        tone="success"
        icon={<Database width={16} height={16} strokeWidth={1.75} />}
        hint={
          overview.lastCapturedAt
            ? `Last ${formatDateTime(overview.lastCapturedAt)}`
            : 'Nothing captured yet'
        }
      />
      <StatTile
        label="Failed"
        value={overview.dealersFailed}
        tone="danger"
        icon={<XCircle width={16} height={16} strokeWidth={1.75} />}
        hint={overview.dealersFailed > 0 ? 'Needs attention' : 'All clear'}
      />
      <StatTile
        label="Not collected"
        value={overview.dealersMissing}
        tone="warning"
        icon={<CircleSlash width={16} height={16} strokeWidth={1.75} />}
        hint={
          overview.dealersMissing > 0 ? 'No snapshot yet' : 'Everyone reported'
        }
      />
    </StatTileRow>
  );
}

/* ──────────────────────────────── Row bits ──────────────────────────────── */

/** Compact per-report row counts: `TOT 13 · STK 5 · REC 1`. */
function RowCountPills({
  rowCounts,
}: {
  rowCounts: Partial<Record<IrasReportCode, number>>;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {IRAS_REPORT_CODES.map((code) => {
        const count = rowCounts[code];
        const missing = count === undefined;
        return (
          <span
            key={code}
            title={missing ? `${code} not collected` : `${code}: ${count} rows`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-4',
              missing
                ? 'border-dashed border-border text-text-subtle'
                : 'border-border-strong text-text',
            )}
          >
            <span className="font-mono font-semibold">{code}</span>
            <span className="tabular-nums">{missing ? '—' : count}</span>
          </span>
        );
      })}
    </span>
  );
}

/** The status column: a chip for a snapshot, a muted state when there is none. */
function DealerStatusCell({ row }: { row: IrasDataVaultDealerRow }) {
  if (row.latest)
    return <StatusChip kind="irasSnapshot" value={row.latest.status} />;
  // A plain span, not a Badge — "nothing here" should read quieter than a
  // status, and a dashed outline says "expected but absent" better than a fill.
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-dashed border-border px-2 text-xs font-medium text-text-subtle">
      Not collected
    </span>
  );
}

function CollectButton({
  dealerId,
  businessDate,
  label = 'Collect now',
}: {
  dealerId: string;
  /** The date the Vault is showing — collected FOR that date, not for today. */
  businessDate: string;
  label?: string;
}) {
  const toast = useToast();
  const collect = useCollectIrasData();
  const pending = collect.isPending;

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={(e) => {
        e.stopPropagation();
        collect.mutate(
          { dealerId, businessDate },
          {
            onSuccess: () =>
              toast.success(
                'Collection queued — the portal takes about a minute. This list refreshes when it lands.',
              ),
            onError: (err) =>
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : 'Could not start the collection',
              ),
          },
        );
      }}
    >
      {label}
    </Button>
  );
}

/* ──────────────────────────────── The list ──────────────────────────────── */

function DealerList({
  rows,
  businessDate,
  onOpen,
}: {
  rows: IrasDataVaultDealerRow[];
  businessDate: string;
  onOpen: (dealerId: string) => void;
}) {
  return (
    <>
      {/* Desktop table (≥ md) */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TRow>
              <TH>Dealer</TH>
              <TH>RO</TH>
              <TH>Status</TH>
              <TH>Shift</TH>
              <TH>Rows</TH>
              <TH>Captured at</TH>
              <TH className="text-right">Action</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((row) => {
              const latest = row.latest;
              return (
                <TRow
                  key={row.dealerId}
                  clickable={!!latest}
                  onClick={latest ? () => onOpen(row.dealerId) : undefined}
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
                  <TD className="font-mono text-text-muted">
                    {row.roCode || '—'}
                  </TD>
                  <TD>
                    <DealerStatusCell row={row} />
                    {latest?.failureReason ? (
                      <p className="mt-1 max-w-[26ch] text-xs text-danger">
                        {latest.failureReason}
                      </p>
                    ) : null}
                  </TD>
                  <TD className="whitespace-nowrap font-mono text-text-muted">
                    {latest?.selectedShiftTime ||
                      row.configuredShiftTime ||
                      '—'}
                  </TD>
                  <TD>
                    {latest ? (
                      <RowCountPills rowCounts={latest.rowCounts} />
                    ) : (
                      <span className="text-text-subtle">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-text-muted">
                    {latest ? formatDateTime(latest.capturedAt) : '—'}
                  </TD>
                  <TD className="text-right">
                    {latest ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(row.dealerId);
                        }}
                      >
                        View
                      </Button>
                    ) : (
                      <CollectButton
                        dealerId={row.dealerId}
                        businessDate={businessDate}
                      />
                    )}
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      </div>

      {/* Mobile card-stack (< md) — cards carry buttons, so they are never
          whole-card tap targets (no nested buttons). */}
      <MobileCardList
        className="p-3"
        cards={rows.map((row) => {
          const latest = row.latest;
          return {
            key: row.dealerId,
            primary: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-text">
                  {dealerCodeLabel(row.dealerCode)}
                </span>
                {/* Parity with the desktop table: a paused attachment is why a
                    dealer stops producing snapshots, so it cannot be desktop-only. */}
                {row.enabled ? null : <Badge intent="neutral">Paused</Badge>}
              </span>
            ),
            primaryRight: <DealerStatusCell row={row} />,
            secondary: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-xs">
                  {row.dealerCode || '—'}
                </span>
                {row.roCode ? (
                  <span className="text-xs">· RO {row.roCode}</span>
                ) : null}
                {latest ? (
                  <span className="font-mono text-xs">
                    · Shift {latest.selectedShiftTime}
                  </span>
                ) : null}
              </span>
            ),
            meta: latest ? (
              <span className="flex flex-col gap-1">
                <RowCountPills rowCounts={latest.rowCounts} />
                <span>{formatDateTime(latest.capturedAt)}</span>
                {/* These come from the portal and can carry an unbroken token —
                    a URL, a session id — which at 296px would run past the card
                    and be clipped by `main`'s `overflow-x-hidden`, i.e. lost. */}
                {latest.failureReason ? (
                  <span className="break-words text-danger">{latest.failureReason}</span>
                ) : null}
              </span>
            ) : (
              <span>
                No snapshot for this date
                {row.configuredShiftTime
                  ? ` · shift ${row.configuredShiftTime}`
                  : ''}
              </span>
            ),
            actions: latest ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => onOpen(row.dealerId)}
              >
                View data
              </Button>
            ) : (
              <div className="[&>button]:w-full">
                <CollectButton
                  dealerId={row.dealerId}
                  businessDate={businessDate}
                />
              </div>
            ),
          };
        })}
      />
      {/* The three codes carried their whole meaning in a `title`, which never
          fires on touch — so on a phone the row read `TOT 13 · STK 5 · REC —`
          with no way to learn that the dash means "not collected" rather than
          "zero rows". */}
      <p className="px-3 pb-3 text-xs text-text-subtle md:hidden">
        {IRAS_REPORT_CODES.map((c) => IRAS_REPORT_LABELS[c]).join(' · ')}. A dash means
        that report was not collected for the day.
      </p>
    </>
  );
}

/* ─────────────────────────────── The drawer ─────────────────────────────── */

function SnapshotDrawer({
  row,
  businessDate,
  onClose,
}: {
  row: IrasDataVaultDealerRow | null;
  businessDate: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const snapshotId = row?.latest?.id;
  const { data, isLoading, isError, error } = useIrasSnapshotQuery(snapshotId);

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      width="lg"
      title={dealerCodeLabel(row?.dealerCode)}
      description={
        row
          ? [row.dealerCode, row.roCode ? `RO ${row.roCode}` : null]
              .filter(Boolean)
              .join(' · ') || undefined
          : undefined
      }
      footer={
        row ? (
          <>
            <Button
              variant="secondary"
              onClick={() => navigate(`/dealers/${row.dealerId}?tab=data-vault`)}
            >
              Open dealer
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </>
        ) : null
      }
    >
      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load this snapshot"
          description={
            error instanceof ApiError ? error.message : 'Please try again.'
          }
        />
      ) : !data ? (
        <EmptyState
          icon={<Database width={28} height={28} strokeWidth={1.75} />}
          title="Nothing collected yet"
          description="Run a collection for this dealer to fill the vault."
          cta={
            row ? (
              <CollectButton
                dealerId={row.dealerId}
                businessDate={businessDate}
              />
            ) : undefined
          }
        />
      ) : (
        <SnapshotDetail
          snapshot={data}
          hideDealerName
          actions={
            <CollectButton
              dealerId={data.dealerId}
              businessDate={data.businessDate}
              label="Re-collect"
            />
          }
        />
      )}
    </Drawer>
  );
}
