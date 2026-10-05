import * as React from 'react';

import { cn } from '@/lib/cn';

import { Button } from './Button';
import { Copyable } from './Copyable';

export interface KeyValueItem {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  /** Tabular figures, right-aligned at md+ so a column of numbers lines up. */
  numeric?: boolean;
  /** Value on its own full-width line at every width — a long note, an
   *  address, an error message. */
  block?: boolean;
  mono?: boolean;
  /** Renders the value through `Copyable` — selectable text plus a copy
   *  control that reports what it did. Only has an effect when `value` is a
   *  string or a number: there is nothing to put on the clipboard for an
   *  arbitrary node. */
  copyable?: boolean;
  /** Shown before the `collapseAfter` cut. */
  primary?: boolean;
}

export interface KeyValueListProps {
  items: readonly KeyValueItem[];
  /** `'rows'` (default) is label left / value right at md+. `'stacked'` keeps
   *  the label above the value at every width. */
  layout?: 'rows' | 'stacked';
  /** Label column width at md+. Default `'140px'`. */
  labelWidth?: string;
  columnsAtMd?: 1 | 2;
  /** Show only the `primary` items — or the first N when none are marked —
   *  behind a "Show all N fields" toggle. */
  collapseAfter?: number;
  /**
   * Below md, put each short pair on ONE line — label left, value right, a
   * `numeric` value right-aligned so a column of figures ends on the same
   * digit. For a list of short labels and short figures (a tank's dip, water
   * and stock): stacked, each pair cost 48px and a three-figure box 172px, with
   * the numbers ending wherever they happened to. A `block` item still takes
   * its own line. From md the list is exactly what `layout` draws without it.
   */
  inlineBelowMd?: boolean;
  className?: string;
}

/**
 * One record's fields, in the one shape that reliably reads at 360px.
 *
 * Below md it is always a single stacked column: label on its own line, value
 * under it with the full width of the card. The two-column grids this replaces
 * (`grid-cols-[140px_1fr]`, `[110px_1fr]`, `[100px_1fr]`) spend a third of a
 * 294px card on the label and leave ~142px for the value — and the values are
 * exactly the strings CSS will not break on its own: an email (no break at `@`
 * or `.`), a dealer code, a run id, an S3 key. Clipped, with pinch-zoom off and
 * `main` refusing to scroll sideways, means gone.
 *
 * Hence `break-words` on every value and `break-all` under `mono`, and hence
 * `copyable` rather than `truncate` for anything the admin has to transcribe.
 *
 * @example
 * <KeyValueList
 *   items={[
 *     { key: 'code', label: 'Dealer code', value: dealer.code, primary: true },
 *     { key: 'login', label: 'Login email', value: dealer.email, mono: true, copyable: true },
 *     { key: 'due', label: 'Amount due', value: formatInr(due), numeric: true },
 *     { key: 'err', label: 'Last error', value: run.error, block: true },
 *   ]}
 *   collapseAfter={3}
 * />
 */
export function KeyValueList({
  items,
  layout = 'rows',
  labelWidth = '140px',
  columnsAtMd = 1,
  collapseAfter,
  inlineBelowMd = false,
  className,
}: KeyValueListProps) {
  const [expanded, setExpanded] = React.useState(false);

  const visible = React.useMemo(() => {
    if (collapseAfter == null || expanded || items.length <= collapseAfter) {
      return items;
    }
    const primary = items.filter((i) => i.primary);
    return primary.length > 0 ? primary : items.slice(0, collapseAfter);
  }, [items, collapseAfter, expanded]);

  // The label width travels as a custom property so the grid template can stay
  // a static class — an arbitrary value built from a template literal is not in
  // the stylesheet Tailwind generates, because Tailwind reads the source as
  // text and never sees the interpolated string.
  const style = { '--kv-label': labelWidth } as React.CSSProperties;

  return (
    <div className={className}>
      <dl
        className={cn(
          // Below md every field is two stacked lines, so the gap between
          // fields is paid ten times on a record with ten of them. The label is
          // muted and the value is not, which is what keeps the pairs readable
          // at the tighter spacing.
          'grid gap-x-6 gap-y-2 md:gap-y-3',
          columnsAtMd === 2 && 'md:grid-cols-2',
        )}
        style={style}
      >
        {visible.map((item) => {
          const inline = inlineBelowMd && !item.block;
          return (
            <div
              key={item.key}
              className={cn(
                'min-w-0',
                // The md half resets exactly what this adds: `md:grid` (rows) or
                // `md:block` (stacked) takes the display back, and
                // `md:justify-normal` the one property a grid would still read.
                inline &&
                  cn(
                    'flex items-baseline justify-between gap-3',
                    layout === 'rows' ? 'md:justify-normal' : 'md:block',
                  ),
                layout === 'rows' &&
                  !item.block &&
                  'md:grid md:grid-cols-[var(--kv-label,140px)_minmax(0,1fr)] md:items-baseline md:gap-3',
              )}
            >
              {/* Inline, a long label wraps and the figure stays whole: the
                  label is the side that can lose width without losing meaning.
                  Without this "6,06,12,345 L" broke as "6,06,12,345" over "L". */}
              <dt className={cn('text-sm text-text-muted', inline && 'min-w-0')}>{item.label}</dt>
              <dd
                className={cn(
                  'min-w-0 break-words text-sm text-text',
                  item.mono && 'break-all font-mono',
                  item.numeric && 'tabular-nums md:text-right',
                  item.numeric && inline && 'shrink-0 whitespace-nowrap text-right md:whitespace-normal',
                  // `select-text` is what the native shell's long-press allow-list
                  // matches on, so a copyable value gets both selection and the
                  // callout without every caller remembering to pass the class
                  // down through `className` (which lands on the whole list).
                  item.copyable && 'select-text',
                )}
              >
                {item.copyable && isCopyable(item.value) ? (
                  <Copyable
                    value={String(item.value)}
                    mode="inline"
                    mono={item.mono}
                  />
                ) : (
                  item.value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {collapseAfter != null && visible.length < items.length ? (
        <Button
          variant="ghost"
          size="sm"
          // `padding="none"`, not `className="px-0"` — which is what this said
          // and which never applied, because `.px-0` is emitted before `.px-3`.
          // The toggle is meant to line up with the labels above it.
          padding="none"
          className="mt-2"
          onClick={() => setExpanded(true)}
        >
          Show all {items.length} fields
        </Button>
      ) : null}
      {collapseAfter != null && expanded && items.length > collapseAfter ? (
        <Button
          variant="ghost"
          size="sm"
          padding="none"
          className="mt-2"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </Button>
      ) : null}
    </div>
  );
}

function isCopyable(value: React.ReactNode): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}
