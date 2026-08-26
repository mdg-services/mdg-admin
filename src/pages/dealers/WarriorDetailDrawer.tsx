import {
  AlertCircle,
  BadgeCheck,
  Gauge,
  Layers,
  ScrollText,
  Trophy,
  Undo2,
  UserRound,
} from 'lucide-react';
import * as React from 'react';

import {
  ChartLegend,
  ColumnChart,
  LEGEND_SWATCHES,
  Meter,
  RankedBars,
  StatTile,
  type ColumnDatum,
} from '@/components/charts';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Drawer,
  EmptyState,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Tabs,
  formatDateRangeLabel,
  type DateRangeValue,
} from '@/components/ui';
import { useEffectiveWorkItems } from '@/hooks/api/useDealerWorkList';
import {
  useDealerLeaveQuery,
  useStaffAwardsQuery,
  useStaffOverviewQuery,
} from '@/hooks/api/useStaff';
import { ApiError } from '@/lib/api';
import { formatYmd, inrFormat } from '@/lib/format';
import { fmtPoints } from '@/lib/staffWork';
import { bucketDays, buildWarriorStats, buildWorkMeta, previousWindow } from '@/lib/warriorStats';
import type { EmployeeWithPoints, StaffPointAward, StaffPointsSummary } from '@dk/shared';

/**
 * One warrior, opened out of the leaderboard or the roster.
 *
 * Everything in here is scoped to the SAME window the tab's date filter is on —
 * the drawer takes `range` rather than owning a filter of its own. Two date
 * controls on one screen is how a reader ends up comparing a worker's week
 * against the team's month and believing the gap.
 *
 * The one number measured outside that window is the delta on the points tile,
 * and it names the dates it is measured against every time it is shown.
 *
 * All of it is derived from the per-employee award ledger the API already
 * serves, so this view cannot drift from the leaderboard that opened it.
 */

const LEDGER_ROW_CAP = 1000;

/** Above this many days the chart aggregates; see `bucketDays`. */
const MAX_CHART_COLUMNS = 62;

/**
 * How many columns the chart PLOTS on a phone, and the floor on a column's
 * width once the reader asks for all of them.
 *
 * The arithmetic: this drawer is a bottom sheet below md, so at 360px the plot
 * has ~294px (360 − 32 sheet padding − 2 border − 32 card padding). Sixty-two
 * columns with a 2px gap is ~2.8px each, and each column is a real button — the
 * only route to that day's figure. Fourteen gives ~19px, which a thumb can
 * aim at; asking for the rest puts the plot in its own 14px-per-column strip.
 * Both numbers are ignored at ≥ md, where the full window is plotted as today.
 */
const PHONE_CHART_COLUMNS = 14;
const PHONE_MIN_COLUMN_PX = 14;

/** How many rows the ranked lists show before the "show all" toggle. */
const TOP_N = 8;

/** How much of the dealer's ranking the standing card shows as context. */
const STANDING_ROWS = 10;

/**
 * Ledger rows rendered before the "show the rest" button.
 *
 * The panel is an overlay, so the tab's own history — itself up to 1000 rows in
 * two renderings — is still mounted underneath it. Rendering another 1000 here
 * on a tab switch puts ~4,000 table rows and card stacks in one document, which
 * a low-end Android WebView feels as a freeze on a tap that looks instant.
 */
const LEDGER_PAGE = 100;

export interface WarriorDetailDrawerProps {
  dealerId: string;
  /** The worker to show; `null` closes the drawer. */
  employeeId: string | null;
  roster: EmployeeWithPoints[];
  summary?: StaffPointsSummary;
  /** The tab's window. Every figure in here is scoped to it. */
  range: DateRangeValue;
  onClose: () => void;
  /** Hands an award back to the tab's existing undo confirmation. */
  onUndoAward: (award: StaffPointAward) => void;
}

