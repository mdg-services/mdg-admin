import * as React from 'react';

import {
  ColumnChart,
  Meter,
  RankedBars,
  StatTile,
  StatTileGrid,
  type ColumnDatum,
} from '@/components/charts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  Tabs,
  type DataColumn,
} from '@/components/ui';
import { useSentinel } from '@/features/whatsapp/useInView';
import { useFilmBreakdownQuery } from '@/hooks/api/useFilms';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  BREAKDOWN_TABS,
  breakdownPhoneLine,
  breakdownRowLabel,
  formatClock,
  formatCount,
  formatPercent,
  formatStartup,
  formatWatchTime,
} from '@/lib/films';
import { formatYmd } from '@/lib/format';
import type { FilmBreakdownKey, FilmBreakdownRow, FilmId, FilmStats } from '@dk/shared';

/**
 * The read-only sections of the Films page, each one card. Every figure comes
 * straight off `FilmStats`; the only arithmetic here is formatting.
 */

/* ─────────────────────────────── KPI tiles ──────────────────────────────── */

export function FilmKpis({ stats }: { stats: FilmStats }) {
  const t = stats.totals;
  const completed = Math.round(t.completionRate * t.views);
  return (
    <StatTileGrid columnsAtMd={4}>
      <StatTile
        label="Page opens"
        value={formatCount(t.opens)}
        caption="The page loaded and the player started"
      />
      <StatTile
        label="Views"
        value={formatCount(t.views)}
        caption="Opens that watched at least 3 seconds"
      />
      <StatTile
        label="Unique viewers"
        value={formatCount(t.viewers)}
        caption={
          t.returning > 0
            ? `${formatCount(t.returning)} came back for another view`
            : 'One per phone or browser'
        }
      />
      <StatTile
        label="Avg watch time"
        value={formatWatchTime(t.avgWatchSeconds)}
        caption={`Per view · ${formatWatchTime(t.watchSeconds)} in all`}
      />
      <StatTile
        label="Avg % watched"
        value={formatPercent(t.avgPercent)}
        caption={`Of the ${formatClock(stats.duration)} film, per view`}
      />
      <StatTile
        label="Completed"
        value={formatPercent(t.completionRate)}
        caption={`${formatCount(completed)} ${completed === 1 ? 'view' : 'views'} watched (almost) all of it`}
      />
      <StatTile
        label="Turned sound on"
        value={formatPercent(t.soundOnRate)}
        caption="The film starts muted; these tapped for sound"
      />
      <StatTile
        label="Start time (median)"
        value={formatStartup(t.startupMedianMs)}
        caption={
          t.startupP90Ms !== null
            ? `Slowest 1 in 10: ${formatStartup(t.startupP90Ms)} · buffering ${formatPercent(t.rebufferRatio, 1)} of the time`
            : 'From opening the link to the first frame'
        }
      />
    </StatTileGrid>
  );
}

/* ─────────────────────────────── Drop-offs ──────────────────────────────── */

