import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * The row of headline numbers above a chart.
 *
 * Every screen that shows tiles had written its own `grid-cols-2 md:grid-cols-4`
 * and they had drifted, which matters more than it sounds: the column count is
 * what decides how much width each number gets, and the numbers here are rupee
 * amounts and litre volumes that run to eight or nine characters. Four tiles
 * across a 360px screen is 82px each — no figure in this product fits that, and
 * the tile used to hide the overflow rather than admit it.
 *
 * So the phone layout is not a caller's choice: two columns, or ONE when the
 * caller says the values are long. Only the `md` count is a parameter, because
 * above 768px there is room for whatever the screen wants.
 */
export interface StatTileGridProps {
  children: React.ReactNode;
  /** Columns at md and above. Below md it is always 2, or 1 when `wideValues`. */
  columnsAtMd?: 2 | 3 | 4;
  /** Currency, litres, anything long — one column below md so nothing wraps. */
  wideValues?: boolean;
  className?: string;
}

// Written out rather than interpolated: Tailwind scans source text, so
// `md:grid-cols-${n}` produces no CSS at all.
const MD_COLUMNS: Record<NonNullable<StatTileGridProps['columnsAtMd']>, string> =
  {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

export function StatTileGrid({
  children,
  columnsAtMd = 4,
  wideValues = false,
  className,
}: StatTileGridProps) {
  return (
    <div
      className={cn(
        'grid gap-2 md:gap-3',
        wideValues ? 'grid-cols-1' : 'grid-cols-2',
        MD_COLUMNS[columnsAtMd],
        className,
      )}
    >
      {children}
    </div>
  );
}
