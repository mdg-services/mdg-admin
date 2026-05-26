import type { ServiceRun } from '@dk/shared';
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
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
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useOverviewQuery } from '@/hooks/api/useOverview';
import { formatDateTime, formatDuration } from '@/lib/format';

export function OverviewPage() {
  const { data, isLoading, isError, error } = useOverviewQuery();

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="At-a-glance view of dealers, services, and recent runs."
      />

      {isLoading ? <KpiSkeleton /> : null}
      {isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Unable to load overview"
          description={(error as Error).message}
        />
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
            <Kpi
              label="Runs (24h)"
              value={data.runs.last24h}
              icon={<Activity width={18} height={18} strokeWidth={1.75} />}
            />
            <Kpi
              label="Failed (24h)"
              value={data.runs.failedLast24h}
              icon={<AlertCircle width={18} height={18} strokeWidth={1.75} />}
              tone="danger"
            />
            <Kpi
              label="Success rate"
              value={`${Math.round(data.runs.successRate24h * 100)}%`}
              icon={<CheckCircle2 width={18} height={18} strokeWidth={1.75} />}
              tone="success"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
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
  );
}

function UpcomingRuns({
  runs,
}: {
  runs: ServiceRun[];
}) {
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
          <span className="font-medium text-text">{r.serviceId}</span>
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
