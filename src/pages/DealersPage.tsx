import type { DealerStatus } from '@dk/shared';
import { AlertCircle, Building2, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Pagination,
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
import { useCreateDealer, useDealersQuery } from '@/hooks/api/useDealers';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { DealerCreateDrawer } from './dealers/DealerCreateDrawer';

const STATUS_OPTIONS: Array<{ value: '' | DealerStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const TOTAL_STEPS = 8;

const PAGE_SIZE = 20;

export function DealersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const searchTerm = search.get('q') ?? '';
  const status = (search.get('status') as DealerStatus | null) ?? undefined;
  const page = Number(search.get('page') ?? '1');

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
  });

  const createDealer = useCreateDealer();

  function setStatus(next: DealerStatus | '') {
    const params = new URLSearchParams(search);
    if (next) params.set('status', next);
    else params.delete('status');
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
              <Table>
                <THead>
                  <TRow>
                    <TH>Name</TH>
                    <TH>Code</TH>
                    <TH>Phone</TH>
                    <TH>Status</TH>
                    <TH>Progress</TH>
                    <TH>Onboarded</TH>
                  </TRow>
                </THead>
                <TBody>
                  {data.items.map((d) => (
                    <TRow
                      key={d.id}
                      clickable
                      onClick={() => navigate(`/dealers/${d.id}`)}
                    >
                      <TD className="font-medium">{d.name ?? '—'}</TD>
                      <TD className="font-mono text-text-muted">
                        {d.code ?? '—'}
                      </TD>
                      <TD className="text-text-muted">{d.phone}</TD>
                      <TD>
                        <StatusChip kind="dealer" value={d.status} />
                      </TD>
                      <TD className="text-text-muted">
                        {d.onboarding.completedStepCount}/{TOTAL_STEPS}
                      </TD>
                      <TD className="text-text-muted">
                        {formatDate(d.onboardingDate)}
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
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
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 18 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