export function WarriorDetailDrawer({
  dealerId,
  employeeId,
  roster,
  summary,
  range,
  onClose,
  onUndoAward,
}: WarriorDetailDrawerProps) {
  const open = employeeId !== null;
  const employee = roster.find((e) => e.id === employeeId);
  const name =
    employee?.name ??
    summary?.rows.find((r) => r.employeeId === employeeId)?.employeeName ??
    'Warrior';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {initials(name)}
          </span>
          <span className="min-w-0 truncate">{name}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {employee?.designation ? <span>{employee.designation}</span> : null}
          {employee?.phone ? <span>· {employee.phone}</span> : null}
          {employee ? (
            <Badge intent={employee.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {employee.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Badge>
          ) : null}
          {employee?.onLeaveToday ? <Badge intent="warning">On leave today</Badge> : null}
        </span>
      }
    >
      {/* The body is a separate component, mounted only while the panel is
          open and re-mounted per warrior. That is what keeps four queries and a
          per-day fold from running behind a closed drawer on every render of
          the tab, and it resets the tab/expand state for free — a reset effect
          would have had to do both by hand, and only after a render. */}
      {employeeId !== null ? (
        <WarriorDetailBody
          key={employeeId}
          dealerId={dealerId}
          employeeId={employeeId}
          summary={summary}
          range={range}
          onUndoAward={onUndoAward}
        />
      ) : null}
    </Drawer>
  );
}