export function DropoffsCard({ stats }: { stats: FilmStats }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Biggest drop-offs</CardTitle>
          <CardSubtitle>
            The five-second stretches where the most viewers left, and what was being said
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none">
        {stats.dropoffs.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
            No stretch stands out yet — viewers are not leaving at any one point.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {stats.dropoffs.map((d, i) => (
              <li key={d.t} className="flex gap-3 px-3 py-2.5 md:px-4">
                <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-text-subtle">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold tabular-nums text-text">
                      {formatClock(d.t)}–{formatClock(d.t + 5)}
                    </span>
                    <span className="text-text-muted">
                      lost <span className="font-semibold text-text">{formatPercent(d.lost)}</span>{' '}
                      of views
                    </span>
                  </p>
                  {d.line ? (
                    <p lang="hi" className="mt-0.5 break-words text-sm leading-snug text-text">
                      “{d.line.hi}”
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-text-subtle">No line being spoken here</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── Reach ──────────────────────────────────── */

export function ReachCard({ stats }: { stats: FilmStats }) {
  const q = stats.quartiles;
  const marks: Array<{ key: string; label: string; v: number }> = [
    { key: 'p25', label: 'Reached a quarter of the way', v: q.p25 },
    { key: 'p50', label: 'Reached halfway', v: q.p50 },
    { key: 'p75', label: 'Reached three quarters', v: q.p75 },
    { key: 'p100', label: 'Reached the end', v: q.p100 },
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How far viewers got</CardTitle>
          <CardSubtitle>Share of views that reached each point of the film</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3">
          {marks.map((m) => (
            <Meter
              key={m.key}
              label={m.label}
              value={m.v}
              limit={1}
              valueLabel={formatPercent(m.v)}
            />
          ))}
        </div>
        {stats.chapters.length > 0 ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <p className="text-sm font-semibold text-text">Reach by chapter</p>
            <p className="text-xs text-text-subtle">
              Share of views that watched at least 3 seconds of each chapter
            </p>
            <RankedBars
              className="mt-1"
              formatValue={(n) => formatPercent(n)}
              data={stats.chapters.map((c, i) => ({
                key: `${c.t}`,
                label: c.title,
                value: c.reach,
                rank: i + 1,
                secondary: `Starts at ${formatClock(c.t)}`,
              }))}
              showRank
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── Per day ────────────────────────────────── */

export function DailyCard({ stats }: { stats: FilmStats }) {
  const data: ColumnDatum[] = stats.daily.map((d) => ({
    key: d.day,
    tick: d.day.slice(8),
    label: formatYmd(d.day, { weekday: true }),
    value: d.views,
    note: `${formatCount(d.opens)} ${d.opens === 1 ? 'open' : 'opens'} · ${formatCount(d.viewers)} ${
      d.viewers === 1 ? 'viewer' : 'viewers'
    } · ${formatWatchTime(d.watchSeconds)} watched`,
  }));
  const peak = stats.daily.reduce<(typeof stats.daily)[number] | null>(
    (best, d) => (best === null || d.views > best.views ? d : best),
    null,
  );
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Views per day</CardTitle>
          <CardSubtitle>Indian time, {formatYmd(stats.range.from)} to {formatYmd(stats.range.to)}</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <ColumnChart
          data={data}
          formatValue={(n) => `${formatCount(n)} ${n === 1 ? 'view' : 'views'}`}
          idleReadout={
            peak && peak.views > 0
              ? `Busiest: ${formatYmd(peak.day, { weekday: true })} · ${formatCount(peak.views)} views`
              : 'Tap a column to read its day'
          }
          tableCaption="Show every day"
          tableValueHeader="Views"
          maxColumns={14}
        />
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── Breakdowns ─────────────────────────────── */

/** Rows "Where the views came from" shows before "Show more". */
const BREAKDOWN_FIRST_ROWS = 5;

/**
 * Where the views came from, by share link, place, phone and so on: the first
 * five rows, then — once "Show more" is pressed — the rest a page at a time,
 * each page asked for as the end of the list nears the bottom of the screen.
 */
export function BreakdownsCard({
  stats,
  film,
  range,
  tag,
  kind,
  onKind,
}: {
  stats: FilmStats;
  film: FilmId;
  range: { from?: string; to: string };
  tag: string | undefined;
  kind: FilmBreakdownKey;
  onKind: (k: FilmBreakdownKey) => void;
}) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = React.useState(false);
  // A new tab, film, window or link starts short again; "show more" was asked of the old one.
  React.useEffect(() => setExpanded(false), [kind, film, range.from, range.to, tag]);

  const first = stats.breakdowns[kind] ?? [];
  // An older server sends no totals: what it sent is all there is.
  const total = stats.breakdownTotals?.[kind] ?? first.length;
  const more = useFilmBreakdownQuery(film, range, tag, kind, expanded);
  const paged = React.useMemo(() => more.data?.pages.flatMap((p) => p.items) ?? [], [more.data]);
  // Until the first page lands the five already shown stay, so the list only ever grows.
  const shown = expanded && paged.length > 0 ? paged : first.slice(0, BREAKDOWN_FIRST_ROWS);

  // The page itself scrolls, so the sentinel is watched against the screen (a null root).
  const screen = React.useRef<HTMLElement>(null);
  const sentinel = useSentinel<HTMLDivElement>(
    screen,
    expanded && paged.length > 0 && !!more.hasNextPage && !more.isFetchingNextPage,
    () => void more.fetchNextPage(),
  );
  const top = React.useRef<HTMLDivElement>(null);
  const collapse = () => {
    setExpanded(false);
    // A long list folding up would leave the reader far below the card.
    top.current?.scrollIntoView({ block: 'nearest' });
  };
  const loading = expanded && (more.isPending || more.isFetchingNextPage);

  const groupHeader = BREAKDOWN_TABS.find((b) => b.key === kind)?.label ?? 'Group';
  const label: DataColumn<FilmBreakdownRow> = {
    id: 'label',
    header: groupHeader,
    cell: (r) => <span className="break-words">{breakdownRowLabel(kind, r)}</span>,
    mobile: 'primary',
  };

  // On a phone each row is two lines — the group and its views, then the rest
  // of its figures in one sentence — instead of five label/value lines.
  const columns: DataColumn<FilmBreakdownRow>[] = isMd
    ? [
        label,
        {
          id: 'views',
          header: 'Views',
          cell: (r) => formatCount(r.views),
          numeric: true,
          width: '5rem',
        },
        {
          id: 'viewers',
          header: 'Viewers',
          cell: (r) => formatCount(r.viewers),
          numeric: true,
          width: '5.5rem',
        },
        {
          id: 'avg',
          header: 'Avg watched',
          cell: (r) => formatPercent(r.avgPercent),
          numeric: true,
          width: '6.5rem',
        },
        {
          id: 'done',
          header: 'Completed',
          cell: (r) => formatPercent(r.completionRate),
          numeric: true,
          width: '6.5rem',
        },
        {
          id: 'sound',
          header: 'Sound on',
          cell: (r) => formatPercent(r.soundOnRate),
          numeric: true,
          width: '6rem',
        },
      ]
    : [
        label,
        {
          id: 'views',
          header: 'Views',
          cell: (r) => (
            <span className="text-sm font-semibold tabular-nums text-text">
              {formatCount(r.views)} {r.views === 1 ? 'view' : 'views'}
            </span>
          ),
          mobile: 'primaryRight',
        },
        {
          id: 'figures',
          header: 'Figures',
          cell: (r) => <span className="tabular-nums">{breakdownPhoneLine(r)}</span>,
          mobile: 'secondary',
        },
      ];

  return (
    <div ref={top} className="scroll-mt-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Where the views came from</CardTitle>
            <CardSubtitle>
              Views only (3 seconds or more), most first
              {total > 0 ? ` · ${formatCount(total)} ${total === 1 ? 'row' : 'rows'}` : ''}
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent padding="none">
          <Tabs
            className="px-1 md:px-2"
            items={BREAKDOWN_TABS.map((b) => ({ id: b.key, label: b.label }))}
            value={kind}
            onChange={(id) => onKind(id as FilmBreakdownKey)}
          />
          <DataList
            rows={shown}
            columns={columns}
            rowKey={(r) => r.key}
            cardVariant="rows"
            empty={
              <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
                Nothing to group yet.
              </p>
            }
          />
          {expanded ? <div ref={sentinel} aria-hidden /> : null}
          {more.isError && expanded ? (
            <p className="border-t border-border px-3 py-3 text-sm text-text-muted md:px-4">
              Could not load more rows.{' '}
              <button
                type="button"
                className="font-semibold text-brand underline"
                onClick={() => void (paged.length > 0 ? more.fetchNextPage() : more.refetch())}
              >
                Try again
              </button>
            </p>
          ) : loading ? (
            <p className="border-t border-border px-3 py-3 text-sm text-text-muted md:px-4" role="status">
              Loading more rows…
            </p>
          ) : null}
          {!expanded && total > BREAKDOWN_FIRST_ROWS ? (
            <div className="border-t border-border px-3 py-1 md:px-4">
              <Button variant="ghost" size="sm" padding="none" onClick={() => setExpanded(true)}>
                Show more · {formatCount(total - BREAKDOWN_FIRST_ROWS)} more
              </Button>
            </div>
          ) : expanded && !loading && paged.length > 0 ? (
            <div className="border-t border-border px-3 py-1 md:px-4">
              <Button variant="ghost" size="sm" padding="none" onClick={collapse}>
                Show fewer
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────── WhatsApp reply ─────────────────────────── */

/** How many opened the page and tapped the green "reply on WhatsApp". An older server sends no figure. */
export function ReplyTapsCard({ stats }: { stats: FilmStats }) {
  if (stats.replyTaps === undefined) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Replies on WhatsApp</CardTitle>
          <CardSubtitle>
            The page asks viewers to reply in our WhatsApp chat. Their messages are in the
            WhatsApp inbox.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <StatTileGrid columnsAtMd={2}>
          <StatTile
            label="Tapped “reply on WhatsApp”"
            value={formatCount(stats.replyTaps)}
            caption="Page opens that pressed the green button"
          />
          <StatTile
            label="Share of page opens"
            value={formatPercent(stats.totals.opens ? stats.replyTaps / stats.totals.opens : 0)}
            caption="A tap opens the chat with the message typed; sending it is up to them"
          />
        </StatTileGrid>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── Short → full ───────────────────────────── */

export function ShortToFullCard({ stats }: { stats: FilmStats }) {
  const s = stats.shortToFull;
  if (!s) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>From the short to the full film</CardTitle>
          <CardSubtitle>
            Did the 35-second short make people sit down for the whole 26 minutes?
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <StatTileGrid columnsAtMd={3}>
          <StatTile label="Views of the short" value={formatCount(s.shortViews)} />
          <StatTile
            label="Tapped “watch the full film”"
            value={formatCount(s.fullClicks)}
            caption="Views of the short that pressed the end button"
          />
          <StatTile
            label="Went on to the full film"
            value={formatPercent(s.rate)}
            caption={`${formatCount(s.viewersWhoStartedFull)} of the short's viewers opened it`}
          />
        </StatTileGrid>
      </CardContent>
    </Card>
  );
}
