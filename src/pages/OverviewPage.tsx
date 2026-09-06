import { AlertCircle, CalendarDays, ChevronRight, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  IconButton,
  Skeleton,
} from '@/components/ui';
import { useBankHolidayPendingQuery } from '@/hooks/api/useBankHolidays';
import { useOverviewDayQuery, useOverviewHealthQuery } from '@/hooks/api/useOverview';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { CheckedAndClear } from '@/pages/overview/CheckedAndClear';
import {
  ageSince,
  dayInWords,
  dayRelativeToToday,
  timeOfDay,
  verdictDetail,
  verdictSentence,
} from '@/pages/overview/format';
import { NeedsAPerson } from '@/pages/overview/NeedsAPerson';
import { TodaysBoard } from '@/pages/overview/TodaysBoard';
import type { OverviewHealth } from '@dk/shared';

/**
 * "Today" — the screen an admin opens first.
 *
 * WHAT THIS REPLACED, AND WHY
 *
 * Five estate counters (dealers, active services, runs in 24h, failures in 24h,
 * a success rate), a recent-failures table keyed by the tail of a Mongo id, and
 * an "Upcoming runs" card that had never once rendered a row because the backend
 * has never sent `upcomingRuns`.
 *
 * Every one of those numbers was a fact with nowhere to go. "Failed (24h): 3"
 * does not say which outlet, does not say whether the machine is already
 * retrying, and cannot be acted on without opening two other screens. The
 * success rate was worse than useless: water-ingress-testing fires twelve times
 * a day per dealer and dominates the denominator, so a once-daily service
 * failing outright barely moves it — a percentage that cannot go red for the
 * failure you care about is worse than no percentage at all.
 *
 * THE TWO DATES
 *
 * The pipeline is graded against YESTERDAY, because a day's sales are only
 * knowable once the next morning's opening meter readings arrive. Grading today
 * would paint every outlet red until midnight. The queue, by contrast, is "right
 * now". Both are named in words in the subtitle so the two can never be read as
 * one.
 */
