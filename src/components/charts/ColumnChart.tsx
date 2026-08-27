import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

/**
 * A single-series column chart for a dense time window, with an optional
 * threshold line.
 *
 * Built out of divs rather than SVG on purpose. The one thing an SVG chart has
 * to solve is scaling: a `viewBox` that fits a 720px drawer squashes its own
 * axis text when the same drawer becomes a 360px bottom sheet, and the fix is
 * either a measuring hook or non-uniform scaling that distorts the glyphs. Flex
 * columns size themselves, their labels are real text at a real font size at
 * every width, and the hover/focus target is a native `<button>` — which is what
 * makes the values reachable by keyboard without re-implementing focus.
 *
 * Encoding rules this follows (and the reasons, so they survive an edit):
 *  - ONE hue for the series. Shading each bar by its own height would spend the
 *    colour channel restating the height, and the days have no order beyond time.
 *  - The threshold is the only dashed line in the chart. Gridlines are solid
 *    hairlines precisely so that a dashed rule can mean "target" and nothing else.
 *  - The scale always includes the threshold, so "nobody reached the target"
 *    stays visible instead of the line floating off the top of the plot.
 *  - Values are not printed on every column — that is unreadable past a handful
 *    of days. The hovered/focused column prints into the readout above the plot,
 *    and `tableCaption` opens a full table, so no value is hover-gated.
 */

export interface ColumnDatum {
  /** Stable key (the calendar day). */
  key: string;
  /** Short axis tick, e.g. `12`. */
  tick: string;
  /** Full label for the readout + accessible name, e.g. `Sat, 12 Jul 2026`. */
  label: string;
  value: number;
  /**
   * De-emphasise this column: it is a different KIND of day, not a smaller one
   * (a day the worker was on leave). Rendered as a hatched grey block so the
   * distinction survives greyscale and colour-blindness.
   */
  muted?: boolean;
  /** Extra clause for the readout, e.g. `on leave · 3 awards`. */
  note?: string;
}

export interface ColumnChartProps {
  data: ColumnDatum[];
  /**
   * Threshold line (e.g. the per-day points target). Included in the y-scale.
   *
   * Drawn UNLABELLED. A label pinned inside the plot has nowhere safe to sit: at
   * the right edge it is an opaque chip painted straight through the newest
   * columns whenever they clear the threshold, and pushed outside the plot it
   * lands in the readout. The caller names it in the legend instead, where
   * identity belongs — pass a `ChartLegend` entry with `LEGEND_SWATCHES.threshold`.
   */
  target?: number;
  /** Plot height in px, excluding the axis band below it. */
  height?: number;
  formatValue?: (n: number) => string;
  /** Readout text when nothing is hovered or focused. */
  idleReadout?: React.ReactNode;
  /**
   * Label on the `<details>` table toggle. Omitting it no longer drops the
   * table: below md the table is the only way to read a value at all, so it is
   * rendered either way and falls back to "Show values". Supplying a caption is
   * what makes the table appear at md as well, exactly as before.
   */
  tableCaption?: string;
  /** Column header for the value column of the table view. */
  tableValueHeader?: string;
  /**
   * Give every column at least this many px and put the plot in its own
   * horizontal scroller. Default 0 — today's `flex-1` behaviour, where the
   * columns divide whatever width there is.
   */
  minColumnPx?: number;
  /**
   * `minColumnPx`, but only below md — the common case, and the one every
   * caller was writing by hand. A 62-column window given a 14px floor is a
   * 990px strip, which is right on a phone and a needless sideways scroller in
   * a 700px desktop drawer.
   *
   * It is a prop rather than a caller-side `isMd ? 14 : 0` because the chart
   * already holds that media query: two call sites were each opening a second
   * subscription to answer a question this component had already answered.
   * Ignored when `minColumnPx` is set.
   */
  minColumnPxBelowMd?: number;
  /**
   * Below md, plot only the newest N columns, with a toggle to see the rest.
   * The table underneath always lists the whole window regardless.
   */
  maxColumns?: number;
  /** Open the value table on first render, at every width. */
  defaultTableOpen?: boolean;
  /** Open the value table on first render below md only — where the table is
   *  the only way to read a value — leaving a desktop `<details>` closed as it
   *  is today. Ignored when `defaultTableOpen` is set. */
  tableOpenBelowMd?: boolean;
  className?: string;
}

