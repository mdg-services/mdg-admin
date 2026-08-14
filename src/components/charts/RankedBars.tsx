import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * Ranked horizontal bars — the answer to "which of these is biggest", for
 * categories whose names are long enough that a column chart would rotate them.
 *
 * Deliberately NOT a donut. Part-to-whole at a glance tops out around six
 * slices, and the questions an admin actually asks here ("is cleaning most of
 * this worker's points?", "how far behind is the second one?") are comparisons
 * of length, which a shared baseline answers and angles do not. The share is
 * still available: pass `total` and each row prints its own percentage.
 *
 * One hue for every bar. Shading by value would spend the colour channel
 * restating the length. The `highlightKey` escape hatch is the exception the
 * rule exists for: when ONE row is the subject and the rest are context, it
 * takes the hue and everything else drops to grey.
 */

export interface RankedBarDatum {
  key: string;
  label: string;
  value: number;
  /** Muted clause under the bar, e.g. `12 entries`. */
  secondary?: React.ReactNode;
  /**
   * True rank, when the list is a SLICE of a longer ranking. Without it a
   * "top 10 plus the one you opened" list would label #23 as #11.
   */
  rank?: number;
}

export interface RankedBarsProps {
  data: RankedBarDatum[];
  /** Formats the value printed at the end of each row. */
  formatValue?: (n: number) => string;
  /**
   * Denominator for the per-row share caption. Omit to print no share (a top-N
   * slice of a longer list would otherwise imply the shares add to 100%).
   */
  total?: number;
  /** Emphasis mode: this row keeps the hue, every other row goes grey. */
  highlightKey?: string;
  /** Rank number printed before each label (1-based). */
  showRank?: boolean;
  className?: string;
}

export function RankedBars({
  data,
  formatValue = (n) => String(n),
  total,
  highlightKey,
  showRank,
  className,
}: RankedBarsProps) {
  // Scaled against the biggest row, not against `total`: with one dominant
  // category every other bar would be a sliver, and the comparison between the
  // small ones is usually the interesting part. The share caption carries the
  // proportion-of-total reading.
  const peak = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;

  return (
    <ul className={cn('grid gap-3', className)}>
      {data.map((d, i) => {
        const emphasised = highlightKey === undefined || d.key === highlightKey;
        const share = total !== undefined && total > 0 ? (d.value / total) * 100 : undefined;
        return (
          <li key={d.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-text">
                {showRank ? (
                  <span className="mr-1.5 tabular-nums text-text-subtle">{d.rank ?? i + 1}</span>
                ) : null}
                {d.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                {formatValue(d.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-r-[4px] bg-surface-2">
              <div
                className={cn('h-2 rounded-r-[4px]', emphasised ? 'bg-brand' : 'bg-border-strong')}
                style={{ width: `${Math.max((d.value / peak) * 100, 1)}%` }}
              />
            </div>
            {d.secondary !== undefined || share !== undefined ? (
              <p className="text-xs text-text-subtle">
                {d.secondary}
                {d.secondary !== undefined && share !== undefined ? ' · ' : null}
                {share !== undefined ? `${share.toFixed(share < 10 ? 1 : 0)}%` : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
