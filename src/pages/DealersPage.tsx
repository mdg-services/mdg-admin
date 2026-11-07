import { AlertCircle, Building2, Plus, Search, Star } from 'lucide-react';
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
  SegmentedControl,
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
import { useSentinel } from '@/features/whatsapp/useInView';
import {
  useCreateDealer,
  useDealerServiceSummaryChunks,
  useDealersInfiniteQuery,
} from '@/hooks/api/useDealers';
import { useOnboardingBoardQuery } from '@/hooks/api/useOnboarding';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  DEALERS_VIEW_STORAGE_KEY,
  parseDealersView,
  rosterMatches,
  rosterRows,
  type DealersView,
  type RosterRow,
} from '@/lib/onboardingNext';
import {
  dealerCodeLabel,
  ROSTER_SERVICES,
  type DealerServiceSummaryEntry,
  type DealerStatus,
} from '@dk/shared';

import { DealerCreateDrawer } from './dealers/DealerCreateDrawer';
import { OnboardingRoster } from './dealers/OnboardingRoster';
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

/** The view this browser opens first: the one a person chose, else Services. */
function readDefaultView(): DealersView {
  try {
    return parseDealersView(window.localStorage.getItem(DEALERS_VIEW_STORAGE_KEY)) ?? 'services';
  } catch {
    return 'services';
  }
}

// No scroll box of its own to watch: the sentinel is measured against the screen.
// One shared object, so the observer is not rebuilt on every render.
const VIEWPORT = { current: null };

