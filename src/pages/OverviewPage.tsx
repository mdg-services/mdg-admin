import {
  Activity,
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plug,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  MobileCardList,
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useBankHolidayPendingQuery } from '@/hooks/api/useBankHolidays';
import { useOverviewQuery } from '@/hooks/api/useOverview';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration } from '@/lib/format';
import { serviceLabel } from '@/lib/serviceLabel';
import type { ServiceRun } from '@dk/shared';

/**
 * Super-admin nudge to confirm the national holidays the library suggests for the
 * current/coming month — enabled holidays roll the DOD due date forward, so an
 * unconfirmed month silently uses only weekends. Hidden when nothing is pending.
 */
function HolidayConfirmBanner() {
  const isSuperAdmin = useIsSuperAdmin();
  const { data } = useBankHolidayPendingQuery();
  if (!isSuperAdmin || !data || data.totalCount === 0) return null;
  const months = data.months.map((m) => m.label).join(', ');
  return (
    <Link
      to="/bank-holidays"
      className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-brand-soft px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <CalendarDays
        width={20}
        height={20}
        strokeWidth={1.75}
        className="shrink-0 text-brand"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">
          {data.totalCount} national holiday{data.totalCount === 1 ? '' : 's'} need
          confirmation
        </p>
        {/* Not `truncate`: this line is the only place the pending months are
            named, and at 360px it had ~176px to say them in — "Confirm August,
            Sep…". The banner is a Link, so the extra height only makes the
            target bigger. */}
        <p className="text-xs text-text-muted">
          Confirm {months} so the Credit &amp; DOD due dates roll forward correctly.
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand">
        Review
        <ChevronRight width={16} height={16} strokeWidth={2} />
      </span>
    </Link>
  );
}

