import { AlertCircle, Building2, Plus, Search } from 'lucide-react';
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
          <Button
            leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
            onClick={() => setDrawerOpen(true)}
          >
            Add dealer
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              width={16}
              height={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            />
            <Input
              type="search"
              placeholder="Search by name, phone, code, GST, PAN"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="md:w-56">
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
            <label className="flex shrink-0 items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-strong accent-brand"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show deleted
            </label>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
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
                      <TH>Phone</TH>
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
                        <TD className="text-text-muted">{d.phone ?? '—'}</TD>
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

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={data.items.map((d) => ({
                  key: d.id,
                  onClick: () => navigate(`/dealers/${d.id}`),
                  primary: (
                    <span
                      className={cn(
                        'block truncate font-mono font-medium text-text',
                        d.archivedAt && 'opacity-60',
                      )}
                    >
                      {dealerCodeLabel(d.code)}
                    </span>
                  ),
                  primaryRight: d.archivedAt ? (
                    <Badge intent="danger">Deleted</Badge>
                  ) : null,
                  secondary: <span className="truncate">{d.phone ?? '—'}</span>,
                  meta: (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {ROSTER_SERVICES.map((spec) => {
                        const entry = servicesByDealer.get(d.id)?.get(spec.id);
                        return (
                          <span
                            key={spec.id}
                            className="inline-flex items-center gap-1"
                            title={serviceStateTitle(entry, spec)}
                          >
                            {spec.shortLabel}
                            <ServiceStateChip
                              entry={entry}
                              spec={spec}
                              loading={!servicesKnown(d.id)}
                              showWhen={false}
                            />
                          </span>
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
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