export function DealersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const isSuperAdmin = useIsSuperAdmin();
  const isMd = useMediaQuery('(min-width: 768px)');
  const searchTerm = search.get('q') ?? '';
  const status = (search.get('status') as DealerStatus | null) ?? undefined;
  // Held in the URL rather than component state because the list is
  // fetched a page at a time: the flag has to reach the query, not filter
  // the rows already loaded.
  const showArchived = isSuperAdmin && search.get('archived') === '1';

  // ── the view ── Services (what each outlet's services did today) or Onboarding
  // (who is still being set up, and what to do next). In the URL once chosen, so
  // Back and a shared link land on the same one; without it, the person's default.
  // The default is kept in this browser, as the sidebar order is.
  const [defaultView, setDefaultView] = React.useState<DealersView>(readDefaultView);
  const view = parseDealersView(search.get('view')) ?? defaultView;

  // The onboarding board feeds the Onboarding view, the count on its switch and the
  // "Setting up" tag on the Services rows, so it is read whichever view is open.
  const board = useOnboardingBoardQuery('open');
  // "Call on Wed" turns into "Call now" by the clock alone: re-read it every minute.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const roster = React.useMemo(() => rosterRows(board.data?.rows ?? [], now), [board.data, now]);
  const rosterShown = React.useMemo(
    () => roster.filter((r) => rosterMatches(r.row, searchTerm)),
    [roster, searchTerm],
  );
  const toDoCount = roster.filter((r) => r.next.urgency === 'now').length;
  const settingUp = React.useMemo(() => {
    const map = new Map<string, RosterRow>();
    for (const r of roster) if (r.row.kind === 'outlet') map.set(r.row.outlet.dealerId, r);
    return map;
  }, [roster]);

  function setView(next: DealersView) {
    const params = new URLSearchParams(search);
    params.set('view', next);
    setSearch(params, { replace: true });
  }

  function makeDefault(next: DealersView) {
    setDefaultView(next);
    try {
      window.localStorage.setItem(DEALERS_VIEW_STORAGE_KEY, next);
    } catch {
      // Not remembered: the choice holds until the page is closed.
    }
    toast.success(
      next === 'onboarding'
        ? 'Dealers now opens on Onboarding for you, in this browser.'
        : 'Dealers now opens on Services for you, in this browser.',
    );
  }

  const [searchInput, setSearchInput] = React.useState(searchTerm);

  // Debounce the search input.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchInput === searchTerm) return;
      const next = new URLSearchParams(search);
      if (searchInput) next.set('q', searchInput);
      else next.delete('q');
      setSearch(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const {
    data: pages,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useDealersInfiniteQuery({
    search: searchTerm || undefined,
    status,
    pageSize: PAGE_SIZE,
    sort: 'createdAt:desc',
    includeArchived: showArchived,
  });
  const items = React.useMemo(
    () => (pages?.pages ?? []).flatMap((p) => p.items),
    [pages],
  );
  const total = pages?.pages[0]?.total ?? 0;

  // The end of the list: reaching it asks for the next page. A failed page
  // stops the sentinel (`isError`) instead of retrying in a tight loop.
  const sentinelRef = useSentinel<HTMLDivElement>(
    VIEWPORT,
    view === 'services' && !!hasNextPage && !isFetchingNextPage && !isError,
    () => void fetchNextPage(),
  );

  const createDealer = useCreateDealer();

  // The roster's service columns, fetched a page of ids at a time. Kept out of
  // the dealer list request so the rows draw immediately and the chips fill in
  // behind them.
  const idChunks = React.useMemo(
    () => (pages?.pages ?? []).map((p) => p.items.map((d) => d.id)),
    [pages],
  );
  const summaries = useDealerServiceSummaryChunks(idChunks);
  const summaryStamp = summaries.map((q) => q.dataUpdatedAt).join(',');
  const servicesByDealer = React.useMemo(() => {
    const map = new Map<string, Map<string, DealerServiceSummaryEntry>>();
    for (const q of summaries) {
      for (const row of q.data?.items ?? []) {
        map.set(
          row.dealerId,
          new Map(row.services.map((e) => [e.serviceId, e])),
        );
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryStamp]);
  // "Not known yet" and "not attached" are different answers, and a dealer only
  // leaves the first for the second once the summary has a row for THEM — not
  // merely once a summary has arrived. A newly loaded page's rows draw before
  // its summary lands, so an id-by-id check is what keeps them from claiming,
  // for a second, that nothing is set up.
  const servicesKnown = (dealerId: string) => servicesByDealer.has(dealerId);

  function setStatus(next: DealerStatus | '') {
    const params = new URLSearchParams(search);
    if (next) params.set('status', next);
    else params.delete('status');
    setSearch(params, { replace: true });
  }

  function setShowArchived(next: boolean) {
    const params = new URLSearchParams(search);
    if (next) params.set('archived', '1');
    else params.delete('archived');
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

      {/* ── the view ── which columns the list carries, and which one opens first. */}
      <div className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
        <SegmentedControl<DealersView>
          aria-label="What the list shows"
          value={view}
          onChange={setView}
          options={[
            { value: 'services', label: 'Services' },
            {
              value: 'onboarding',
              label: toDoCount > 0 ? `Onboarding · ${toDoCount} to do` : 'Onboarding',
            },
          ]}
        />
        {view === defaultView ? (
          <span className="flex items-center gap-1.5 text-xs text-text-subtle">
            <Star width={14} height={14} strokeWidth={1.75} className="fill-current" aria-hidden />
            Opens first for you
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="self-start md:self-auto"
            leftIcon={<Star width={14} height={14} strokeWidth={1.75} aria-hidden />}
            onClick={() => makeDefault(view)}
          >
            Open this view first
          </Button>
        )}
      </div>

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
                view === 'onboarding'
                  ? isMd
                    ? 'Search by code, owner, phone, SAP code'
                    : 'Code, owner, phone, SAP code'
                  : isMd
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
          {/* The status and deleted filters narrow the server's paged list; the
              Onboarding view is every outlet still being set up, so they would
              do nothing there. */}
          {view === 'services' ? (
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
          ) : null}
        </CardContent>
      </Card>

      <Card>
        {/* The card's whole body is the list, so it runs to the card's own
            edges. `padding="none"` and not `className="p-0"`: `cn` is clsx, so
            a `p-0` passed in lands beside the default `p-3` and loses on
            stylesheet order — which is how the dealer code ended up 59px from
            the left of a 360px screen. */}
        <CardContent padding="none" className="md:p-4">
          {view === 'onboarding' ? (
            <OnboardingRoster
              rows={rosterShown}
              now={now}
              loading={board.isPending}
              failed={board.isError && !board.data}
              onRetry={() => void board.refetch()}
              filtered={searchTerm.trim().length > 0}
            />
          ) : isLoading ? (
            <ListSkeleton />
          ) : isError && !pages ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load dealers"
              description={(error as Error).message}
            />
          ) : pages && items.length === 0 ? (
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
          ) : pages ? (
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
                    {items.map((d) => (
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
                          ) : (
                            <SettingUpBadge item={settingUp.get(d.id)} className="ml-2" />
                          )}
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
                cards={items.map((d) => {
                  const entries = servicesByDealer.get(d.id);
                  // Why a service FAILED or needs a RESEND. On desktop the
                  // reason is the cell's tooltip; a tooltip does not exist
                  // under a finger, so on a phone the card said a bare red
                  // "Failed" and the admin had to open the dealer and dig
                  // through runs to learn what.
                  const notes = ROSTER_SERVICES.flatMap((spec) => {
                    const note = entries?.get(spec.id)?.note;
                    return note ? [{ spec, note }] : [];
                  });
                  return {
                    key: d.id,
                    onClick: () => navigate(`/dealers/${d.id}`),
                    // Sans and medium, as the Overview's "Today" board draws
                    // the same code: the two lists answer one question — is
                    // this outlet done today — and should read as one shape.
                    primary: (
                      <span
                        className={cn(
                          'block break-all font-medium text-text',
                          d.archivedAt && 'opacity-60',
                        )}
                      >
                        {dealerCodeLabel(d.code)}
                      </span>
                    ),
                    primaryRight: d.archivedAt ? (
                      <Badge intent="danger">Deleted</Badge>
                    ) : (
                      <SettingUpBadge item={settingUp.get(d.id)} />
                    ),
                    // The roster's whole question is "was this done today", and
                    // on a phone the answer used to exist only in the `title` of
                    // a span nested inside the card's own <button> — a tooltip
                    // no touch gesture shows. So the recency stays on, one
                    // service per row: label left, state and day right on one
                    // line. As a stacked badge-over-date block per service the
                    // card was 268px against the board's ~203px for the same
                    // five answers, and a page of dealers scrolled a third
                    // longer than it needed to.
                    kv: ROSTER_SERVICES.map((spec) => ({
                      label: spec.shortLabel,
                      value: (
                        <ServiceStateChip
                          entry={entries?.get(spec.id)}
                          spec={spec}
                          loading={!servicesKnown(d.id)}
                          layout="inline"
                        />
                      ),
                    })),
                    // Under the rows rather than under each chip: a reason as
                    // long as a portal's error message, right-aligned in the
                    // value column, squeezed the service names to nothing.
                    // Two lines each; the dealer's page has the rest.
                    meta:
                      notes.length > 0 ? (
                        <span className="grid gap-1">
                          {notes.map(({ spec, note }) => (
                            <span key={spec.id} className="line-clamp-2">
                              <span className="font-medium text-text-muted">
                                {spec.shortLabel}:
                              </span>{' '}
                              {note}
                            </span>
                          ))}
                        </span>
                      ) : undefined,
                  };
                })}
              />
              {/* Infinite scroll: the sentinel sits under the last row, and
                  the footer says how far along the list is. */}
              <div ref={sentinelRef} aria-hidden className="h-px" />
              <p
                className="px-3 py-3 text-sm text-text-muted"
                aria-live="polite"
              >
                {isFetchingNextPage ? (
                  'Loading more...'
                ) : isError ? (
                  <>
                    Could not load more.{' '}
                    <button
                      type="button"
                      className="font-medium text-text underline"
                      onClick={() => void fetchNextPage()}
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  `Showing ${items.length} of ${total}`
                )}
              </p>
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

/**
 * "Setting up" beside the code of an outlet that is still being onboarded, so a
 * row of dashes on the Services view says why: its services have not started.
 * Amber when the next move is MDG's; the tooltip says what it is.
 */
function SettingUpBadge({ item, className }: { item: RosterRow | undefined; className?: string }) {
  if (!item) return null;
  const { next } = item;
  return (
    <Badge
      intent={next.urgency === 'now' ? 'warning' : 'info'}
      className={cn('font-sans', className)}
      title={next.urgency === 'now' ? `To do: ${next.title}` : next.title}
    >
      {next.urgency === 'now' ? 'Setting up · to do' : 'Setting up'}
    </Badge>
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
