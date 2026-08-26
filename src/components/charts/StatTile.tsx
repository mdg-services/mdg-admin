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
          number like 121 read loose and gappy. Tabular is for columns.

          `break-words`, never `truncate`. Two tiles to a row on a 360px screen
          leaves each one ~150px wide, ~126px inside its `p-3`; `₹12,34,567` at
          24px semibold wants about 140 and was silently cut to `₹12,34,5…`.
          Truncating the one number the tile exists to show is worse than any
          alternative — including a wrap. `text-xl` below md buys back the
          difference, and md keeps today's 24px exactly.
          `flex-wrap` so the unit follows the value onto the second line rather
          than being squeezed out of the row. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-xl font-semibold leading-tight text-text md:text-2xl md:leading-none">
        <span className="min-w-0 break-words">{value}</span>
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
 * How full a meter is allowed to look before its colour says something.
 *
 * `brand` is the default and stays the rule for every meter that measures
 * progress: the fill length already says how far along it is, and repainting it
 * would spend the colour channel restating the length. `warning` / `danger` are
 * for a meter against a limit that HURTS when it is reached — a spend cap that
 * takes the feature off the air — where "nearly out" is a different fact from
 * "further along", and the caller decides which. It is never colour alone: the
 * caller pairs it with a caption that says the same thing in words.
 */
export type MeterTone = 'brand' | 'warning' | 'danger';

const METER_TONES: Record<MeterTone, { track: string; fill: string }> = {
  brand: { track: 'bg-brand-soft', fill: 'bg-brand' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning' },
  danger: { track: 'bg-danger-soft', fill: 'bg-danger' },
};

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
  tone = 'brand',
  className,
}: {
  value: number;
  limit: number;
  label: string;
  /** Printed on the right of the label row; defaults to `value / limit`. */
  valueLabel?: React.ReactNode;
  caption?: React.ReactNode;
  tone?: MeterTone;
  className?: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, (value / limit) * 100)) : 0;
  const { track, fill } = METER_TONES[tone];
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        {/* Wraps below md, `truncate` from md up. A meter's label is often the
            only place the PERIOD is named — "Points on Sat, 12 Jul 2026" wants
            ~200px of the ~190px it gets at 360px, and the half that got cut was
            the date, i.e. the whole content. A phone has the vertical room and
            not the horizontal one; a desktop row has the opposite, and keeps
            today's single line. */}
        <span className="min-w-0 break-words text-sm text-text-muted md:truncate">
          {label}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
          {valueLabel ?? `${value} / ${limit}`}
        </span>
      </div>
      <div
        className={cn('h-2.5 w-full overflow-hidden rounded-r-[4px]', track)}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={cn('h-2.5 rounded-r-[4px]', fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {caption ? <p className="text-xs text-text-subtle">{caption}</p> : null}
    </div>
  );
}
