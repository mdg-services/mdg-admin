import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileBarChart2,
  Search,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';


import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import {
  useDsrOverview,
  type DsrOverviewDealerRow,
  type DsrProductHeadline,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLitres } from '@/lib/format';
import { compareDealerCodes, dealerCodeLabel } from '@dk/shared';

import { dsrDateLabel } from './dsr/DsrReportPanel';
import { GenerateDsrButton } from './dsr/GenerateDsrButton';

/** The one facet that matters on this screen: who needs a human look. */
type StatusFilter = 'all' | 'attention' | 'missing';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All dealers' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'missing', label: 'Not generated' },
];

/** True when a dealer has at least one product outside its permissible band. */
function needsAttention(row: DsrOverviewDealerRow): boolean {
  return !!row.latest?.products.some((p) => !p.withinLimit);
}

// Problems first: out-of-limit dealers, then never-generated, then the rest.
function rowRank(row: DsrOverviewDealerRow): number {
  if (!row.latest) return 1;
  return needsAttention(row) ? 0 : 2;
}

/**
 * The cross-dealer Daily Sales Report Vault. One line per DSR-configured dealer
 * with their latest report's date and per-product stock-variation chips, opening
 * the full report on click. Output-first: the chips are the headline, the report
 * itself lives one click away.
 */
