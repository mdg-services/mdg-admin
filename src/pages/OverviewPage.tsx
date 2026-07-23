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
import { Link } from 'react-router-dom';

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
        <p className="truncate text-xs text-text-muted">
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
                : 'grid-cols-2 sm:max-w-lg',
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
              'mt-6 grid grid-cols-1 gap-4',
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
                <CardContent className="p-0">
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
              <CardContent>
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
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">{label}</span>
          <span
            className={
              tone === 'success'
                ? 'text-success'
                : tone === 'danger'
                  ? 'text-danger'
                  : 'text-text-subtle'
            }
            aria-hidden
          >
            {icon}
          </span>
        </div>
        <p className="mt-1 text-3xl font-semibold text-text">{value}</p>
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
          : 'grid-cols-2 sm:max-w-lg',
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent>
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
        className="p-3"
        cards={failures.map((r) => ({
          key: r.id,
          primary: (
            <span className="block truncate font-medium text-text">
              {r.serviceId}
            </span>
          ),
          primaryRight: <StatusChip kind="run" value={r.status} />,
          meta: (
            <span>
              {formatDateTime(r.startedAt)} ·{' '}
              <Link
                to={`/dealers/${r.dealerId}`}
                className="text-brand hover:underline"
              >
                {r.dealerId.slice(-6)}
              </Link>
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
  return (
    <ul className="divide-y divide-border">
      {runs.slice(0, 8).map((r) => (
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
  );
}
