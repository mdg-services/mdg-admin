import { ChevronRight, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Callout, Card, EmptyState, SegmentedControl, Skeleton } from '@/components/ui';
import { type ReviewBy, useKavachGroupsQuery } from '@/hooks/api/useKavach';
import { groupSummary, sortGroups, waitingTotal } from '@/lib/kavachWords';

const STORE_KEY = 'kavach.reviewBy';

/** The By point / By outlet choice is remembered per admin, in this browser. */
function readBy(): ReviewBy {
  try {
    return window.localStorage.getItem(STORE_KEY) === 'outlet' ? 'outlet' : 'task';
  } catch {
    return 'task';
  }
}
function saveBy(by: ReviewBy): void {
  try {
    window.localStorage.setItem(STORE_KEY, by);
  } catch {
    /* A private window or blocked storage: the choice just is not remembered. */
  }
}

/**
 * The review desk: how many Kavach checks are waiting for a person, grouped by
 * point (every DSR photo of today, in one pass) or by outlet (one outlet's
 * everything). Opening a group starts a run through it.
 */
export function KavachReviewPage() {
  const [by, setBy] = React.useState<ReviewBy>(readBy);
  const groupsQ = useKavachGroupsQuery(by);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const groups = React.useMemo(() => sortGroups(groupsQ.data ?? []), [groupsQ.data]);
  const total = waitingTotal(groups);

  return (
    <div>
      <PageHeader
        title="Kavach"
        subtitle={
          groupsQ.isSuccess
            ? total > 0
              ? `${total} ${total === 1 ? 'check' : 'checks'} waiting for you`
              : 'Nothing is waiting for you'
            : 'The photos the outlets sent, to check'
        }
      />

      <div className="mb-3 md:max-w-xs">
        <SegmentedControl<ReviewBy>
          aria-label="Group the checks"
          value={by}
          onChange={(v) => {
            setBy(v);
            saveBy(v);
          }}
          options={[
            { value: 'task', label: 'By point' },
            { value: 'outlet', label: 'By outlet' },
          ]}
        />
      </div>

      {groupsQ.isError ? (
        <Callout onRetry={() => void groupsQ.refetch()}>The list could not be loaded.</Callout>
      ) : groupsQ.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck width={28} height={28} strokeWidth={1.5} className="text-success" aria-hidden />}
            title="Nothing to check right now"
            description="Every photo the outlets sent has been looked at. New ones show up here by themselves."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => {
            const to =
              by === 'task'
                ? `/kavach/review?code=${encodeURIComponent(g.key)}`
                : `/kavach/review?dealerId=${encodeURIComponent(g.key)}`;
            return (
              <li key={g.key}>
                <Link
                  to={to}
                  className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft px-2 text-sm font-semibold tabular-nums text-brand">
                    {g.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-text">{g.label}</span>
                    <span className="block break-words text-xs text-text-muted">
                      {g.sub ? `${g.sub} · ` : ''}
                      {groupSummary(g, now)}
                    </span>
                  </span>
                  {g.lateCount > 0 ? <Badge intent="danger">{g.lateCount} late</Badge> : null}
                  <ChevronRight width={18} height={18} strokeWidth={1.75} className="shrink-0 text-text-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
