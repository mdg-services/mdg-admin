import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

interface TableContextValue {
  stickyHeader: boolean;
  density: TableDensity;
}

const TableContext = React.createContext<TableContextValue>({
  stickyHeader: false,
  density: 'default',
});

export type TableDensity = 'default' | 'compact';

/**
 * `compact` buys back horizontal room and nothing else. Six columns at `px-3`
 * spend 144px of a 328px screen on gutters before a single figure is drawn, so
 * a table narrow enough to read is a table that has stopped paying for them
 * twice. The ROW HEIGHT is deliberately untouched — `h-11` stays `h-11`, and a
 * tappable row keeps its 44px on the axis a thumb travels along.
 *
 * It travels on the context rather than as a class on each cell because the
 * cells are the caller's markup: 27 call sites would each have to remember it,
 * and `cn` is plain clsx, so a `px-2` passed to a `TD` would land beside the
 * emitted `px-3` and lose on stylesheet order.
 */
const DENSITY_CELL: Record<TableDensity, string> = {
  default: 'px-3',
  compact: 'px-2 md:px-3',
};

/**
 * Freezing the first column is done with arbitrary variants on the `<table>`
 * rather than a prop threaded into every `TH`/`TD`, because the cells are the
 * caller's markup — 27 call sites would each have to mark their own first cell,
 * and one of them (`DatasetTable`) already hand-rolled exactly these classes.
 *
 * The header's corner cell needs to beat the body's frozen cells on both axes,
 * hence 20 against 10.
 */
const FREEZE_FIRST_COLUMN =
  '[&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-20 [&_thead_th:first-child]:bg-surface-2 ' +
  '[&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:z-10 [&_tbody_td:first-child]:bg-surface';

/** Slack allowed before a few sub-pixels of rounding read as "it overflows". */
const OVERFLOW_EPSILON = 4;

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Pin the first cell of every row and of the header, so the identity column
   *  stays on screen while the numbers scroll under it. */
  freezeFirstColumn?: boolean;
  /** Pin the header row. Only does anything together with `maxHeight` — see the
   *  note on the component. */
  stickyHeader?: boolean;
  /** CSS length, e.g. `'60dvh'`. Makes the wrapper a real vertical scroller. */
  maxHeight?: string;
  /** Minimum table width, e.g. `'74rem'`. Guarantees the horizontal scroller
   *  engages instead of the columns crushing each other. */
  minWidth?: string;
  /** The right-edge fade and "Scroll →" chip, shown below md while the table
   *  overflows and has not been scrolled yet. Default on. */
  scrollHint?: boolean;
  /** Classes for the wrapper around the scroller — a border, a rounded corner —
   *  as opposed to `className`, which lands on the `<table>` itself. */
  wrapperClassName?: string;
  /** `'compact'` halves the cell padding below md and restores it at md+. The
   *  row height, and with it the tap target, is unchanged. */
  density?: TableDensity;
}

/**
 * The table shell: a horizontal scroller wrapping a plain `<table>`.
 *
 * Two long-standing bugs are fixed by the new props:
 *
 * 1. `THead` used to carry an unconditional `sticky top-0`, but its scroll
 *    container — this wrapper — has never had a height constraint, so there was
 *    nothing to stick to. Table headers have never stuck, on any viewport. The
 *    sticky classes now come from `stickyHeader`, which only makes sense with
 *    `maxHeight`, because that is what turns the wrapper into a vertical
 *    scroller. Dropping the old unconditional classes is safe precisely because
 *    they never had any effect.
 * 2. A wide table gave no cue that it scrolls, and nothing held the identity
 *    column in view. `freezeFirstColumn` + `scrollHint` are that cue.
 *
 * Everything defaults off (bar the hint, which only paints below md when the
 * table actually overflows), so a bare `<Table>` renders exactly as before.
 *
 * Note the wrapper is now two divs: the outer one is the positioning context
 * for the hint. The hint cannot live inside the scroller — `right: 0` there
 * resolves against the full scroll width, so it would sit at the far end of the
 * content rather than at the visible edge.
 */
export function Table({
  className,
  wrapperClassName,
  freezeFirstColumn = false,
  stickyHeader = false,
  maxHeight,
  minWidth,
  scrollHint = true,
  density = 'default',
  style,
  children,
  ...rest
}: TableProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = React.useState(false);
  const isMd = useMediaQuery('(min-width: 768px)');
  // A mouse has the scrollbar and the trackpad; the hint is for the finger.
  const hintEnabled = scrollHint && !isMd;

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !hintEnabled) {
      setShowHint(false);
      return;
    }
    const measure = () => {
      setShowHint(
        el.scrollWidth - el.clientWidth > OVERFLOW_EPSILON &&
          el.scrollLeft <= OVERFLOW_EPSILON,
      );
    };
    measure();
    // Two observers' worth of change with one observer: the scroller's own box
    // (rotation, a sidebar opening) and the table's (a column added, a long
    // value arriving with the data) move independently of each other.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const table = el.firstElementChild;
    if (table) ro.observe(table);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [hintEnabled]);

  const ctx = React.useMemo<TableContextValue>(
    () => ({ stickyHeader, density }),
    [stickyHeader, density],
  );

  return (
    <TableContext.Provider value={ctx}>
      <div className={cn('relative', wrapperClassName)}>
        <div
          ref={scrollerRef}
          className={cn(
            'w-full overflow-x-auto overscroll-x-contain',
            maxHeight && 'overflow-y-auto',
          )}
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table
            className={cn(
              'w-full border-collapse text-sm',
              freezeFirstColumn && FREEZE_FIRST_COLUMN,
              className,
            )}
            style={minWidth ? { minWidth, ...style } : style}
            {...rest}
          >
            {children}
          </table>
        </div>
        {showHint ? (
          // aria-hidden and pointer-events-none: it is a cue, not a control, and
          // it must never swallow a tap meant for the cell underneath it.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 flex w-20 items-center justify-end bg-gradient-to-l from-surface to-transparent pr-1 md:hidden"
          >
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted shadow-sm">
              Scroll →
            </span>
          </div>
        ) : null}
      </div>
    </TableContext.Provider>
  );
}

export function THead({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  const { stickyHeader } = React.useContext(TableContext);
  return (
    <thead
      className={cn(
        'bg-surface-2 text-xs uppercase tracking-wide text-text-muted',
        // Read off the context rather than taken as a prop, so `THead` keeps the
        // signature every call site already passes nothing to.
        stickyHeader && 'sticky top-0 z-10',
        className,
      )}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn(className)} {...rest}>
      {children}
    </tbody>
  );
}

export interface TRowProps
  extends React.HTMLAttributes<HTMLTableRowElement> {
  clickable?: boolean;
}

export function TRow({
  className,
  clickable,
  children,
  ...rest
}: TRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0',
        clickable && 'cursor-pointer hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { density } = React.useContext(TableContext);
  return (
    <th
      className={cn(
        'h-9 text-left font-semibold align-middle',
        DENSITY_CELL[density],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  className,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const { density } = React.useContext(TableContext);
  return (
    <td
      className={cn('h-11 align-middle text-text', DENSITY_CELL[density], className)}
      {...rest}
    >
      {children}
    </td>
  );
}
