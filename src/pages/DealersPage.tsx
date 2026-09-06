import { AlertCircle, Building2, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  HowThisWorks,
  Input,
  MobileCardList,
  Pagination,
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
  useCreateDealer,
  useDealerServiceSummaryQuery,
  useDealersQuery,
} from '@/hooks/api/useDealers';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  dealerCodeLabel,
  ROSTER_SERVICES,
  type DealerServiceSummaryEntry,
  type DealerStatus,
} from '@dk/shared';

import { DealerCreateDrawer } from './dealers/DealerCreateDrawer';
import {
  ServiceStateChip,
  serviceStateTitle,
} from './dealers/ServiceStateChip';

const STATUS_OPTIONS: Array<{ value: '' | DealerStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const PAGE_SIZE = 20;

export function DealersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const isSuperAdmin = useIsSuperAdmin();
  const isMd = useMediaQuery('(min-width: 768px)');
  const searchTerm = search.get('q') ?? '';
  const status = (search.get('status') as DealerStatus | null) ?? undefined;
  const page = Number(search.get('page') ?? '1');
  // Held in the URL rather than component state because the list is
  // server-paginated: the flag has to reach the query, not filter the page.
  const showArchived = isSuperAdmin && search.get('archived') === '1';

  const [searchInput, setSearchInput] = React.useState(searchTerm);

  // Debounce the search input.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput === searchTerm) return;
      const next = new URLSearchParams(search);
      if (searchInput) next.set('q', searchInput);
      else next.delete('q');
      next.delete('page');
      setSearch(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isError, error, isFetching } = useDealersQuery({
    search: searchTerm || undefined,
    status,
    page,
    pageSize: PAGE_SIZE,
    sort: 'createdAt:desc',
    includeArchived: showArchived,
  });

  const createDealer = useCreateDealer();

  // The roster's service columns, fetched for the ids on this page only. Kept
  // out of the dealer list request so the rows draw immediately and the chips
  // fill in behind them.
  const dealerIds = React.useMemo(
    () => (data?.items ?? []).map((d) => d.id),
    [data],
  );
  const serviceSummary = useDealerServiceSummaryQuery(dealerIds);
  const servicesByDealer = React.useMemo(() => {
    const map = new Map<string, Map<string, DealerServiceSummaryEntry>>();
    for (const row of serviceSummary.data?.items ?? []) {
      map.set(row.dealerId, new Map(row.services.map((e) => [e.serviceId, e])));
    }
    return map;
  }, [serviceSummary.data]);
  // "Not known yet" and "not attached" are different answers, and a dealer only
  // leaves the first for the second once the summary has a row for THEM — not
  // merely once a summary has arrived. Paging keeps the previous page's data on
  // screen while the next one loads, so an id-by-id check is what keeps the new
  // page's rows from claiming, for a second, that nothing is set up.
  const servicesKnown = (dealerId: string) => servicesByDealer.has(dealerId);

  function setStatus(next: DealerStatus | '') {
    const params = new URLSearchParams(search);
    if (next) params.set('status', next);
    else params.delete('status');
    params.delete('page');
    setSearch(params, { replace: true });
  }

  function setShowArchived(next: boolean) {
    const params = new URLSearchParams(search);
    if (next) params.set('archived', '1');
    else params.delete('archived');
    params.delete('page');
    setSearch(params, { replace: true });
  }

  function setPage(p: number) {
    const params = new URLSearchParams(search);
    params.set('page', String(p));
    setSearch(params, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Dealers"
        subtitle="Onboard new dealers and manage their lifecycle."
        actions={
          <>
            <Button
              leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
              onClick={() => setDrawerOpen(true)}
            >
              Add dealer
            </Button>
            <HowThisWorks surface="admin-dealers-list" label="Dealers" />
          </>
        }
      />

      <Card className="mb-3 md:mb-4">
        <CardContent className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <div className="relative flex-1">
            <Search
              width={16}
              height={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            />
            {/* The box has ~264px inside it below md once the gutter, the
                card's padding and the magnifier's `pl-9` are paid for, and a
                placeholder does not ellipsize — it is simply cut. So the long
                form ended at "Search by name, phone, code, G" and PAN, the
                last searchable field, was never named at all. The short form
                drops "Search by", which the magnifier beside it already says,
                and keeps every field. From md up the placeholder is the
                sentence it has always been. */}
            <Input
              type="search"
              aria-label="Search dealers"
              placeholder={
                isMd
                  ? 'Search by name, phone, code, GST, PAN'
                  : 'Name, phone, code, GST, PAN'
              }
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {/* Status and "Show deleted" share one line below md — three stacked
              44px controls that are touched once a visit were spending 188px of
              a 740px screen before the first dealer. `md:contents` dissolves
              this wrapper at md, so the desktop filter row is the same flat run
              of three items it has always been. */}
          <div className="flex items-center gap-3 md:contents">
            <div className="min-w-0 flex-1 md:w-56 md:flex-none">
              <Select
                value={status ?? ''}
                onChange={(e) => setStatus(e.target.value as DealerStatus | '')}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            {isSuperAdmin ? (
              <Checkbox
                label="Show deleted"
                labelClassName="shrink-0 text-text-muted"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        {/* The card's whole body is the list, so it runs to the card's own
            edges. `padding="none"` and not `className="p-0"`: `cn` is clsx, so
            a `p-0` passed in lands beside the default `p-3` and loses on
            stylesheet order — which is how the dealer code ended up 59px from
            the left of a 360px screen. */}
        <CardContent padding="none" className="md:p-4">
          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load dealers"
              description={(error as Error).message}
            />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={<Building2 width={28} height={28} strokeWidth={1.75} />}
              title="No dealers yet"
              description="Start by onboarding your first dealer."
              cta={
                <Button
                  leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
                  onClick={() => setDrawerOpen(true)}
                >
                  Add dealer
                </Button>
              }
            />
          ) : data ? (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Code</TH>
                      {ROSTER_SERVICES.map((spec) => (
                        <TH key={spec.id}>{spec.label}</TH>
                      ))}
                    </TRow>
                  </THead>
                  <TBody>
                    {data.items.map((d) => (
                      <TRow
                        key={d.id}
                        clickable
                        onClick={() => navigate(`/dealers/${d.id}`)}
                        className={d.archivedAt ? 'opacity-60' : undefined}
                      >
                        <TD className="font-mono font-medium">
                          {dealerCodeLabel(d.code)}
                          {d.archivedAt ? (
                            <Badge intent="danger" className="ml-2">
                              Deleted
                            </Badge>
                          ) : null}
                        </TD>
                        {ROSTER_SERVICES.map((spec) => {
                          const entry = servicesByDealer
                            .get(d.id)
                            ?.get(spec.id);
                          return (
                            <TD
                              key={spec.id}
                              title={serviceStateTitle(entry, spec)}
                            >
                              <ServiceStateChip
                                entry={entry}
                                spec={spec}
                                loading={!servicesKnown(d.id)}
                              />
                            </TD>
                          );
                        })}
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md). `variant="rows"` because the list
                  fills a card that has no padding of its own: flush rows
                  divided by a hairline, rather than a bordered card floating
                  inside a bordered card. The dealer code now starts 25px from
                  the screen edge instead of 59px. */}
              <MobileCardList
                variant="rows"
                cards={data.items.map((d) => ({
                  key: d.id,
                  onClick: () => navigate(`/dealers/${d.id}`),
                  primary: (
                    <span
                      className={cn(
                        'block break-all font-mono font-medium text-text',
                        d.archivedAt && 'opacity-60',
                      )}
                    >
                      {dealerCodeLabel(d.code)}
                    </span>
                  ),
                  primaryRight: d.archivedAt ? (
                    <Badge intent="danger">Deleted</Badge>
                  ) : null,
                  // The roster's whole question is "was this done today", and on
                  // a phone the answer used to exist only in the `title` of a
                  // span nested inside the card's own <button> — a tooltip no
                  // touch gesture shows, on an element long-press cannot reach
                  // either. So `showWhen` is back on and the five services are
                  // a two-column list instead of a wrapped inline run: label
                  // left, state and date right, one service per line. It sits
                  // in `secondary` rather than `meta` because `meta` forces
                  // `text-xs`, and this is the content of the card.
                  secondary: (
                    <span className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 md:grid-cols-[64px_minmax(0,1fr)] md:gap-x-3">
                      {ROSTER_SERVICES.map((spec) => {
                        const entry = servicesByDealer.get(d.id)?.get(spec.id);
                        return (
                          <React.Fragment key={spec.id}>
                            <span className="text-text-subtle">
                              {spec.shortLabel}
                            </span>
                            <span className="min-w-0">
                              <ServiceStateChip
                                entry={entry}
                                spec={spec}
                                loading={!servicesKnown(d.id)}
                              />
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </span>
                  ),
                }))}
              />
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
              {isFetching ? (
                <p className="px-3 pb-2 text-xs text-text-subtle">
                  Refreshing...
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <DealerCreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        loading={createDealer.isPending}
        onSubmit={async (values) => {
          try {
            const dealer = await createDealer.mutateAsync(values);
            toast.success('Dealer created — start the onboarding journey');
            setDrawerOpen(false);
            navigate(`/dealers/${dealer.id}`);
          } catch (err) {
            const msg =
              err instanceof ApiError ? err.message : 'Failed to create dealer';
            toast.error(msg);
          }
        }}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-3 md:p-4">
      {/* Three across below md: at two columns these 18 bars are nine rows of
          grey, taller than the list they stand in for. */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
        {Array.from({ length: 18 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
