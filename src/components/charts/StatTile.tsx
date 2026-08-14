import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * The form for a headline number. A single value is not a one-bar bar chart —
 * it is a number with a label, optionally a change and a footnote.
 *
 * The delta is the fiddly part and the reason this is a component rather than
 * three divs at each call site: a change is meaningless without the period it is
 * measured against, and its colour has to follow *whether up is good*, not the
 * sign. It is never colour-alone either — the arrow direction and the spelled
 * out comparison carry it for anyone who cannot see the green.
 */

export interface StatTileDelta {
  /** Signed change in the same unit as the value. */
  value: number;
  /** What it is measured against, e.g. `vs 5–11 Jul`. Always named. */
  label: string;
  format?: (n: number) => string;
  /** Which direction is the good one. Omit for a neutral, uncoloured delta. */
  goodWhen?: 'up' | 'down';
}

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Small unit or qualifier printed after the value, e.g. `pts`. */
  unit?: string;
  delta?: StatTileDelta;
  caption?: React.ReactNode;
  className?: string;
}

export function StatTile({ label, value, unit, delta, caption, className }: StatTileProps) {
  return (
    <div className={cn('min-w-0 rounded-md border border-border bg-surface p-3', className)}>
      <p className="truncate text-xs font-medium text-text-muted">{label}</p>
      {/* Proportional figures, not tabular: at this size `tabular-nums` makes a
          number like 121 read loose and gappy. Tabular is for columns. */}
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold leading-none text-text">
        <span className="min-w-0 truncate">{value}</span>
        {unit ? <span className="text-sm font-medium text-text-muted">{unit}</span> : null}
      </p>
      {delta ? <DeltaLine delta={delta} /> : null}
      {caption ? <p className="mt-1 text-xs leading-snug text-text-subtle">{caption}</p> : null}
    </div>
  );
}

function DeltaLine({ delta }: { delta: StatTileDelta }) {
  const fmt = delta.format ?? ((n: number) => String(n));
  const flat = delta.value === 0;
  const up = delta.value > 0;
  const good = delta.goodWhen === undefined ? undefined : up === (delta.goodWhen === 'up');
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        // Wraps rather than truncates. The period a change is measured against
        // is the half of this line that carries the meaning, and "+149.84 vs
        // previo…" names no period at all — at four tiles to a row there is
        // never enough width to rely on it fitting.
        'mt-1.5 flex flex-wrap items-center gap-x-1 text-xs font-medium',
        flat || good === undefined ? 'text-text-muted' : good ? 'text-success' : 'text-danger',
      )}
    >
      <Icon width={13} height={13} strokeWidth={2} className="shrink-0" aria-hidden />
      <span className="tabular-nums">
        {flat ? 'No change' : `${up ? '+' : '−'}${fmt(Math.abs(delta.value))}`}
      </span>
      <span className="font-normal text-text-subtle">{delta.label}</span>
    </p>
  );
}

/**
 * A single ratio against a limit. The unfilled track is a lighter step of the
 * fill's own ramp (brand-soft under brand) so the whole bar reads as one scale
 * rather than as a coloured bar sitting on unrelated grey.
 */
export function Meter({
  value,
  limit,
  label,
  valueLabel,
  caption,
  className,
}: {
  value: number;
  limit: number;
  label: string;
  /** Printed on the right of the label row; defaults to `value / limit`. */
  valueLabel?: React.ReactNode;
  caption?: React.ReactNode;
  className?: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (value / limit) * 100)) : 0;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-text-muted">{label}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
          {valueLabel ?? `${value} / ${limit}`}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-r-[4px] bg-brand-soft"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div className="h-2.5 rounded-r-[4px] bg-brand" style={{ width: `${pct}%` }} />
      </div>
      {caption ? <p className="text-xs text-text-subtle">{caption}</p> : null}
    </div>
  );
}
