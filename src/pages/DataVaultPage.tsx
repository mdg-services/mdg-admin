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
import { useNavigate, useSearchParams } from 'react-router-dom';

import { IRAS_REPORT_CODES } from '@dk/shared';
import type {
  IrasDataVaultDealerRow,
  IrasDataVaultOverview,
  IrasReportCode,
  IrasSnapshotStatus,
} from '@dk/shared';

import { SnapshotDetail } from './dataVault/SnapshotDetail';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  Input,
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
import { formatDateTime } from '@/lib/format';

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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today as a local `YYYY-MM-DD` calendar date. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Step a `YYYY-MM-DD` date by whole days, staying on the calendar. */
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function isValidIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `YYYY-MM-DD` → `Thu, 23 Jul 2026`, timezone-free. */
function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The facet a dealer row belongs to. */
function rowStatus(row: IrasDataVaultDealerRow): StatusFilter {
  return row.latest ? row.latest.status : 'missing';
}

/**
 * The cross-dealer IRAS Data Vault.
 *
 * Digest first: four counters, then one line per dealer, then — and only on
 * request — the rows themselves in a drawer. The business date, the status
 * facet and the open dealer all live in the URL, so any view is a shareable
 * link.
 */
export function DataVaultPage() {
  const [search, setSearch] = useSearchParams();
  const today = React.useMemo(() => todayIso(), []);

  const dateParam = search.get('date');
  const businessDate = isValidIsoDate(dateParam) ? dateParam : today;
  const statusParam = search.get('status');
  const status: StatusFilter = STATUS_OPTIONS.some(
    (o) => o.value === statusParam,
  )
    ? (statusParam as StatusFilter)
    : 'all';
  const query = search.get('q') ?? '';
  const openDealerId = search.get('dealer');

  const { data, isLoading, isError, error } = useIrasVaultQuery(businessDate);

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearch(next, { replace: true });
  }

  const dealers = data?.dealers ?? [];
  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    return dealers
      .filter((row) => status === 'all' || rowStatus(row) === status)
      .filter((row) => {
        if (!needle) return true;
        return [row.dealerName, row.dealerCode, row.roCode]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = STATUS_RANK[rowStatus(a)] - STATUS_RANK[rowStatus(b)];
        if (rank !== 0) return rank;
        return (a.dealerName ?? '').localeCompare(b.dealerName ?? '');
      });
  }, [dealers, status, needle]);

  const openRow = openDealerId
    ? dealers.find((d) => d.dealerId === openDealerId) ?? null
    : null;

  return (
    <div>
      <PageHeader
        title="Data Vault"
        subtitle="Shift-anchored IRAS data collected for every dealer"
        actions={
          <BusinessDateControl
            value={businessDate}
            max={today}
            onChange={(next) => patchParams({ date: next, dealer: null })}
          />
        }
      />

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
      <Button
        variant="secondary"
        size="sm"
        className="px-2"
        aria-label="Previous day"
        onClick={() => onChange(shiftIso(value, -1))}
      >
        <ChevronLeft width={16} height={16} strokeWidth={1.75} />
      </Button>
      <Input
        type="date"
        value={value}
        max={max}
        aria-label="Business date"
        onChange={(e) => {
          if (isValidIsoDate(e.target.value)) onChange(e.target.value);
        }}
        className="w-[150px]"
      />
      <Button
        variant="secondary"
        size="sm"
        className="px-2"
        aria-label="Next day"
        disabled={value >= max}
        onClick={() => onChange(shiftIso(value, 1))}
      >
        <ChevronRight width={16} height={16} strokeWidth={1.75} />
      </Button>
      {value !== max ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(max)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────── Tiles ────────────────────────────────── */

const TONE_TEXT = {
  neutral: 'text-text-subtle',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

type Tone = keyof typeof TONE_TEXT;

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

  if (loading || !overview) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Dealers configured"
        value={overview.dealersConfigured}
        tone="neutral"
        icon={<Building2 width={16} height={16} strokeWidth={1.75} />}
        hint={dateLabel(businessDate)}
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
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: React.ReactNode;
  hint?: string;
}) {
  // A zero stays neutral — a "0 failed" tile should not shout in red.
  const emphasise = tone !== 'neutral' && value > 0;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </span>
          <span className={emphasise ? TONE_TEXT[tone] : 'text-text-subtle'} aria-hidden>
            {icon}
          </span>
        </div>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            emphasise ? TONE_TEXT[tone] : 'text-text',
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 truncate text-[11px] text-text-subtle">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
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
                        {row.dealerName || 'Unnamed dealer'}
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
                  {row.dealerName || 'Unnamed dealer'}
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
                {latest.failureReason ? (
                  <span className="text-danger">{latest.failureReason}</span>
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
      title={row?.dealerName || 'Dealer data'}
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
