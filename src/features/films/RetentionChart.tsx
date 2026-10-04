import * as React from 'react';

import { ChartLegend } from '@/components/charts';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import {
  chapterAt,
  chapterBands,
  curveArea,
  curvePath,
  downsample,
  formatClock,
  formatPercent,
  lineAt,
  retentionTableStep,
  sampleSeries,
  secondAtFraction,
  timeTicks,
  valueAt,
} from '@/lib/films';
import type { FilmLine } from '@dk/shared';

/**
 * The share of views still watching at each second of the film.
 *
 * Inline SVG, but only for the marks. The plot is drawn in a
 * `0 0 duration 100` viewBox stretched to whatever box it gets
 * (`preserveAspectRatio="none"`), with `non-scaling-stroke` so a line stays one
 * line thick at every width. Everything that is TEXT — the axis labels, the
 * readout, the dot on the curve — is HTML positioned by percentage, so it never
 * squashes with the plot. That is the scaling trap the house column chart
 * avoided by not being SVG at all; a 1,590-point curve cannot be divs.
 *
 * Reading a value: hover, tap or drag along the plot (a vertical swipe still
 * scrolls the page — `touch-action: pan-y`), or focus it and use the arrow keys.
 * The readout above the plot names the time, the share still watching, the
 * share among sound-on views and the chapter; the Hindi line being spoken is
 * printed under the axis. The table at the bottom lists the curve every minute,
 * so no value is hover-gated.
 *
 * Encoding: one hue for the curve, with a soft fill under it. The sound-on
 * curve is a thin grey line — context for the main one, not a rival series.
 * Chapters are alternating bands behind both, and grid rules are solid.
 */
export interface RetentionChartProps {
  duration: number;
  retention: readonly number[];
  retentionSoundOn: readonly number[];
  /** Draw the sound-on line (there were views with sound on). */
  showSoundOn: boolean;
  chapters: ReadonlyArray<{ t: number; title: string }>;
  lines: readonly FilmLine[];
  className?: string;
}