export function OverviewPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const selectedDate: string | undefined = undefined;
  const { data, isLoading, isError, error, refresh, refreshing } =
    useOverviewDayQuery(selectedDate);
  const health = useOverviewHealthQuery(isSuperAdmin);

  // Ages are rendered from raw instants against a ticking clock. The server
  // caches this payload for twenty seconds, so a duration baked in server-side
  // would visibly freeze and then jump a chunk.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const subtitle = data
    ? `Shift day ${dayInWords(data.reportingDate)} · queue as of ${timeOfDay(data.asOf)}`
    : 'Loading the day.';

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={subtitle}
        actions={
          <IconButton
            variant="ghost"
            aria-label="Refresh"
            loading={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw width={18} height={18} strokeWidth={1.75} />
          </IconButton>
        }
      />

      {isError && !data ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Unable to load today"
          description={(error as Error).message}
        />
      ) : null}
      {isError && data ? (
        <Callout intent="warning" className="mb-3" onRetry={() => void refresh()}>
          This did not refresh just now, so everything below is from{' '}
          {timeOfDay(data.asOf)}.
        </Callout>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : null}

      {data ? (
        <>
          {/* The verdict. Plain text, not a card and not a percentage — it is a
              sentence about the estate, and it reads from the same `done` the
              board does so the two can never disagree. */}
          <p className="text-lg font-semibold text-text">{verdictSentence(data)}</p>
          <p className="mt-0.5 text-sm text-text-muted">{verdictDetail(data)}</p>

          {/* Nothing computes Kavach status on read: a cron scores the estate at
              00:20 IST and stamps each programme. A sweep that failed raises no
              error anywhere — the estate simply stops expiring things and every
              Kavach cell below goes quietly green. This is the only warning. */}
          {data.kavachStaleProgrammes > 0 ? (
            <Callout intent="warning" className="mt-3">
              Kavach statuses are from before today — last night&apos;s scoring did not finish for{' '}
              {data.kavachStaleProgrammes} of {data.summary.dealersTotal} outlets. Every Kavach
              figure below is yesterday&apos;s.{' '}
              <Link to="/kavach/dashboard" className="font-medium underline">
                Open Kavach standing
              </Link>
            </Callout>
          ) : null}

          <HolidayConfirmBanner />

          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Needs a person</CardTitle>
                <CardSubtitle>
                  Waiting, late, or never sent — oldest first.
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardContent padding="none" className="md:p-4">
              <NeedsAPerson
                items={data.items}
                actCap={data.actCap}
                loading={false}
                selectedDate={selectedDate}
                now={now}
              />
            </CardContent>
          </Card>

          <Card className="mt-3 md:mt-4">
            <CardHeader>
              <div>
                <CardTitle>Today&apos;s board</CardTitle>
                <CardSubtitle>
                  Every outlet&apos;s {dayRelativeToToday(data.reportingDate, data.today)}, column by
                  column.
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardContent padding="none" className="md:p-4">
              <TodaysBoard
                rows={data.dealers}
                reportingDate={data.reportingDate}
                selectedDate={selectedDate}
                loading={false}
                now={now}
                kavachLastEvaluatedAt={data.kavachLastEvaluatedAt}
              />
            </CardContent>
          </Card>

          <Card className="mt-3 md:mt-4">
            <CardContent padding="none" className="md:p-4">
              <CheckedAndClear
                checks={data.checks}
                // Expanded when there is nothing else to read: on a quiet
                // morning this list is the whole page, and it is what turns
                // silence into evidence.
                defaultOpen={data.items.filter((i) => i.bucket === 'act').length === 0}
                onRetry={() => void refresh()}
              />
            </CardContent>
          </Card>

          {isSuperAdmin ? (
            <HealthChips data={health.data} failed={health.isError} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * The machinery's vital signs — always drawn for a super-admin, even when every
 * chip is grey. Their entire job is to certify that the silence above them is
 * real: with the scheduler off, every other signal on this page goes green
 * because there is nothing running to fail.
 */
function HealthChips({ data, failed }: { data?: OverviewHealth; failed: boolean }) {
  if (failed) {
    return (
      <p className="mt-3 px-3 text-xs font-medium text-danger md:px-0">
        Could not read the machinery&apos;s status — treat the all-clear above with caution.
      </p>
    );
  }
  if (!data) return null;
  const scheduledAge = data.lastScheduledRunAt
    ? ageSince(data.lastScheduledRunAt, Date.now())
    : null;
  const chips: Array<{ text: string; bad: boolean }> = [
    {
      text: data.schedulerEnabled
        ? `Scheduler ${scheduledAge ? `ran ${scheduledAge} ago` : 'has never run'}`
        : 'Scheduler OFF',
      // Water-ingress fires every two hours, so a longer silence is a dead tick
      // rather than a quiet estate.
      bad:
        !data.schedulerEnabled ||
        !data.lastScheduledRunAt ||
        Date.now() - new Date(data.lastScheduledRunAt).getTime() > 3 * 60 * 60 * 1000,
    },
    { text: `${data.stuckRuns} stuck`, bad: data.stuckRuns > 0 },
    {
      text: `${data.pluginCount} plugins`,
      // Deploy never cleans `dist/`, so prod has registered plugins that source
      // no longer defines — and they were attachable.
      bad: data.pluginCount !== data.expectedPluginCount,
    },
    {
      // The mode word first, because the count only means something once you
      // know it. In SHADOW the gate decides and releases anyway, so there is no
      // count to show; production runs ENFORCE, where a hold really is a report
      // a dealer is waiting for and nobody has been told.
      text:
        data.assuranceHolds === null
          ? `Gate ${data.assuranceMode}`
          : `Gate ${data.assuranceMode} · ${data.assuranceHolds} withheld`,
      bad: data.assuranceMode === 'OFF' || (data.assuranceHolds ?? 0) > 0,
    },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-3 text-xs text-text-subtle md:px-0">
      {chips.map((c) => (
        <span key={c.text} className={c.bad ? 'font-medium text-danger' : undefined}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

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
      className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-brand-soft px-4 py-3 transition-colors hover:bg-surface-2"
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
