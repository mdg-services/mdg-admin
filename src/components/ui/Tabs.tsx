import * as React from 'react';

import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /**
   * Pinned to the right of the strip, outside the scrolling area — an overflow
   * menu, a count, an action. It stays put while the tabs scroll under it, and
   * the shared bottom rule runs behind it so the strip still reads as one bar.
   */
  trailing?: React.ReactNode;
}

export function Tabs({ items, value, onChange, className, trailing }: TabsProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const activeRef = React.useRef<HTMLButtonElement | null>(null);

  // Keep the selected tab in view — important on phones where the strip
  // horizontally scrolls and a deep-linked tab (e.g. ?tab=runs) can start
  // off-screen.
  //
  // This used to call scrollIntoView({ inline: 'center', block: 'nearest' }),
  // which walks *every* scrollable ancestor on *both* axes. With the strip 1px
  // taller than its own box (see the layout note below) `block: 'nearest'` had
  // something to correct on every tab change, so it nudged the strip — and on a
  // short viewport the page behind it — vertically. Writing scrollLeft
  // ourselves can only ever move this one element on one axis, which is all we
  // ever wanted.
  React.useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const delta =
      activeBox.left + activeBox.width / 2 - (listBox.left + listBox.width / 2);
    // The browser clamps to [0, scrollWidth - clientWidth], so the first and
    // last tabs simply rest against the ends instead of being centred.
    if (Math.abs(delta) > 1) list.scrollLeft += delta;
    // Deliberately keyed on `value` alone: callers rebuild `items` on every
    // render, and re-centring that often would fight a manual scroll.
  }, [value]);

  return (
    // The 1px rule lives on this static wrapper rather than on the scroller, so
    // the scroller has nothing to overflow vertically. `overflow-x-auto` on its
    // own is not "horizontal only": per CSS Overflow, when one axis is not
    // `visible` the other computes from `visible` to `auto`. Pair that with the
    // 2px active underline that the tabs used to pull down over the rule with
    // `-mb-px` and the content ended up exactly 1px taller than the box — a
    // real, draggable one-pixel vertical scroll (and something for the old
    // scrollIntoView to chase). The negative margin now sits on the scroller,
    // where it still lands the underline on the rule but costs no overflow, and
    // `overflow-y-hidden` states the intent instead of leaving it to that
    // computed-value rule.
    <div className={cn('flex items-center border-b border-border', className)}>
      <div
        ref={listRef}
        role="tablist"
        className={cn(
          '-mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden',
          'overscroll-x-contain scrollbar-thin snap-x snap-proximity',
        )}
      >
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'shrink-0 snap-start whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors md:py-2',
                active
                  ? 'border-brand text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {trailing ? (
        <div className="relative flex shrink-0 items-center">{trailing}</div>
      ) : null}
    </div>
  );
}