export function RetentionChart({
  duration,
  retention,
  retentionSoundOn,
  showSoundOn,
  chapters,
  lines,
  className,
}: RetentionChartProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [active, setActive] = React.useState<number | null>(null);
  const plotRef = React.useRef<HTMLDivElement | null>(null);

  // A new film or range is a different curve; a held readout would name a
  // second of the old one.
  React.useEffect(() => setActive(null), [duration, retention]);

  const maxPoints = isMd ? 600 : 300;
  const main = React.useMemo(() => downsample(retention, maxPoints), [retention, maxPoints]);
  const sound = React.useMemo(
    () => (showSoundOn ? downsample(retentionSoundOn, maxPoints) : []),
    [retentionSoundOn, showSoundOn, maxPoints],
  );
  const bands = React.useMemo(() => chapterBands(chapters, duration), [chapters, duration]);
  const ticks = React.useMemo(() => timeTicks(duration, isMd ? 8 : 5), [duration, isMd]);

  const pickAt = React.useCallback(
    (clientX: number) => {
      const el = plotRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) return;
      setActive(secondAtFraction((clientX - box.left) / box.width, duration));
    },
    [duration],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = Math.max(0, Math.ceil(duration) - 1);
    const big = Math.max(1, Math.round(duration / 50));
    const cur = active ?? 0;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = cur + (e.shiftKey ? big : 1);
    else if (e.key === 'ArrowLeft') next = cur - (e.shiftKey ? big : 1);
    else if (e.key === 'PageUp') next = cur + big;
    else if (e.key === 'PageDown') next = cur - big;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  if (duration <= 0 || retention.length === 0) {
    return (
      <p className={cn('py-8 text-center text-sm text-text-muted', className)}>
        Nothing to plot yet.
      </p>
    );
  }

  const activeValue = active === null ? null : valueAt(retention, active);
  const activeSound = active === null || !showSoundOn ? null : valueAt(retentionSoundOn, active);
  const activeLine = active === null ? null : lineAt(lines, active + 0.5);
  const activeChapter = active === null ? null : chapterAt(bands, active + 0.5);
  const xPct = (t: number) => `${(t / duration) * 100}%`;
  const valueText =
    active === null
      ? 'No second selected'
      : `${formatClock(active)}, ${formatPercent(activeValue)} still watching`;

  return (
    <div className={cn('grid gap-2', className)}>
      {/* Readout, in two parts. The figures sit ABOVE the plot in a box tall
          enough for their two phone lines, so the plot never moves under a
          finger that is dragging along it. The Hindi line runs to 177
          characters — six lines on a phone — so it goes BELOW the axis, where
          its height only pushes the legend down. Not a live region: the plot
          announces the same value through aria-valuetext. */}
      <p className="min-h-[2.5rem] text-xs text-text-muted md:min-h-[1.25rem]">
        {active === null ? (
          'Hover, tap or drag along the curve to read any second.'
        ) : (
          <>
            <span className="font-semibold tabular-nums text-text">{formatClock(active)}</span>
            {' · '}
            <span className="font-semibold text-text">{formatPercent(activeValue)}</span> still
            watching
            {activeSound !== null ? (
              <>
                {' · '}
                {formatPercent(activeSound)} of sound-on views
              </>
            ) : null}
            {activeChapter ? <> · {activeChapter.title}</> : null}
          </>
        )}
      </p>

      <div className="flex gap-2">
        {/* Y axis: HTML, so its text is real size at every width. */}
        <div
          aria-hidden
          className="relative w-8 shrink-0 text-right text-[10px] tabular-nums text-text-subtle"
          style={{ height: isMd ? 240 : 180 }}
        >
          {[1, 0.75, 0.5, 0.25, 0].map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - v) * 100}%` }}
            >
              {Math.round(v * 100)}%
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            role="slider"
            tabIndex={0}
            aria-label="Share of views still watching, by second"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.ceil(duration) - 1)}
            aria-valuenow={active ?? 0}
            aria-valuetext={valueText}
            className="relative cursor-crosshair touch-pan-y rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            style={{ height: isMd ? 240 : 180 }}
            onPointerDown={(e) => pickAt(e.clientX)}
            onPointerMove={(e) => {
              // A mouse reads on hover; a finger only while it is down.
              if (e.pointerType === 'mouse' || e.buttons > 0) pickAt(e.clientX);
            }}
            onPointerLeave={(e) => {
              // Touch keeps the last reading on screen — that is what makes a
              // tapped value readable after the finger lifts.
              if (e.pointerType === 'mouse') setActive(null);
            }}
            onKeyDown={onKeyDown}
          >
            <svg
              aria-hidden
              className="absolute inset-0 h-full w-full overflow-visible"
              viewBox={`0 0 ${duration} 100`}
              preserveAspectRatio="none"
            >
              {bands.map((b) =>
                b.index % 2 === 1 ? (
                  <rect
                    key={b.index}
                    x={b.start}
                    y={0}
                    width={Math.max(0, b.end - b.start)}
                    height={100}
                    className="fill-surface-2"
                  />
                ) : null,
              )}
              {activeChapter ? (
                <rect
                  x={activeChapter.start}
                  y={0}
                  width={Math.max(0, activeChapter.end - activeChapter.start)}
                  height={100}
                  className="fill-brand-soft opacity-40"
                />
              ) : null}
              {[25, 50, 75].map((y) => (
                <line
                  key={y}
                  x1={0}
                  x2={duration}
                  y1={y}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                  // Not stroke-border: the dark theme gives the border and the
                  // chapter bands (surface-2) the same colour, and the rules
                  // vanished inside every shaded chapter. Faded so they stay
                  // lighter than the baseline below them.
                  className="stroke-border-strong opacity-60"
                  strokeWidth={1}
                />
              ))}
              <line
                x1={0}
                x2={duration}
                y1={100}
                y2={100}
                vectorEffect="non-scaling-stroke"
                className="stroke-border-strong"
                strokeWidth={1}
              />
              <path d={curveArea(main, duration)} className="fill-brand opacity-10" />
              {sound.length ? (
                <path
                  d={curvePath(sound, duration)}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-text-subtle"
                  strokeWidth={1.25}
                  strokeLinejoin="round"
                />
              ) : null}
              <path
                d={curvePath(main, duration)}
                fill="none"
                vectorEffect="non-scaling-stroke"
                className="stroke-brand"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {active !== null ? (
                <line
                  x1={active + 0.5}
                  x2={active + 0.5}
                  y1={0}
                  y2={100}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-text-muted"
                  strokeWidth={1}
                />
              ) : null}
            </svg>

            {/* The dot is HTML: a circle in a stretched viewBox is an ellipse. */}
            {active !== null && activeValue !== null ? (
              <span
                aria-hidden
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-brand"
                style={{ left: xPct(active + 0.5), bottom: `${activeValue * 100}%` }}
              />
            ) : null}
          </div>

          {/* X axis. First label hugs the left edge, last one the right, so
              neither hangs out of the card. */}
          <div aria-hidden className="relative mt-1.5 h-4 text-[10px] tabular-nums text-text-subtle">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={cn(
                  'absolute whitespace-nowrap',
                  i === 0 ? '' : t >= duration - 1e-6 ? '-translate-x-full' : '-translate-x-1/2',
                )}
                style={{ left: xPct(t) }}
              >
                {formatClock(t)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {active !== null ? (
        activeLine ? (
          <p lang="hi" className="rounded-sm bg-surface-2 px-2.5 py-2 text-sm leading-snug text-text">
            “{activeLine.hi}”
          </p>
        ) : (
          <p className="text-xs text-text-subtle">
            {lines.length ? 'No line being spoken at this second.' : null}
          </p>
        )
      ) : null}

      <ChartLegend
        className="mt-1"
        items={[
          {
            key: 'all',
            label: 'All views',
            swatch: <span aria-hidden className="h-[3px] w-3.5 rounded-full bg-brand" />,
          },
          ...(showSoundOn
            ? [
                {
                  key: 'sound',
                  label: 'Views with sound on',
                  swatch: <span aria-hidden className="h-px w-3.5 bg-text-subtle" />,
                },
              ]
            : []),
          ...(bands.length > 1
            ? [
                {
                  key: 'chapters',
                  label: 'Chapters (shaded every other one)',
                  swatch: (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-[2px] border border-border bg-surface-2"
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <RetentionTable
        retention={retention}
        retentionSoundOn={showSoundOn ? retentionSoundOn : null}
        duration={duration}
      />
    </div>
  );
}

function RetentionTable({
  retention,
  retentionSoundOn,
  duration,
}: {
  retention: readonly number[];
  retentionSoundOn: readonly number[] | null;
  duration: number;
}) {
  const step = retentionTableStep(duration);
  const rows = React.useMemo(() => sampleSeries(retention, step), [retention, step]);
  return (
    <details className="text-xs">
      <summary className="min-h-11 cursor-pointer select-none rounded-sm py-3 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-1.5">
        Show the curve as a table (every {step >= 60 ? `${step / 60} min` : `${step} s`})
      </summary>
      <div className="mt-2 overflow-x-auto rounded-sm border border-border md:max-h-64 md:overflow-y-auto md:overscroll-contain">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-surface-2 text-text-muted md:sticky md:top-0">
            <tr>
              <th className="h-8 px-2 text-left font-semibold">At</th>
              <th className="h-8 px-2 text-right font-semibold">Still watching</th>
              {retentionSoundOn ? (
                <th className="h-8 px-2 text-right font-semibold">With sound on</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t} className="border-t border-border">
                <td className="h-8 px-2 tabular-nums text-text">{formatClock(r.t)}</td>
                <td className="h-8 px-2 text-right tabular-nums text-text">{formatPercent(r.v)}</td>
                {retentionSoundOn ? (
                  <td className="h-8 px-2 text-right tabular-nums text-text-muted">
                    {formatPercent(valueAt(retentionSoundOn, r.t))}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
