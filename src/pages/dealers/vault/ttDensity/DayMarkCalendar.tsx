import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { IconButton, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  dayCellAriaLabel,
  dayCellClasses,
  dayCellState,
  isSelectableDay,
  monthGrid,
  monthLabel,
  registerMonthCounts,
  shiftMonth,
  type DayMark,
} from './format';

/**
 * A month of density-register days, as a grid.
 *
 * A grid and not a strip, and this is the whole design. What an operator opens
 * this card to see is the HOLES — the run of four days in the middle of July
 * when nobody photographed the page. A horizontal strip of 31 items either
 * scrolls, which puts the gaps off-screen, or shrinks its cells below the 44px
 * a thumb can hit. Seven columns by five rows shows the entire month at once and
 * turns a missed week into a visible hole in the block.
 *
 * The geometry is load-bearing, not tidy-able, and the hard case is 360px, not
 * 390. At 360 the admin's `main` padding leaves 328px and the card's `p-3`
 * leaves 304px; seven columns at `gap-1` land on (304 − 6×4) / 7 = **40.0px**,
 * four pixels under the touch floor, on the tap that opens the whole upload
 * flow. Two changes below md buy it back: the grid is pulled back out of the
 * card's own padding (`-mx-3`, so it spans the full 328px) and the gap drops to
 * 2px, giving (328 − 6×2) / 7 = **45.1px**. On a 390px phone the same sums give
 * 352px (the cap) and 48.6px.
 *
 * Both are undone at md (`md:mx-0`, `md:gap-1.5`), where the card is `p-4` and
 * the grid is capped at 352px anyway, so the desktop calendar is untouched.
 * Pinch-zoom is disabled app-wide, so a cell under 44px has no recovery on the
 * device — this arithmetic is the only defence there is.
 */

/** Sunday-first, because that is how the portal and every Indian wall calendar print it. */
const WEEKDAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface DayMarkCalendarProps {
  year: number;
  /** 1-based. */
  month: number;
  /** `yyyy-mm-dd` → who marked it. Days absent from this map have no photo. */
  marks: Record<string, DayMark | undefined>;
  /** The service's own start; earlier days render inert, because their emptiness means nothing. */
  minYmd: string;
  /** The oldest day the server still accepts a photo for; older gaps render inert. */
  earliestMarkableYmd: string;
  /** Today in IST — the ceiling for both the grid and the month arrows. */
  todayYmd: string;
  selectedYmd: string | null;
  onSelect: (ymd: string) => void;
  onMonthChange: (year: number, month: number) => void;
  loading?: boolean;
}

