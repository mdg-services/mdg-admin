import { AlertCircle, Clapperboard, ExternalLink, Hourglass, Link2 } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  SegmentedControl,
  Select,
  Skeleton,
} from '@/components/ui';
import {
  BreakdownsCard,
  DailyCard,
  DropoffsCard,
  FilmKpis,
  ReachCard,
  ShortToFullCard,
} from '@/features/films/FilmSections';
import { RecentViewsCard } from '@/features/films/RecentViewsCard';
import { RetentionChart } from '@/features/films/RetentionChart';
import { ShareLinksCard } from '@/features/films/ShareLinksCard';
import { useFilmLinksQuery, useFilmsQuery, useFilmStatsQuery } from '@/hooks/api/useFilms';
import { ApiError } from '@/lib/api';
import {
  FILM_RANGE_PRESETS,
  FILM_SWITCH_LABELS,
  formatClock,
  formatCount,
  isBreakdownKey,
  isFilmId,
  isRangePreset,
  rangeForPreset,
  type FilmRangePreset,
} from '@/lib/films';
import { istTodayYmd } from '@/lib/format';
import { FILM_IDS, type FilmBreakdownKey, type FilmId, type FilmStats, type FilmSummary } from '@dk/shared';

/**
 * The two Dealer Kavach films on mdgservices.in, and how they are watched
 * (docs/films/FILM_PAGES_SPEC.md §4, ADR 0015). Super-admin only.
 *
 * Film, range, share-link filter and breakdown tab live in the query string,
 * so "the full film, last 7 days, Ramesh ji's link" is a link that can be
 * pasted to a colleague. The defaults carry no param.
 *
 * Order of the page is the order of the questions: how many watched, how far
 * they got and where they left (the retention curve is the centrepiece), when,
 * from where — then the share links that make the next send measurable, and the
 * raw page loads at the bottom.
 */
