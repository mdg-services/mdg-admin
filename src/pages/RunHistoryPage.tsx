import type { ServiceRun, ServiceRunStatus } from '@dk/shared';
import { AlertCircle, Clock } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Input,
  Label,
  Pagination,
  Select,
  Skeleton,
  StatusChip,
} from '@/components/ui';
import { useRunsQuery } from '@/hooks/api/useRuns';
import { formatDateTime, formatDuration, groupByDay } from '@/lib/format';

const STATUSES: Array<{ value: '' | ServiceRunStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
];

const PAGE_SIZE = 25;

export function RunHistoryPage() {
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = React.useState<ServiceRun | null>(null);

  const dealerId = search.get('dealerId') ?? undefined;
  const serviceId = search.get('serviceId') ?? undefined;
  const status =
    (search.get('status') as ServiceRunStatus | null) ?? undefined;
  const from = search.get('from') ?? undefined;
  const to = search.get('to') ?? undefined;
  const page = Number(search.get('page') ?? '1');

  const { data, isLoading, isError, error, isFetching } = useRunsQuery({
    dealerId,
    serviceId,
    status,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  function update(key: string, value: string | undefined) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearch(next, { replace: true });
  }

  const grouped = data ? groupByDay(data.items) : [];

  return (
    <div>
      <PageHeader
        title="Run history"
        subtitle="Timeline of every service execution."
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label htmlFor="dealerId">Dealer ID</Label>
            <Input
              id="dealerId"
              placeholder="24-char hex"
              defaultValue={dealerId ?? ''}
              onBlur={(e) => update('dealerId', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="serviceId">Service ID</Label>
            <Input
              id="serviceId"
              placeholder="plugin slug"
              defaultValue={serviceId ?? ''}
              onBlur={(e) => update('serviceId', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={status ?? ''}
              onChange={(e) =>
                update('status', e.target.value || undefined)
              }
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              defaultValue={from ?? ''}
              onChange={(e) => update('from', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              defaultValue={to ?? ''}
              onChange={(e) => update('to', e.target.value || undefined)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load run history"
          description={(error as Error).message}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Clock width={28} height={28} strokeWidth={1.75} />}
          title="No runs yet"
          description="Once services run, their results show up here."
        />
      ) : (
        <>
          <div className="grid gap-4">
            {grouped.map((g) => (
              <Card key={g.day}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                    <Clock
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="text-text-subtle"
                    />
                    <p className="text-sm font-semibold text-text">{g.day}</p>
                    <Badge intent="neutral">{g.items.length}</Badge>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.items.map((r) => (
                      <li
                        key={r.id}
                        className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2"
                        onClick={() => setOpen(r)}
                      >
                        <StatusChip kind="run" value={r.status} />
                        <span className="min-w-0 flex-1 truncate font-medium text-text">
                          {r.serviceId}
                        </span>
                        <span className="hidden text-xs text-text-muted md:inline">
                          {r.dealerId.slice(-6)}
                        </span>
                        <span className="text-xs text-text-muted">
                          {formatDateTime(r.startedAt)}
                        </span>
                        <span className="text-xs text-text-subtle">
                          {formatDuration(r.durationMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-3">
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => update('page', String(p))}
            />
          </div>
          {isFetching ? (
            <p className="mt-2 text-xs text-text-subtle">Refreshing...</p>
          ) : null}
        </>
      )}

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Run ${open.id.slice(-8)}` : ''}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open ? <RunDetail run={open} /> : null}
      </Dialog>
    </div>
  );
}

function RunDetail({ run }: { run: ServiceRun }) {
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Service" value={run.serviceId} />
        <Field
          label="Status"
          value={<StatusChip kind="run" value={run.status} />}
        />
        <Field label="Started" value={formatDateTime(run.startedAt)} />
        <Field label="Finished" value={formatDateTime(run.finishedAt)} />
        <Field label="Duration" value={formatDuration(run.durationMs)} />
        <Field label="Dealer" value={run.dealerId} />
      </div>
      {run.error ? (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Error
          </p>
          <pre className="overflow-auto rounded-md bg-surface-2 p-3 text-xs">
            {run.error.message}
            {run.error.stack ? `\n${run.error.stack}` : ''}
          </pre>
        </section>
      ) : null}
      <section>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Output
        </p>
        <pre className="max-h-72 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
          {JSON.stringify(run.output ?? null, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="text-text">{value}</p>
    </div>
  );
}