export function DsrVaultPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { data, isLoading, isError, error } = useDsrOverview();

  const query = search.get('q') ?? '';
  const statusParam = search.get('status');
  const status: StatusFilter = STATUS_OPTIONS.some(
    (o) => o.value === statusParam,
  )
    ? (statusParam as StatusFilter)
    : 'all';

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearch(next, { replace: true });
  }

  // Memoised so the `?? []` fallback doesn't hand `visible` a fresh array
  // identity on every render while the query is still in flight.
  const dealers = React.useMemo(() => data?.dealers ?? [], [data]);
  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    return dealers
      .filter((row) => {
        if (status === 'attention') return needsAttention(row);
        if (status === 'missing') return !row.latest;
        return true;
      })
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

  const openDealer = (dealerId: string) =>
    navigate(`/dsr/dealers/${dealerId}`);

  return (
    <div>
      <PageHeader
        title="Daily Sales Report"
        subtitle="The generated day-book each dealer receives, with stock variation at a glance"
      />

      <Card>
        {/* `padding="none"`, not `className="p-0"`: `cn` is clsx and Tailwind
            emits `.p-4` after `.p-0`, so the p-0 never applied and the filter
            row's own rule stopped short of the card's edges. `md:p-4` is a
            separate declaration, so ≥768px stays exactly as it renders today. */}
        <CardContent padding="none" className="md:p-4">
          {/* `md:`, not `sm:`. 640px fires on no phone in the target set and
              produced a desktop-shaped row while the shell was still in phone
              mode; ≥768px is unchanged. */}
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
                value={query}
                onChange={(e) => patchParams({ q: e.target.value })}
                placeholder="Search dealer or code"
                aria-label="Search dealers"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              aria-label="Filter dealers"
              onChange={(e) =>
                patchParams({
                  status: e.target.value === 'all' ? null : e.target.value,
                })
              }
              className="w-full md:w-48"
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
              title="Could not load the Daily Sales Reports"
              description={
                error instanceof ApiError ? error.message : 'Please try again.'
              }
            />
          ) : dealers.length === 0 ? (
            <EmptyState
              icon={
                <FileBarChart2 width={28} height={28} strokeWidth={1.75} />
              }
              title="No dealer has the Daily Sales Report yet"
              description="Attach the Daily Sales Report service to a dealer and their day-book will appear here."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search width={28} height={28} strokeWidth={1.75} />}
              title="No dealer matches this filter"
              description="Try a different filter or clear the search."
            />
          ) : (
            <DealerList rows={visible} onOpen={openDealer} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Per-product variation chips — green within limit, red when outside it.
 *
 * The one fact this whole screen is built around used to be carried by colour
 * alone: the words "(within limit)" / "(outside limit)" lived only in a `title`,
 * which touch never shows and a colour-blind reader never had. The glyph is the
 * second encoding channel — a tick inside the band, an arrow in the direction
 * the stock went outside it, matching the icons `DsrReportPanel` already puts on
 * its advisory badge. The tooltip stays for the desktop pointer.
 */
function VariationChips({ products }: { products: DsrProductHeadline[] }) {
  if (products.length === 0) {
    return <span className="text-text-subtle">—</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {products.map((p) => (
        <span
          key={p.productKey}
          title={`${p.productKey}: ${formatLitres(p.variation, {
            sign: true,
          })}${p.withinLimit ? ' (within limit)' : ' (outside limit)'}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-4',
            p.withinLimit
              ? 'bg-success-soft text-success'
              : 'bg-danger-soft text-danger',
          )}
        >
          {p.withinLimit ? (
            <Check
              width={11}
              height={11}
              strokeWidth={2.5}
              aria-hidden
              className="shrink-0"
            />
          ) : p.variation < 0 ? (
            <ArrowDownRight
              width={11}
              height={11}
              strokeWidth={2.5}
              aria-hidden
              className="shrink-0"
            />
          ) : (
            <ArrowUpRight
              width={11}
              height={11}
              strokeWidth={2.5}
              aria-hidden
              className="shrink-0"
            />
          )}
          <span className="font-mono font-semibold">{p.productKey}</span>
          <span className="tabular-nums">
            {formatLitres(p.variation, { sign: true })}
          </span>
          {/* The word itself, for the reader who has neither hover nor colour.
              `sr-only` at md, where the tooltip and the table header carry it. */}
          <span className="sr-only">
            {p.withinLimit ? 'within limit' : 'outside limit'}
          </span>
        </span>
      ))}
    </span>
  );
}

function NotGeneratedChip() {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-dashed border-border px-2 text-xs font-medium text-text-subtle">
      Not generated
    </span>
  );
}

function DealerList({
  rows,
  onOpen,
}: {
  rows: DsrOverviewDealerRow[];
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
              <TH>Latest report</TH>
              <TH>Stock variation</TH>
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
                  <TD>
                    {latest ? (
                      <div>
                        <div className="font-medium">
                          {dsrDateLabel(latest.businessDate)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-subtle">
                          <span>
                            Generated {formatDateTime(latest.generatedAt)}
                          </span>
                          {latest.warningCount > 0 ? (
                            <Badge intent="warning">
                              {latest.warningCount} note
                              {latest.warningCount === 1 ? '' : 's'}
                            </Badge>
                          ) : null}
                          {latest.stale ? (
                            <Badge intent="warning">Needs regenerating</Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <NotGeneratedChip />
                    )}
                  </TD>
                  <TD>
                    {latest ? (
                      <VariationChips products={latest.products} />
                    ) : (
                      <span className="text-text-subtle">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {latest ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          rightIcon={
                            <ArrowRight
                              width={14}
                              height={14}
                              strokeWidth={1.75}
                            />
                          }
                          onClick={() => onOpen(row.dealerId)}
                        >
                          View report
                        </Button>
                      ) : (
                        <GenerateDsrButton dealerId={row.dealerId} />
                      )}
                    </div>
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      </div>

      {/* Mobile card-stack (< md). A dealer with a report is one whole-card tap
          target — the desktop row already is, so the phone was the only place
          that needed a 44px "View report" bar under every card to do what the
          card itself could do. Only the no-report branch keeps a button, because
          generating is a mutation and not navigation. */}
      <MobileCardList
        variant="rows"
        cards={rows.map((row) => {
          const latest = row.latest;
          return {
            key: row.dealerId,
            onClick: latest ? () => onOpen(row.dealerId) : undefined,
            primary: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-text">
                  {dealerCodeLabel(row.dealerCode)}
                </span>
                {row.enabled ? null : <Badge intent="neutral">Paused</Badge>}
              </span>
            ),
            primaryRight: latest ? (
              <span className="whitespace-nowrap text-xs text-text-subtle">
                {dsrDateLabel(latest.businessDate)}
              </span>
            ) : (
              <NotGeneratedChip />
            ),
            secondary: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-mono">{row.dealerCode || '—'}</span>
                {latest ? (
                  <span>· Generated {formatDateTime(latest.generatedAt)}</span>
                ) : null}
                {/* The desktop table shows this and the phone card dropped it:
                    a report carrying three data-quality notes looked identical
                    to a clean one, and this badge is the only cross-dealer
                    signal that one needs a look before it is trusted. */}
                {latest && latest.warningCount > 0 ? (
                  <Badge intent="warning">
                    {latest.warningCount} note
                    {latest.warningCount === 1 ? '' : 's'}
                  </Badge>
                ) : null}
                {latest?.stale ? (
                  <Badge intent="warning">Needs regenerating</Badge>
                ) : null}
              </span>
            ),
            meta: latest ? (
              <VariationChips products={latest.products} />
            ) : (
              <span>No report generated for this dealer yet</span>
            ),
            actions: latest ? undefined : (
              <div className="[&>button]:w-full">
                <GenerateDsrButton dealerId={row.dealerId} />
              </div>
            ),
          };
        })}
      />
    </>
  );
}