function WarriorDetailBody({
  dealerId,
  employeeId,
  summary,
  range,
  onUndoAward,
}: {
  dealerId: string;
  employeeId: string;
  summary?: StaffPointsSummary;
  range: DateRangeValue;
  onUndoAward: (award: StaffPointAward) => void;
}) {
  const [tab, setTab] = React.useState('overview');
  const [showAllWorks, setShowAllWorks] = React.useState(false);

  const prev = React.useMemo(() => previousWindow(range.from, range.to), [range.from, range.to]);

  // The ledger, for everything that needs per-award detail: the day series, the
  // work/domain/awarder breakdowns, the measured output, the ledger table.
  const awardsQ = useStaffAwardsQuery(dealerId, {
    from: range.from,
    to: range.to,
    employeeId,
  });

  // The previous window is only ever ONE NUMBER, so it reads the summary
  // aggregate rather than a second ledger. That is not just smaller (≈40 summary
  // rows instead of up to 1000 award rows on the drawer's critical path) — it is
  // the only correct source: `queryLedger` caps at 1000 rows and drops the
  // OLDEST, so summing a truncated ledger would report a fall as a rise and say
  // nothing about it. `includeInactive` is on so a deactivated worker still
  // resolves.
  const prevQ = useStaffOverviewQuery(dealerId, {
    from: prev.from,
    to: prev.to,
    includeInactive: true,
  });

  const leaveQ = useDealerLeaveQuery(dealerId, { from: range.from, to: range.to });
  const worksQ = useEffectiveWorkItems(dealerId);

  const summaryRows = React.useMemo(() => summary?.rows ?? [], [summary]);
  const rankIdx = summaryRows.findIndex((r) => r.employeeId === employeeId);
  const targetPerDay = summary?.targetPoints ?? 0;

  const awards = React.useMemo(() => awardsQ.data ?? [], [awardsQ.data]);

  const leaveDates = React.useMemo(
    () =>
      new Set((leaveQ.data ?? []).filter((l) => l.employeeId === employeeId).map((l) => l.date)),
    [leaveQ.data, employeeId],
  );

  const workMeta = React.useMemo(() => buildWorkMeta(worksQ.data), [worksQ.data]);

  const stats = React.useMemo(
    () =>
      buildWarriorStats({
        awards,
        from: range.from,
        to: range.to,
        leaveDates,
        targetPerDay,
        workMeta,
      }),
    [awards, range.from, range.to, leaveDates, targetPerDay, workMeta],
  );

  const prevTotal =
    prevQ.data?.summary.rows.find((r) => r.employeeId === employeeId)?.totalPoints ?? 0;

  const teamTotal = summaryRows.reduce((s, r) => s + r.totalPoints, 0);

  /**
   * The ledger this panel is built from is capped server-side. Everything
   * derived from it — the day chart, the averages, the breakdowns — then
   * describes only the newest 1000 entries, while the Standing card next to it
   * shows the same warrior's uncapped server-side total. Said once at the top,
   * because Overview is the tab an admin actually reads; the Ledger tab repeats
   * it against the table it applies to.
   */
  const ledgerTruncated = awards.length >= LEDGER_ROW_CAP;

  // Leave is not decoration: it is the denominator of "days at target" and of
  // the working-day average, and an empty leave list is indistinguishable from
  // "no leave recorded". Hold the skeleton until it lands rather than printing
  // confident numbers and silently rewriting them a second later.
  const loading = awardsQ.isLoading || leaveQ.isLoading;
  const stale =
    (awardsQ.isFetching || leaveQ.isFetching) && !awardsQ.isLoading && !leaveQ.isLoading;

  return (
    // A refetch — a new window, an undo, a background revalidation — holds the
    // rendered panel and dims it rather than dropping to a skeleton. Charts that
    // blank and re-measure on every filter change read as a page reload.
    <div className={stale ? 'opacity-60 transition-opacity' : undefined}>
      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Gauge width={13} height={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>
          Everything below covers{' '}
          <span className="font-medium text-text">{formatDateRangeLabel(range)}</span> (
          {stats.totalDays} day{stats.totalDays === 1 ? '' : 's'}) — the window selected on this
          tab.
          {targetPerDay > 0 ? (
            <> Target is {fmtPoints(targetPerDay)} points per warrior per day.</>
          ) : null}
        </span>
      </p>

      {awardsQ.isError ? (
        <LoadError
          message={
            awardsQ.error instanceof ApiError
              ? awardsQ.error.message
              : 'Could not load this warrior’s awards.'
          }
          onRetry={() => void awardsQ.refetch()}
        />
      ) : loading ? (
        <DetailSkeleton />
      ) : (
        <>
          {ledgerTruncated ? (
            <Callout className="mt-3">
              This window filled the {LEDGER_ROW_CAP}-entry maximum for a single
              request, so every figure below is built from the newest{' '}
              {LEDGER_ROW_CAP} entries only and older ones may be missing. The
              ranking further down comes from the server and is complete, so the
              two can disagree here. Narrow the date range for an exact read.
            </Callout>
          ) : null}
          {leaveQ.isError ? (
            <Callout className="mt-3" onRetry={() => void leaveQ.refetch()}>
              Could not load this dealer’s leave records, so days off are counted
              as working days: “days at target” and the working-day average are
              measured against a denominator that may be too large.
            </Callout>
          ) : null}

          {/* Headline numbers, always visible above the tabs. */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile
              label="Points earned"
              value={fmtPoints(stats.totalPoints)}
              unit="pts"
              delta={
                prevQ.isSuccess
                  ? {
                      value: Math.round((stats.totalPoints - prevTotal) * 100) / 100,
                      // The dates live in the caption, which wraps. Spelled out
                      // on the delta line they truncate to "vs 31 May…" at tile
                      // width, which names no period at all.
                      label: `vs previous ${stats.totalDays} day${
                        stats.totalDays === 1 ? '' : 's'
                      }`,
                      format: fmtPoints,
                      goodWhen: 'up',
                    }
                  : undefined
              }
              caption={
                prevQ.isSuccess
                  ? `Compared with ${formatDateRangeLabel(prev)}`
                  : undefined
              }
            />
            <StatTile
              label="Rank"
              value={rankIdx >= 0 ? `#${rankIdx + 1}` : '—'}
              caption={
                rankIdx >= 0
                  ? `of ${summaryRows.length} warrior${summaryRows.length === 1 ? '' : 's'}`
                  : 'Not on the leaderboard for this window'
              }
            />
            <StatTile
              label="Days at target"
              value={targetPerDay > 0 ? `${stats.daysAtTarget}/${stats.workedDays}` : '—'}
              caption={
                targetPerDay > 0
                  ? `${stats.workedDays} working day${
                      stats.workedDays === 1 ? '' : 's'
                    }${stats.leaveDays > 0 ? ` · ${stats.leaveDays} on leave` : ''}`
                  : 'No target set'
              }
            />
            <StatTile
              label="Avg per working day"
              value={fmtPoints(stats.avgPerWorkedDay)}
              unit="pts"
              caption={`${stats.awardCount} award${
                stats.awardCount === 1 ? '' : 's'
              } · ${stats.distinctWorks} kind${stats.distinctWorks === 1 ? '' : 's'} of work`}
            />
          </div>

          <Tabs
            className="mt-4"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'overview', label: 'Overview' },
              { id: 'work', label: 'Work done' },
              { id: 'ledger', label: `Ledger (${stats.awardCount})` },
            ]}
          />

          <div className="mt-4 grid gap-4">
            {tab === 'overview' ? (
              <OverviewTab
                stats={stats}
                targetPerDay={targetPerDay}
                summaryRows={summaryRows}
                rankIdx={rankIdx}
                employeeId={employeeId}
                teamTotal={teamTotal}
              />
            ) : null}

            {tab === 'work' ? (
              <WorkTab
                stats={stats}
                showAll={showAllWorks}
                onToggleAll={() => setShowAllWorks((v) => !v)}
                metaPending={worksQ.isLoading}
              />
            ) : null}

            {tab === 'ledger' ? (
              <LedgerTab stats={stats} awards={awards} onUndoAward={onUndoAward} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Overview tab ───────────────────────────── */

function OverviewTab({
  stats,
  targetPerDay,
  summaryRows,
  rankIdx,
  employeeId,
  teamTotal,
}: {
  stats: ReturnType<typeof buildWarriorStats>;
  targetPerDay: number;
  summaryRows: StaffPointsSummary['rows'];
  /** This warrior's index in `summaryRows`, or -1 when they are not on it. */
  rankIdx: number;
  employeeId: string;
  teamTotal: number;
}) {
  const singleDay = stats.totalDays === 1;
  const bucketed = stats.totalDays > MAX_CHART_COLUMNS;
  /* The mini-ranking is context, not the leaderboard — a 40-worker roster would
     push everything below it off the panel. Show the head of the table and,
     when the warrior in front of us is not in it, their own row appended with
     its TRUE rank so the jump is visible rather than disguised as #11. */
  const standingRows = React.useMemo(() => {
    const head = summaryRows.slice(0, STANDING_ROWS).map((row, i) => ({ row, rank: i + 1 }));
    const self = rankIdx >= STANDING_ROWS ? summaryRows[rankIdx] : undefined;
    return self ? [...head, { row: self, rank: rankIdx + 1 }] : head;
  }, [summaryRows, rankIdx]);

  const columns: ColumnDatum[] = React.useMemo(
    () =>
      bucketDays(
        stats.days,
        (ymd) => formatYmd(ymd, { weekday: true }),
        (ymd) => String(Number(ymd.slice(8, 10))),
        MAX_CHART_COLUMNS,
      ).map((b) => ({
        key: b.key,
        tick: b.tick,
        label: b.label,
        value: b.value,
        muted: b.onLeave,
        note:
          b.days === 1
            ? [
                b.onLeave ? 'on leave' : null,
                `${b.awardCount} award${b.awardCount === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : [
                `${b.days} days`,
                b.leaveDays > 0 ? `${b.leaveDays} on leave` : null,
                `${b.awardCount} award${b.awardCount === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · '),
      })),
    [stats.days],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge width={16} height={16} strokeWidth={1.75} />
              {singleDay ? 'Progress against the daily target' : 'Points per day'}
            </CardTitle>
            <CardSubtitle>
              {singleDay
                ? 'A one-day window is a single number, not a trend — widen the range to see the shape.'
                : bucketed
                  ? 'This window is long, so each column is the average of several days. The target line still reads per day.'
                  : 'One column per day. The dashed line is the per-day target every warrior should reach.'}
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          {singleDay ? (
            <Meter
              // `Meter` used to truncate its label to make room for the value,
              // and "Points on Sat, 12 Jul 2026" needs ~200px of the ~190px it
              // gets at 360px — so the date, the only thing the label says, was
              // the half that got cut. The label now wraps below md and keeps
              // its `truncate` at md, so the whole string survives here.
              label={`Points on ${formatYmd(stats.days[0]?.date, { weekday: true })}`}
              value={stats.totalPoints}
              // The limit is the TARGET, not the bigger of the two. Stretching
              // the scale to fit an over-target day would make 150-against-100
              // and 100-against-100 draw the same full bar for opposite reasons;
              // clamping at 100% means a full bar always reads "target met", and
              // the label carries the overshoot.
              limit={targetPerDay > 0 ? targetPerDay : Math.max(stats.totalPoints, 1)}
              valueLabel={
                targetPerDay > 0
                  ? `${fmtPoints(stats.totalPoints)} / ${fmtPoints(targetPerDay)} pts`
                  : `${fmtPoints(stats.totalPoints)} pts`
              }
              caption={
                stats.days[0]?.onLeave
                  ? 'Marked on leave for this day.'
                  : `${stats.awardCount} award${stats.awardCount === 1 ? '' : 's'} logged.`
              }
            />
          ) : (
            <>
              <ColumnChart
                data={columns}
                target={targetPerDay > 0 ? targetPerDay : undefined}
                formatValue={(n) => `${fmtPoints(n)} pts${bucketed ? '/day' : ''}`}
                // Both budgets are below-md only, and the chart resolves that
                // itself: an unqualified `minColumnPx` would make the DESKTOP
                // plot a sideways scroller at 62 columns, and an unqualified
                // `defaultTableOpen` would open a table that this call site
                // (unlike most) also renders at ≥ md.
                maxColumns={PHONE_CHART_COLUMNS}
                minColumnPxBelowMd={PHONE_MIN_COLUMN_PX}
                tableOpenBelowMd
                idleReadout={
                  stats.bestDay ? (
                    <>
                      Best day{' '}
                      <span className="font-medium text-text">{formatYmd(stats.bestDay.date)}</span>{' '}
                      ·{' '}
                      <span className="font-semibold text-text">
                        {fmtPoints(stats.bestDay.points)} pts
                      </span>
                      {/* On a bucketed chart no column shows that figure — each
                          one is a multi-day mean — so do not send the reader
                          hunting for it among the columns. */}
                      {bucketed ? (
                        ' — no single column shows it; each column averages several days.'
                      ) : (
                        // A phone has neither a hover nor a Tab key. The tap
                        // path is real now (ColumnChart selects on
                        // `pointerdown`), and the value table below is open by
                        // default there — so say what actually works.
                        <>
                          <span className="md:hidden">
                            {' '}
                            — tap a column for any day, or read the table below.
                          </span>
                          <span className="hidden md:inline">
                            {' '}
                            — hover or tab through the columns for any day.
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    'No points were earned in this window.'
                  )
                }
                tableCaption={
                  bucketed ? 'Show every column as a table' : 'Show every day as a table'
                }
                tableValueHeader={bucketed ? 'Avg pts / day' : 'Points'}
              />
              <ChartLegend
                className="mt-3"
                items={[
                  {
                    key: 'points',
                    label: 'Points earned',
                    swatch: LEGEND_SWATCHES.series,
                  },
                  { key: 'none', label: 'No points', swatch: LEGEND_SWATCHES.none },
                  // Keyed on whether a hatched column is actually DRAWN, not on
                  // whether leave exists: a bucketed chart has no single-day
                  // columns to hatch, and legending a mark that never appears
                  // sends the reader looking for something that is not there.
                  ...(columns.some((c) => c.muted)
                    ? [
                        {
                          key: 'leave',
                          label: 'On leave',
                          swatch: LEGEND_SWATCHES.muted,
                        },
                      ]
                    : []),
                  ...(targetPerDay > 0
                    ? [
                        {
                          key: 'target',
                          label: `Daily target (${fmtPoints(targetPerDay)})`,
                          swatch: LEGEND_SWATCHES.threshold,
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck width={16} height={16} strokeWidth={1.75} />
              Consistency
            </CardTitle>
            <CardSubtitle>
              Whether the points came steadily or in a couple of big days.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact
              label="Days with points"
              value={`${stats.activeDays}`}
              hint={`of ${stats.workedDays} working`}
            />
            <Fact
              label="Days at target"
              value={targetPerDay > 0 ? `${stats.daysAtTarget}` : '—'}
              hint={targetPerDay > 0 ? `≥ ${fmtPoints(targetPerDay)} pts` : undefined}
            />
            <Fact
              label="Longest run at target"
              value={targetPerDay > 0 ? `${stats.longestTargetRun}` : '—'}
              hint={targetPerDay > 0 ? 'consecutive days' : undefined}
            />
            <Fact
              label="Best day"
              value={stats.bestDay ? fmtPoints(stats.bestDay.points) : '—'}
              hint={stats.bestDay ? formatYmd(stats.bestDay.date) : undefined}
            />
            <Fact
              label="Days on leave"
              value={`${stats.leaveDays}`}
              // A leave day that still earned points counts as worked, so it is
              // NOT held out of the average — say which number actually was.
              hint={
                stats.leaveDays === 0
                  ? 'none recorded'
                  : stats.leaveOnlyDays === stats.leaveDays
                    ? 'excluded from the average'
                    : `${stats.leaveOnlyDays} excluded from the average`
              }
            />
            <Fact
              label="Awards logged"
              value={`${stats.awardCount}`}
              hint={`${stats.distinctWorks} kinds of work`}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy width={16} height={16} strokeWidth={1.75} />
              Standing at this dealer
            </CardTitle>
            <CardSubtitle>
              Where this warrior sits against the rest of the roster, same window.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* The share is only meaningful when this warrior is one of the rows
              `teamTotal` was summed from. They are not, when they have been
              deactivated and "Include inactive" is off: their ledger still has
              every point, the leaderboard has none of them, and dividing the
              one by the other printed things like "133.3%" of a team they were
              not counted in. */}
          {rankIdx < 0 && summaryRows.length > 0 ? (
            <p className="text-sm text-text-muted">
              This warrior is not on the leaderboard for this window, so their
              points are not part of the team total below. Tick “Include
              inactive” on the tab to rank them alongside everyone else.
            </p>
          ) : null}
          {/* `teamTotal > 0` gates the METER only. Folding it into the "not on
              the leaderboard" test told a perfectly ranked warrior they were
              missing, on any window where the whole team had yet to score —
              which is every morning before the dealer submits the day. */}
          {rankIdx >= 0 && teamTotal > 0 ? (
            <Meter
              label="Share of the team’s points"
              value={stats.totalPoints}
              limit={teamTotal}
              valueLabel={`${((stats.totalPoints / teamTotal) * 100).toFixed(1)}%`}
              caption={`${fmtPoints(stats.totalPoints)} of ${fmtPoints(
                teamTotal,
              )} pts earned across ${summaryRows.length} warrior${
                summaryRows.length === 1 ? '' : 's'
              }.`}
            />
          ) : null}

          {summaryRows.length > 0 ? (
            <>
              <RankedBars
                showRank
                // No emphasis when the subject is absent from the list —
                // `highlightKey` matching nothing greys out every bar, which
                // reads as a broken chart rather than as "they are not here".
                highlightKey={rankIdx >= 0 ? employeeId : undefined}
                formatValue={(n) => `${fmtPoints(n)} pts`}
                data={standingRows.map(({ row, rank }) => ({
                  key: row.employeeId,
                  label: row.employeeName,
                  value: row.totalPoints,
                  rank,
                  secondary: `${row.awardCount} award${row.awardCount === 1 ? '' : 's'}`,
                }))}
              />
              {standingRows.length < summaryRows.length ? (
                <p className="text-xs text-text-subtle">
                  Showing the top {STANDING_ROWS} of {summaryRows.length} warriors
                  {rankIdx >= STANDING_ROWS ? `, plus this one at #${rankIdx + 1}` : ''}. The full
                  ranking is the leaderboard behind this panel.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-text-muted">No warrior earned points in this window.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ─────────────────────────────── Work-done tab ──────────────────────────── */

function WorkTab({
  stats,
  showAll,
  onToggleAll,
  metaPending,
}: {
  stats: ReturnType<typeof buildWarriorStats>;
  showAll: boolean;
  onToggleAll: () => void;
  metaPending: boolean;
}) {
  const works = showAll ? stats.byWork : stats.byWork.slice(0, TOP_N);
  // Gated on the work list for the same reason the domain card is: until it
  // lands, a rupee-per-1000 work entered as a raw quantity is filed as a
  // dimensionless "Unit" instead of as money.
  const hasOutput = !metaPending && (stats.units.length > 0 || stats.amountRupees > 0);

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers width={16} height={16} strokeWidth={1.75} />
              What this warrior actually did
            </CardTitle>
            <CardSubtitle>
              Every work they were awarded for, biggest point contribution first.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          {stats.byWork.length === 0 ? (
            <p className="text-sm text-text-muted">No work was awarded in this window.</p>
          ) : (
            <>
              <RankedBars
                data={works.map((w) => ({
                  key: w.key,
                  label: w.label,
                  value: w.points,
                  secondary: `${w.count}×`,
                }))}
                total={stats.totalPoints}
                formatValue={(n) => `${fmtPoints(n)} pts`}
              />
              {stats.byWork.length > TOP_N ? (
                <Button variant="ghost" size="sm" className="mt-3" onClick={onToggleAll}>
                  {showAll ? `Show top ${TOP_N}` : `Show all ${stats.byWork.length} works`}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">Where the effort went</CardTitle>
            <CardSubtitle>The same points grouped by area of the pump.</CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Both of the cards below are JOINS against the dealer's work list —
              the award ledger carries a label but no domain and no unit. Drawn
              before that list lands they are not merely incomplete, they are
              wrong: every work falls to "Other / retired" and every per-unit
              quantity collapses into one meaningless "Units" bucket. A skeleton
              is the honest render; the caption cannot fix a wrong number. */}
          {metaPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-4/5" />
              <Skeleton className="h-9 w-3/5" />
            </div>
          ) : stats.byDomain.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing to group yet.</p>
          ) : (
            <RankedBars
              data={stats.byDomain.map((d) => ({
                key: d.key,
                label: d.label,
                value: d.points,
                secondary: `${d.count} award${d.count === 1 ? '' : 's'}`,
              }))}
              total={stats.totalPoints}
              formatValue={(n) => `${fmtPoints(n)} pts`}
            />
          )}
        </CardContent>
      </Card>

      {hasOutput ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-base">Measured output</CardTitle>
              <CardSubtitle>
                The countable side of the per-unit works — what the points were paid on, in the
                units the work is priced in.
              </CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.amountRupees > 0 ? (
                <Fact
                  label="Fuel & sales logged"
                  value={inrFormat(stats.amountRupees)}
                  hint="per ₹1,000 works"
                />
              ) : null}
              {stats.units.map((u) => (
                <Fact key={u.key} label={u.label} value={fmtPoints(u.quantity)} />
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

/* ───────────────────────────────── Ledger tab ───────────────────────────── */

function LedgerTab({
  stats,
  awards,
  onUndoAward,
}: {
  stats: ReturnType<typeof buildWarriorStats>;
  awards: StaffPointAward[];
  onUndoAward: (a: StaffPointAward) => void;
}) {
  const [limit, setLimit] = React.useState(LEDGER_PAGE);
  const shown = React.useMemo(() => awards.slice(0, limit), [awards, limit]);

  return (
    <>
      {stats.byAwarder.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound width={16} height={16} strokeWidth={1.75} />
                Who awarded these points
              </CardTitle>
              <CardSubtitle>Dealer submissions and admin corrections, side by side.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={stats.byAwarder.map((a) => ({
                key: a.key,
                label: a.label,
                value: a.points,
                secondary: `${a.count} entr${a.count === 1 ? 'y' : 'ies'}`,
              }))}
              total={stats.totalPoints}
              formatValue={(n) => `${fmtPoints(n)} pts`}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText width={16} height={16} strokeWidth={1.75} />
              Award ledger
            </CardTitle>
            <CardSubtitle>
              {awards.length} entr{awards.length === 1 ? 'y' : 'ies'} for this warrior in
              the window, newest work date first
              {shown.length < awards.length ? `, showing the first ${shown.length}` : ''}.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {awards.length === 0 ? (
            <EmptyState
              icon={<ScrollText width={28} height={28} strokeWidth={1.75} />}
              title="No awards in this window"
              description="This warrior earned no points during the selected date range."
            />
          ) : (
            <>
              {awards.length >= LEDGER_ROW_CAP ? (
                <Callout className="m-3">
                  This window filled the {LEDGER_ROW_CAP}-entry maximum for a single
                  request, so older entries may be missing — and the totals above are
                  built from these rows. Narrow the date range to check.
                </Callout>
              ) : null}

              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Work date</TH>
                      <TH>Work</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Awarded by</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {shown.map((a) => (
                      <TRow key={a.id}>
                        <TD className="whitespace-nowrap text-text-muted">
                          {formatYmd(a.workDate)}
                        </TD>
                        <TD>
                          <div>{a.workLabelEn}</div>
                          <div className="text-xs text-text-muted">
                            {describeQuantity(a)}
                            {a.note ? ` · ${a.note}` : ''}
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums font-semibold">
                          {fmtPoints(a.points)}
                        </TD>
                        <TD className="text-text-muted">{a.awardedByName ?? '—'}</TD>
                        <TD className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUndoAward(a)}
                            leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                          >
                            Undo
                          </Button>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              <MobileCardList
                className="p-3"
                cards={shown.map((a) => ({
                  key: a.id,
                  primary: (
                    <span className="block truncate font-medium text-text">{a.workLabelEn}</span>
                  ),
                  primaryRight: (
                    <span className="tabular-nums font-semibold">{fmtPoints(a.points)}</span>
                  ),
                  secondary: (
                    <span>
                      {describeQuantity(a)}
                      {a.note ? (
                        <span className="block text-xs text-text-muted">{a.note}</span>
                      ) : null}
                    </span>
                  ),
                  meta: (
                    <span>
                      {formatYmd(a.workDate)} · {a.awardedByName ?? '—'}
                    </span>
                  ),
                  actions: (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => onUndoAward(a)}
                      leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                    >
                      Undo
                    </Button>
                  ),
                }))}
              />

              {shown.length < awards.length ? (
                <div className="border-t border-border p-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setLimit((n) => n + LEDGER_PAGE)}
                  >
                    Show {Math.min(LEDGER_PAGE, awards.length - shown.length)} more of{' '}
                    {awards.length}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ─────────────────────────────────── Bits ───────────────────────────────── */

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {/* Wraps below md, truncates at md. Two of these labels ("Longest run at
          target", "Fuel & sales logged") measure within ~10px of their ~141px
          cell at 360px, and a truncated stat label takes the whole meaning of
          the number under it with it. `md:truncate` rather than a base
          `truncate` undone by `whitespace-normal`: `cn` is clsx, so two
          colliding utilities would be settled by stylesheet order, not by us. */}
      <dt className="text-xs text-text-muted md:truncate">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold leading-tight text-text">{value}</dd>
      {hint ? <p className="text-xs text-text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Initials for the avatar; two words max, so "Ram Kumar Singh" is RK. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]!.toUpperCase()).join('');
}

/**
 * The "how much" clause under a ledger row's work label. Only PER_UNIT rows and
 * SPLIT rows have one — for everything else the points ARE the whole story, and
 * printing "×1" on every line would bury the two that mean something.
 */
function describeQuantity(a: StaffPointAward): string {
  if (a.amountRupees !== undefined) return `${inrFormat(a.amountRupees)} logged`;
  if (a.distribution === 'PER_UNIT' && a.quantity !== undefined) {
    return `${fmtPoints(a.quantity)} × ${fmtPoints(a.basePoints)} pts`;
  }
  if (a.distribution === 'SPLIT' && a.splitAmong !== undefined) {
    return `split between ${a.splitAmong} warrior${a.splitAmong === 1 ? '' : 's'}`;
  }
  return '';
}

function DetailSkeleton() {
  return (
    <div className="mt-3 grid gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
      title="Could not load"
      description={message}
      cta={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