export function OverviewPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const { data, isLoading, isError, error } = useOverviewQuery();

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={
          isSuperAdmin
            ? 'At-a-glance view of dealers, services, and recent runs.'
            : 'At-a-glance view of dealers and services.'
        }
      />

      <HolidayConfirmBanner />

      {isLoading ? <KpiSkeleton count={isSuperAdmin ? 5 : 2} /> : null}
      {isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Unable to load overview"
          description={(error as Error).message}
        />
      ) : null}

      {data ? (
        <>
          {/* Run throughput / failure-rate KPIs describe how the machinery is
              doing, not what a dealer got — super-admins only. */}
          <div
            className={cn(
              'grid gap-3',
              isSuperAdmin
                ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                : 'grid-cols-2 md:max-w-lg',
            )}
          >
            <Kpi
              label="Dealers"
              value={data.dealers.total}
              icon={<Building2 width={18} height={18} strokeWidth={1.75} />}
            />
            <Kpi
              label="Active services"
              value={data.services.active}
              icon={<Plug width={18} height={18} strokeWidth={1.75} />}
            />
            {isSuperAdmin ? (
              <>
                <Kpi
                  label="Runs (24h)"
                  value={data.runs.last24h}
                  icon={<Activity width={18} height={18} strokeWidth={1.75} />}
                />
                <Kpi
                  label="Failed (24h)"
                  value={data.runs.failedLast24h}
                  icon={
                    <AlertCircle width={18} height={18} strokeWidth={1.75} />
                  }
                  tone="danger"
                />
                <Kpi
                  label="Success rate"
                  value={`${Math.round(data.runs.successRate24h * 100)}%`}
                  icon={
                    <CheckCircle2 width={18} height={18} strokeWidth={1.75} />
                  }
                  tone="success"
                />
              </>
            ) : null}
          </div>

          <div
            className={cn(
              'mt-4 grid grid-cols-1 gap-3 md:mt-6 md:gap-4',
              isSuperAdmin ? 'lg:grid-cols-2' : null,
            )}
          >
            {/* Failure triage is a super-admin job; both the desktop table and
                the mobile card stack live inside this card. */}
            {isSuperAdmin ? (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Recent failures</CardTitle>
                    <CardSubtitle>Newest failed runs.</CardSubtitle>
                  </div>
                </CardHeader>
                {/* The body is a table at md+ and a divided row stack below
                    it, so below md it runs to the card's own edges. `md:p-4` is
                    what md+ has always rendered: the call site's old `p-0` lost
                    to the base padding, because `cn` is clsx and `.p-4` is
                    emitted after `.p-0`. */}
                <CardContent padding="none" className="md:p-4">
                  <RecentFailures runs={data.recentRuns} />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Upcoming runs</CardTitle>
                  <CardSubtitle>Next scheduled by service.</CardSubtitle>
                </div>
              </CardHeader>
              <CardContent padding="none" className="md:p-4">
                <UpcomingRuns runs={data.upcomingRuns ?? []} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tone?: 'success' | 'danger';
}) {
  return (
    <Card>
      {/* Five of these stack three rows deep on a phone before either list card
          starts, so the tile pays 8px a side and the figure drops a step.
          `md:p-4` holds md+ at the padding it has always had. */}
      <CardContent padding="tight" className="md:p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">{label}</span>
          {/* The icon is decorative (`aria-hidden`) and costs 30px of a ~124px
              KPI card at 360px, which is what wrapped "Active services" and
              "Success rate" onto two lines and left the five cards ragged. The
              value carries the meaning. */}
          <span
            className={cn(
              'hidden md:inline',
              tone === 'success'
                ? 'text-success'
                : tone === 'danger'
                  ? 'text-danger'
                  : 'text-text-subtle',
            )}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        <p className="mt-1 text-2xl font-semibold text-text md:text-3xl">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className={cn(
        'grid gap-3',
        count > 2
          ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
          : 'grid-cols-2 md:max-w-lg',
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent padding="tight" className="md:p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentFailures({
  runs,
}: {
  runs: ServiceRun[];
}) {
  const navigate = useNavigate();
  const failures = runs.filter((r) => r.status === 'FAILED').slice(0, 8);
  if (failures.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 width={24} height={24} strokeWidth={1.75} />}
        title="No recent failures"
        description="All runs in the last day succeeded."
      />
    );
  }
  return (
    <>
      {/* Desktop table (≥ md) */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TRow>
              <TH>Service</TH>
              <TH>Dealer</TH>
              <TH>Started</TH>
              <TH>Status</TH>
            </TRow>
          </THead>
          <TBody>
            {failures.map((r) => (
              <TRow key={r.id}>
                <TD className="font-medium">{r.serviceId}</TD>
                <TD>
                  <Link
                    to={`/dealers/${r.dealerId}`}
                    className="text-brand hover:underline"
                  >
                    {r.dealerId.slice(-6)}
                  </Link>
                </TD>
                <TD className="text-text-muted">{formatDateTime(r.startedAt)}</TD>
                <TD>
                  <StatusChip kind="run" value={r.status} />
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile card-stack (< md) */}
      <MobileCardList
        variant="rows"
        cards={failures.map((r) => ({
          key: r.id,
          // The whole card navigates. It used to be dead space around a 45x16px
          // inline `Link` set in `text-xs` — the only reachable thing on it. A
          // card with `onClick` renders as one `min-h-11 w-full` button, so the
          // dealer id below has to be plain text: an <a> inside a <button> is
          // a nested control.
          onClick: () => navigate(`/dealers/${r.dealerId}`),
          primary: (
            <span className="block truncate font-medium text-text">
              {r.serviceId}
            </span>
          ),
          primaryRight: <StatusChip kind="run" value={r.status} />,
          meta: (
            <span>
              {formatDateTime(r.startedAt)} · {r.dealerId.slice(-6)}
            </span>
          ),
        }))}
      />
    </>
  );
}

function UpcomingRuns({
  runs,
}: {
  runs: ServiceRun[];
}) {
  const isSuperAdmin = useIsSuperAdmin();
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<Clock width={24} height={24} strokeWidth={1.75} />}
        title="Nothing scheduled"
        description="Upcoming runs will appear here as services attach."
      />
    );
  }
  const shown = runs.slice(0, 8);
  return (
    <>
      {/* Desktop list (≥ md) — three unconstrained spans on one line. At 360px
          that row has 296px and a raw serviceId ("water-ingress-testing") plus
          a timestamp already overflows it, wrapping mid-value into a block
          where it is not possible to tell which value belongs to which run. */}
      <ul className="hidden divide-y divide-border md:block">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="font-medium text-text">
              {isSuperAdmin ? r.serviceId : serviceLabel(r.serviceId)}
            </span>
            <span className="text-text-muted">
              {formatDateTime(r.startedAt)}
            </span>
            <span className="text-xs text-text-subtle">
              {formatDuration(r.durationMs)}
            </span>
          </li>
        ))}
      </ul>

      {/* Mobile card-stack (< md) */}
      <MobileCardList
        variant="rows"
        cards={shown.map((r) => ({
          key: r.id,
          primary: (
            <span className="font-medium text-text">
              {isSuperAdmin ? r.serviceId : serviceLabel(r.serviceId)}
            </span>
          ),
          primaryRight: (
            <span className="text-xs text-text-subtle">
              {formatDuration(r.durationMs)}
            </span>
          ),
          meta: <span>Next run {formatDateTime(r.startedAt)}</span>,
        }))}
      />
    </>
  );
}