export function FilmsPage() {
  const [search, setSearch] = useSearchParams();

  const filmParam = search.get('film');
  const film: FilmId = isFilmId(filmParam) ? filmParam : 'kavach';
  const rangeParam = search.get('range');
  const preset: FilmRangePreset = isRangePreset(rangeParam) ? rangeParam : '30d';
  const tag = search.get('link')?.trim() || undefined;
  const bdParam = search.get('by');
  const breakdown: FilmBreakdownKey = isBreakdownKey(bdParam) ? bdParam : 'tag';

  const update = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  // Today's IST day, read once per mount: a page left open across midnight
  // keeps the window it was opened with rather than shifting under the reader.
  const [today] = React.useState(istTodayYmd);
  const range = React.useMemo(() => rangeForPreset(preset, today), [preset, today]);

  const filmsQ = useFilmsQuery();
  const linksQ = useFilmLinksQuery(film);
  const summary = filmsQ.data?.find((f) => f.film === film);
  const ready = summary?.ready === true;
  const statsQ = useFilmStatsQuery(film, range, tag, ready);

  const notReady =
    (summary && !summary.ready) ||
    (statsQ.error instanceof ApiError && statsQ.error.code === 'FILM_NOT_READY');

  const filmTitle = summary?.title ?? statsQ.data?.title ?? FILM_SWITCH_LABELS[film];
  const links = linksQ.data ?? [];
  const tagLink = tag ? links.find((l) => l.code === tag) : undefined;
  const tagLabel = tag ? (tagLink?.label ?? `Code ${tag}`) : undefined;
  const bodyShown = !notReady && !!statsQ.data;

  return (
    <div>
      <PageHeader
        title="Films"
        subtitle="How the Dealer Kavach films on mdgservices.in are being watched — how far people get, where they stop, and which share link brought them."
      />

      <Card className="mb-3 md:mb-4">
        <CardContent className="grid gap-3 md:grid-cols-[auto_auto_minmax(0,1fr)] md:items-end md:gap-4">
          <div className="grid gap-1">
            <span className="text-xs font-medium text-text-muted">Film</span>
            <SegmentedControl
              aria-label="Film"
              value={film}
              onChange={(v) => update({ film: v === 'kavach' ? undefined : v, link: undefined })}
              options={FILM_IDS.map((id) => ({ value: id, label: FILM_SWITCH_LABELS[id] }))}
            />
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-medium text-text-muted">Dates</span>
            <SegmentedControl
              aria-label="Date range"
              value={preset}
              onChange={(v) => update({ range: v === '30d' ? undefined : v })}
              options={FILM_RANGE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <label htmlFor="film-link-filter" className="text-xs font-medium text-text-muted">
              Share link
            </label>
            <Select
              id="film-link-filter"
              value={tag ?? ''}
              onChange={(e) => update({ link: e.target.value || undefined })}
              disabled={!ready}
            >
              <option value="">All views</option>
              {tag && !links.some((l) => l.code === tag) ? (
                <option value={tag}>{tagLabel}</option>
              ) : null}
              {links.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          {/* On a phone the share-link form sits below the curve, the
              breakdowns and the drop-offs. This takes the reader straight to
              it and puts the cursor in the name box. */}
          <Button
            variant="secondary"
            className="w-full md:hidden"
            leftIcon={<Link2 width={16} height={16} />}
            disabled={!bodyShown}
            onClick={jumpToLinkForm}
          >
            Make a share link
          </Button>
        </CardContent>
      </Card>

      {filmsQ.isLoading ? (
        <PageSkeleton />
      ) : filmsQ.isError ? (
        <ErrorCard
          title="Could not load the films"
          error={filmsQ.error}
          onRetry={() => void filmsQ.refetch()}
        />
      ) : notReady ? (
        <NotReadyCard film={film} summary={summary} />
      ) : statsQ.isLoading ? (
        <PageSkeleton />
      ) : statsQ.isError || !statsQ.data ? (
        <ErrorCard
          title="Could not load this film's numbers"
          error={statsQ.error}
          onRetry={() => void statsQ.refetch()}
        />
      ) : (
        <FilmBody
          stats={statsQ.data}
          summary={summary}
          film={film}
          filmTitle={filmTitle}
          tag={tag}
          tagLabel={tagLabel}
          tagOpensAllTime={tagLink?.opens}
          preset={preset}
          breakdown={breakdown}
          refreshing={statsQ.isFetching && statsQ.isPlaceholderData}
          onBreakdown={(k) => update({ by: k === 'tag' ? undefined : k })}
          onFilterTag={(code) => update({ link: code })}
        />
      )}
    </div>
  );
}

function FilmBody({
  stats,
  summary,
  film,
  filmTitle,
  tag,
  tagLabel,
  tagOpensAllTime,
  preset,
  breakdown,
  refreshing,
  onBreakdown,
  onFilterTag,
}: {
  stats: FilmStats;
  summary: FilmSummary | undefined;
  film: FilmId;
  filmTitle: string;
  tag: string | undefined;
  tagLabel: string | undefined;
  /** The filtered link's opens since it was made, when the list has it. */
  tagOpensAllTime: number | undefined;
  preset: FilmRangePreset;
  breakdown: FilmBreakdownKey;
  refreshing: boolean;
  onBreakdown: (k: FilmBreakdownKey) => void;
  onFilterTag: (code: string | undefined) => void;
}) {
  const t = stats.totals;
  const shareLinks = (
    <ShareLinksCard film={film} filmTitle={filmTitle} activeTag={tag} onFilterTag={onFilterTag} />
  );

  const header = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 lang="hi" className="min-w-0 break-words text-base font-semibold text-text md:text-lg">
        {stats.title}
      </h2>
      <span className="text-sm text-text-muted">{formatClock(stats.duration)} long</span>
      {summary?.url ? (
        <a
          href={summary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          {summary.url.replace(/^https?:\/\//, '')}
          <ExternalLink width={12} height={12} aria-hidden />
        </a>
      ) : null}
      {refreshing ? <span className="text-xs text-text-subtle">Updating…</span> : null}
    </div>
  );

  // Nobody has opened it in this window. Say what will appear, and put the
  // tool that makes it appear — a share link — right underneath.
  if (t.opens === 0) {
    // "Try All time" only when All time has something to show. The films
    // list already carries the all-time opens (and the link list each link's),
    // so a film nobody has ever opened says so instead of sending the reader
    // to the same empty page.
    const everOpened = tag ? tagOpensAllTime : summary?.opens;
    const allTime = preset === 'all' || everOpened === 0;
    return (
      <div className="grid gap-3 md:gap-4">
        {header}
        <Card>
          <CardContent padding="none">
            <EmptyState
              icon={<Clapperboard width={28} height={28} strokeWidth={1.75} />}
              title={
                tag
                  ? allTime
                    ? `Nobody has opened the link for ${tagLabel ?? tag} yet`
                    : `Nobody opened the link for ${tagLabel ?? tag} in these dates`
                  : allTime
                    ? 'Nobody has opened this film yet'
                    : 'Nobody opened this film in these dates'
              }
              description={
                allTime
                  ? 'Once the film is shared, every opening shows up here: how many people watched, how far they got, the exact line where they stopped, and which link, state, city and phone they watched on. Make a share link below for the first person you send it to.'
                  : 'Try “All time”, or send the film to someone with a share link below. Each opening then shows up here with how far they watched and where they stopped.'
              }
            />
          </CardContent>
        </Card>
        {shareLinks}
      </div>
    );
  }

  const hasViews = t.views > 0;
  const lines = stats.lines ?? [];

  return (
    <div className="grid gap-3 md:gap-4">
      {header}
      {tag ? (
        <Callout intent="info">
          Showing only views that came through the link for{' '}
          <span className="font-semibold">{tagLabel ?? tag}</span>.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => onFilterTag(undefined)}
          >
            Show all views
          </button>
        </Callout>
      ) : null}

      <FilmKpis stats={stats} />

      {!hasViews ? (
        <Callout intent="info">
          {formatCount(t.opens)} {t.opens === 1 ? 'page open' : 'page opens'}, but nobody has watched
          3 seconds yet, so there is no curve to draw. The charts appear with the first real view.
        </Callout>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Who is still watching</CardTitle>
                <CardSubtitle>
                  Share of views still watching at each second
                  {t.soundOnRate > 0 ? ', and among those who turned the sound on' : ''}
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardContent>
              <RetentionChart
                duration={stats.duration}
                retention={stats.retention}
                retentionSoundOn={stats.retentionSoundOn}
                showSoundOn={t.soundOnRate > 0}
                chapters={stats.chapters}
                lines={lines}
              />
              {lines.length === 0 && stats.chapters.length > 0 ? (
                <p className="mt-2 text-xs text-text-subtle">
                  The spoken lines are not available from the server yet, so the readout names the
                  chapter only.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
            <DropoffsCard stats={stats} />
            <ReachCard stats={stats} />
          </div>

          {stats.shortToFull ? <ShortToFullCard stats={stats} /> : null}

          <DailyCard stats={stats} />

          <BreakdownsCard stats={stats} kind={breakdown} onKind={onBreakdown} />
        </>
      )}

      {shareLinks}

      <RecentViewsCard film={film} tag={tag} />
    </div>
  );
}

/** Scroll the share-link form into view and put the cursor in its name box. */
function jumpToLinkForm() {
  const input = document.getElementById('film-link-label');
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

function NotReadyCard({ film, summary }: { film: FilmId; summary: FilmSummary | undefined }) {
  const isShort = film === 'kavach-short';
  return (
    <Card>
      <CardContent padding="none">
        <EmptyState
          icon={<Hourglass width={28} height={28} strokeWidth={1.75} />}
          title={isShort ? 'The short is not published yet' : 'This film is not published yet'}
          description={`${
            isShort ? 'The 35-second short is still being made. ' : ''
          }Once it is live at ${
            summary?.url?.replace(/^https?:\/\//, '') ?? 'mdgservices.in'
          }, its views, how far people watch, and how many go on to the full film will show up here. Share links for it can be made then.`}
        />
      </CardContent>
    </Card>
  );
}

function ErrorCard({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent padding="none">
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title={title}
          description={error instanceof ApiError ? error.message : 'Please try again.'}
          cta={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="grid gap-3 md:gap-4">
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