/** Round a scale ceiling up to something a reader can divide in their head. */
export function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Tick every `step`th column counting BACK from the last one, so the newest day
 * is always labelled and the gaps stay even. Counting forwards instead would
 * label the first day and then either drop the last or crowd it against its
 * neighbour, and the right-hand end is the one a reader looks at first.
 */
function tickStep(n: number): number {
  if (n <= 10) return 1;
  return Math.ceil(n / 8);
}

export function ColumnChart({
  data,
  target,
  height = 168,
  formatValue = (n) => String(n),
  idleReadout,
  tableCaption,
  tableValueHeader = 'Value',
  minColumnPx: minColumnPxProp = 0,
  minColumnPxBelowMd = 0,
  maxColumns,
  defaultTableOpen = false,
  tableOpenBelowMd = false,
  className,
}: ColumnChartProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  const isMd = useMediaQuery('(min-width: 768px)');
  const [showAllColumns, setShowAllColumns] = React.useState(false);

  // The below-md variants resolve here, against the media query the chart
  // already owns, so no caller has to open a second subscription for it.
  const minColumnPx = minColumnPxProp || (isMd ? 0 : minColumnPxBelowMd);
  const tableOpen = defaultTableOpen || (!isMd && tableOpenBelowMd);

  const scaleMax = React.useMemo(() => {
    const peak = data.reduce((m, d) => Math.max(m, d.value), 0);
    const base = niceCeil(Math.max(peak, target ?? 0, 1));
    // Headroom above a threshold nobody reached. Without it `niceCeil(100)` is
    // 100, the rule is drawn along the very top edge of the plot, and "everyone
    // fell short" is indistinguishable from "everyone topped out" — which is
    // the common case here, since a long window's columns are per-day means.
    return target !== undefined && target > 0 && base === target
      ? niceCeil(target * 1.25)
      : base;
  }, [data, target]);

  /**
   * What actually gets plotted. The arithmetic that forces this: at 360px
   * inside a card the plot is ~296px, so a 30-day window with `gap-[2px]` is
   * ~7.9px per column, and the warrior drawer's 62-column bucketed maximum is
   * ~2.8px. Each column is a real button and the only route to that day's
   * value. Below ~20px per mark the honest answer is to plot fewer days, not
   * to draw a thinner mark — so `maxColumns` trims to the newest N and offers
   * the rest behind a toggle. The table below still lists every row.
   */
  const plotted = React.useMemo(() => {
    if (isMd || showAllColumns) return data;
    if (maxColumns === undefined || maxColumns <= 0) return data;
    if (data.length <= maxColumns) return data;
    return data.slice(data.length - maxColumns);
  }, [data, isMd, showAllColumns, maxColumns]);

  // The readout points at an index INTO `plotted`, so it has to let go whenever
  // the window shifts under it — otherwise toggling "show all" leaves the
  // readout naming a different day than the one that is highlighted.
  //
  // Keyed on what the window IS, not on the array's identity: `AssistPage`
  // rebuilds its `data` with a plain `.map()` on every render, so a dependency
  // on `plotted` would fire on every render — including the one the hover
  // itself caused — and blank the readout the instant it was set.
  const windowKey = `${plotted.length}:${plotted[0]?.key ?? ''}`;
  React.useEffect(() => setActiveIdx(null), [windowKey]);

  const trimmed = plotted.length < data.length;
  const step = tickStep(plotted.length);
  const active = activeIdx === null ? undefined : plotted[activeIdx];

  // A minimum column width means the plot no longer fits its container, so it
  // gets its own horizontal scroller — the ONLY element allowed to scroll
  // sideways here, since `main` is `overflow-x-hidden` and would otherwise clip
  // rather than scroll. `.scroll-pane` keeps a flick at the end of the strip
  // from dragging the sheet it may be sitting in. The explicit width goes on a
  // single wrapper so the plot and its axis band can never drift apart.
  const stripWidth =
    minColumnPx > 0
      ? plotted.length * minColumnPx + Math.max(0, plotted.length - 1) * 2
      : 0;
  const columnStyle =
    minColumnPx > 0 ? { minWidth: `${minColumnPx}px` } : undefined;

  if (data.length === 0) {
    return (
      <p className={cn('py-8 text-center text-sm text-text-muted', className)}>
        Nothing to plot in this window.
      </p>
    );
  }

  return (
    <div className={cn('grid gap-2', className)}>
      {/* Readout. Above the plot rather than a floating tooltip: a popover
          anchored to a 9px-wide column inside a scrolling drawer either clips at
          the panel edge or has to be portalled out of it, and this says the same
          thing in a place that never moves.
          Deliberately NOT a live region — each column button already carries the
          same day and value in its accessible name, so announcing this too would
          read every focused column out twice. */}
      <p className="min-h-5 text-xs text-text-muted">
        {active ? (
          <>
            <span className="font-medium text-text">{active.label}</span>
            {' · '}
            <span className="font-semibold text-text">{formatValue(active.value)}</span>
            {active.note ? <span> · {active.note}</span> : null}
          </>
        ) : (
          (idleReadout ?? null)
        )}
      </p>

      {/* One wrapper around the plot and its axis band. With no `minColumnPx`
          it carries no classes at all and every box lands exactly where it did
          before; with one, it is the horizontal scroller, and its inner width
          is the single number both rows measure against so they cannot drift. */}
      <div className={minColumnPx > 0 ? 'overflow-x-auto scroll-pane' : undefined}>
        <div
          style={
            stripWidth > 0
              ? { minWidth: `max(100%, ${stripWidth}px)` }
              : undefined
          }
        >
          <div className="relative" style={{ height }}>
            {/* Recessive hairline grid: the baseline plus a solid mid rule. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border-strong"
            />

            {target !== undefined && target > 0 && target <= scaleMax ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-text-subtle"
                style={{ bottom: `${(target / scaleMax) * 100}%` }}
              />
            ) : null}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {plotted.map((d, i) => {
                const pct = Math.min(100, (d.value / scaleMax) * 100);
                // A day with no points still gets a visible stub, otherwise "did
                // nothing" and "is not in the window" look identical.
                const barPct = d.value > 0 ? Math.max(pct, 1.5) : 0;
                return (
                  <button
                    key={d.key}
                    type="button"
                    // The whole column height is the hit target, not the painted
                    // bar — aiming at a 3px-tall bar is not a thing anyone can do.
                    className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    style={columnStyle}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                    // The tap path, and there was none. Hover never fires on touch,
                    // and iOS does not focus a <button> on tap, so a day's value was
                    // simply unobtainable on an iPhone — it worked on Android only
                    // by accident of Chromium focusing buttons. The readout stays
                    // put afterwards, which is what makes a tapped value readable.
                    onPointerDown={() => setActiveIdx(i)}
                    onFocus={() => setActiveIdx(i)}
                    onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                    aria-label={`${d.label}: ${formatValue(d.value)}${d.note ? `, ${d.note}` : ''}`}
                  >
                    {barPct > 0 ? (
                      <span
                        className={cn(
                          'mx-auto block w-full max-w-6 rounded-t-[4px] transition-opacity',
                          d.muted
                            ? 'chart-hatch bg-surface-2'
                            : 'bg-brand group-hover:opacity-80 group-focus-visible:opacity-80',
                        )}
                        style={{ height: `${barPct}%` }}
                      />
                    ) : (
                      // Zero. A hairline stub says "worked, earned nothing"; the
                      // hatched block says "not here". The leave block is taller
                      // because a 45° hatch three pixels high is one stripe, which
                      // reads as a slightly darker stub and not as a texture at all
                      // — the whole point of the second channel is that it survives
                      // being looked at quickly.
                      <span
                        className={cn(
                          'mx-auto block w-full max-w-6 rounded-t-[2px]',
                          d.muted ? 'chart-hatch h-2 bg-surface-2' : 'h-[3px] bg-border-strong',
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Axis band is its own row, so the plot's fixed height can never crop it.
              `mt-2` replaces the grid gap it used to get as a direct grid child. */}
          <div className="mt-2 flex gap-[2px]" aria-hidden>
            {plotted.map((d, i) => (
              <span
                key={d.key}
                style={columnStyle}
                // Overflows its cell rather than truncating. A month of columns on a
                // phone is ~9px per cell, and 10px type needs ~11px for two digits —
                // `truncate` turned every day past the 9th into "1.", "2.", "3.".
                // Only every Nth cell carries a label, so the overflow lands in its
                // blank neighbours; the last tick overhangs into the card's padding.
                className="min-w-0 flex-1 whitespace-nowrap text-center text-[10px] tabular-nums text-text-subtle"
              >
                {(plotted.length - 1 - i) % step === 0 ? d.tick : ' '}
              </span>
            ))}
          </div>
        </div>
      </div>

      {trimmed || showAllColumns ? (
        <button
          type="button"
          onClick={() => setShowAllColumns((v) => !v)}
          // `md:hidden` as well as the `isMd` guard on the window itself: at
          // ≥ md every column is already plotted, so this would be a control
          // that changes nothing.
          className="tap-target w-fit rounded-sm px-1 py-1 text-left text-xs font-medium text-brand md:hidden"
        >
          {showAllColumns
            ? `Show only the last ${maxColumns}`
            : `Show all ${data.length}`}
        </button>
      ) : null}

      {/* The table is no longer optional below md.
          It used to render only when the caller supplied `tableCaption`, so a
          caller who left it out shipped a chart whose every value was
          hover-gated — unreachable on a phone. Now it always renders, and
          `md:hidden` keeps ≥ md byte-identical for those callers: a chart that
          showed no table on a desktop yesterday still shows none today. */}
      <details
        open={tableOpen || undefined}
        className={cn('text-xs', !tableCaption && 'md:hidden')}
      >
        {/* Block, not `inline-flex` — a flex `<summary>` loses its native
            disclosure triangle, and the repo's other `<details>` disclosures
            all keep theirs. Which is why the 44px floor is bought with
            `min-h-11` and padding rather than with `flex items-center`: the
            only tap route to every value in the chart was a ~30px target,
            and trading the marker away to fix it would be a poor bargain. */}
        <summary className="min-h-11 cursor-pointer select-none rounded-sm py-3 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-1.5">
          {tableCaption ?? 'Show values'}
        </summary>
        {/* The height cap and its nested scroller are `md:` only. Below md this
            table IS the chart — the columns are ~9px wide and every value is
            hover-gated — so a month of days was being read eight rows at a time
            through a 256px letterbox, and `overscroll-contain` meant a finger
            that landed on it could not scroll the PAGE either: the gesture was
            swallowed by a scroller that had nowhere left to go. Let it run to
            its full height on a phone and the page scroll is the only scroll.
            `overflow-x-auto` at every width because `main` is
            `overflow-x-hidden`: an unbreakable cell (a long formatted amount)
            would otherwise be clipped away rather than reachable. */}
        <div className="mt-2 overflow-x-auto rounded-sm border border-border md:max-h-64 md:overflow-y-auto md:overscroll-contain">
          <table className="w-full border-collapse text-xs">
            {/* Sticky from md up only. With the cap gone below md there is no
                scroller of its own to stick inside, and the nearest one is the
                page — whose padding insets the sticky viewport, so a plain
                `top-0` would park the header a gutter below the visible top and
                let rows scroll through the band above it. A header that simply
                scrolls away is the right answer on a phone. */}
            <thead className="bg-surface-2 text-text-muted md:sticky md:top-0">
              <tr>
                <th className="h-8 px-2 text-left font-semibold">Day</th>
                <th className="h-8 px-2 text-right font-semibold">{tableValueHeader}</th>
                <th className="h-8 px-2 text-left font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-border">
                  <td className="h-8 px-2 text-text">{d.label}</td>
                  <td className="h-8 px-2 text-right tabular-nums text-text">
                    {formatValue(d.value)}
                  </td>
                  <td className="h-8 px-2 text-text-subtle">{d.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Legend row for a chart. Identity is the swatch, never the text colour. */
export function ChartLegend({
  items,
  className,
}: {
  items: Array<{ key: string; label: string; swatch: React.ReactNode }>;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5 text-xs text-text-muted">
          {it.swatch}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export const LEGEND_SWATCHES = {
  series: <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-brand" />,
  muted: <span aria-hidden className="chart-hatch h-2.5 w-2.5 rounded-[2px] bg-surface-2" />,
  none: <span aria-hidden className="h-[3px] w-2.5 rounded-[1px] bg-border-strong" />,
  threshold: <span aria-hidden className="h-0 w-3.5 border-t border-dashed border-text-subtle" />,
} as const;
