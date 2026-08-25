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
          'grid gap-x-6 gap-y-3',
          columnsAtMd === 2 && 'md:grid-cols-2',
        )}
        style={style}
      >
        {visible.map((item) => (
          <div
            key={item.key}
            className={cn(
              'min-w-0',
              layout === 'rows' &&
                !item.block &&
                'md:grid md:grid-cols-[var(--kv-label,140px)_minmax(0,1fr)] md:items-baseline md:gap-3',
            )}
          >
            <dt className="text-sm text-text-muted">{item.label}</dt>
            <dd
              className={cn(
                'min-w-0 break-words text-sm text-text',
                item.mono && 'break-all font-mono',
                item.numeric && 'tabular-nums md:text-right',
                item.copyable && 'selectable',
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
        ))}
      </dl>
      {collapseAfter != null && visible.length < items.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 px-0"
          onClick={() => setExpanded(true)}
        >
          Show all {items.length} fields
        </Button>
      ) : null}
      {collapseAfter != null && expanded && items.length > collapseAfter ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 px-0"
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