export function DayMarkCalendar({
  year,
  month,
  marks,
  minYmd,
  earliestMarkableYmd,
  todayYmd,
  selectedYmd,
  onSelect,
  onMonthChange,
  loading = false,
}: DayMarkCalendarProps) {
  const rows = React.useMemo(() => monthGrid(year, month), [year, month]);
  const counts = registerMonthCounts(year, month, marks, todayYmd, minYmd);

  // Bounded at both ends, the way `BusinessDateControl` bounds its day arrows:
  // never past the month we are living in, never before the month the service
  // started, because neither direction has anything to show.
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const canGoPrev = `${String(prev.year).padStart(4, '0')}-${String(prev.month).padStart(2, '0')}` >= minYmd.slice(0, 7);
  const canGoNext = `${String(next.year).padStart(4, '0')}-${String(next.month).padStart(2, '0')}` <= todayYmd.slice(0, 7);

  /**
   * One cell in the tab order at a time, arrows moving focus inside the month.
   *
   * A 31-stop tab sequence between the month header and the day panel is a
   * keyboard trap in everything but name. The roving cell starts on the selected
   * day, then today, then the first day of the month.
   */
  const [focusYmd, setFocusYmd] = React.useState<string | null>(null);

  /**
   * Every candidate below is filtered through this, and that is the whole
   * defence: an unselectable cell renders `disabled`, and a disabled button
   * cannot take focus whatever its `tabIndex`. A roving cell that settled on one
   * would drop the entire month out of the tab order — Tab would skip the grid
   * and there would be no keyboard way back into it.
   */
  const focusable = React.useCallback(
    (candidate: string | null | undefined): candidate is string =>
      !!candidate &&
      candidate.slice(0, 7) === monthKey &&
      isSelectableDay(
        dayCellState(candidate, marks[candidate], todayYmd, minYmd, earliestMarkableYmd),
      ),
    [monthKey, marks, todayYmd, minYmd, earliestMarkableYmd],
  );

  const rovingYmd = focusable(focusYmd)
    ? focusYmd
    : focusable(selectedYmd)
      ? selectedYmd
      : focusable(todayYmd)
        ? todayYmd
        : (rows.flat().find(focusable) ?? null);

  const gridRef = React.useRef<HTMLDivElement>(null);

  function stepDay(from: string, deltaDays: number): string {
    const stamp = Date.parse(`${from}T12:00:00Z`) + deltaDays * 86_400_000;
    return new Date(stamp).toISOString().slice(0, 10);
  }

  function moveFocus(from: string, deltaDays: number) {
    // Walk PAST the cells nobody can act on rather than parking on one: the
    // `.focus()` below is a no-op on a disabled button, which would leave
    // `focusYmd` claiming a cell the browser had actually dropped focus from.
    let target = stepDay(from, deltaDays);
    while (target.slice(0, 7) === monthKey && !focusable(target)) {
      target = stepDay(target, deltaDays);
    }
    if (!focusable(target)) return;
    setFocusYmd(target);
    // The cell may not exist yet as the focused element; ask the DOM for it.
    window.requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-ymd="${target}"]`)
        ?.focus();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, ymd: string) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(ymd, -1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(ymd, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(ymd, -7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(ymd, 7);
        break;
      case 'PageUp':
        if (!canGoPrev) return;
        e.preventDefault();
        onMonthChange(prev.year, prev.month);
        break;
      case 'PageDown':
        if (!canGoNext) return;
        e.preventDefault();
        onMonthChange(next.year, next.month);
        break;
      default:
        break;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* `IconButton`: the `px-2` these carried never applied — `cn` is
              plain clsx, so it landed beside the size's `px-3` and lost on
              stylesheet order — and a 16px glyph in a `Button` is 40 wide by 44
              tall, short on the axis a thumb travels along. */}
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="Previous month"
            disabled={!canGoPrev}
            onClick={() => onMonthChange(prev.year, prev.month)}
          >
            <ChevronLeft width={16} height={16} strokeWidth={1.75} />
          </IconButton>
          <div className="min-w-[9rem] text-center text-base font-semibold text-text">
            {monthLabel(year, month)}
          </div>
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="Next month"
            disabled={!canGoNext}
            onClick={() => onMonthChange(next.year, next.month)}
          >
            <ChevronRight width={16} height={16} strokeWidth={1.75} />
          </IconButton>
        </div>
        {/* Announced, because it changes under the operator when they upload. */}
        <p className="text-sm text-text-muted" aria-live="polite">
          {counts.covered} of {counts.expected} days
          {counts.missing > 0 ? (
            <>
              {' · '}
              <span className="font-medium text-warning">{counts.missing} missing</span>
            </>
          ) : null}
        </p>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`Density register photos, ${monthLabel(year, month)}`}
        className="-mx-3 mt-3 max-w-[352px] md:mx-0"
      >
        <div role="row" className="grid grid-cols-7 gap-0.5 md:gap-1.5">
          {WEEKDAY_HEADS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              role="columnheader"
              className="text-center text-[11px] font-semibold uppercase tracking-wide text-text-subtle"
            >
              {d}
            </div>
          ))}
        </div>

        {rows.map((week, wi) => (
          <div
            key={wi}
            role="row"
            className="mt-1 grid grid-cols-7 gap-0.5 md:mt-1.5 md:gap-1.5"
          >
            {week.map((ymd, di) => {
              if (!ymd) return <div key={`blank-${wi}-${di}`} role="gridcell" />;
              if (loading) {
                return (
                  <div key={ymd} role="gridcell">
                    <Skeleton className="aspect-square w-full rounded-md" />
                  </div>
                );
              }
              const mark = marks[ymd];
              const state = dayCellState(ymd, mark, todayYmd, minYmd, earliestMarkableYmd);
              const selectable = isSelectableDay(state);
              return (
                <div key={ymd} role="gridcell">
                  <button
                    type="button"
                    data-ymd={ymd}
                    disabled={!selectable}
                    tabIndex={ymd === rovingYmd ? 0 : -1}
                    aria-label={dayCellAriaLabel(ymd, state)}
                    aria-current={ymd === todayYmd ? 'date' : undefined}
                    onFocus={() => setFocusYmd(ymd)}
                    onKeyDown={(e) => onKeyDown(e, ymd)}
                    onClick={() => selectable && onSelect(ymd)}
                    className={cn(dayCellClasses(state, ymd === selectedYmd))}
                  >
                    {Number(ymd.slice(8, 10))}
                    {state === 'admin' ? (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-brand"
                      />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Every colour above is repeated here in words — no state in this feature
          is carried by hue alone. */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
        <LegendItem className="border border-success/30 bg-success-soft">Dealer sent</LegendItem>
        <LegendItem className="bg-success-soft ring-2 ring-inset ring-brand">
          MDG team added
        </LegendItem>
        <LegendItem className="border border-dashed border-border">Not marked</LegendItem>
      </ul>
    </div>
  );
}

function LegendItem({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn('h-3 w-3 rounded-sm', className)} />
      {children}
    </li>
  );
}
