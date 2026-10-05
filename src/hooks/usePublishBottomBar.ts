import * as React from 'react';

import { useMediaQuery } from './useMediaQuery';

/** Every bar currently publishing, keyed by its own effect; the tallest wins. */
const heights = new Map<object, number>();
let written = 0;

function write(): void {
  let max = 0;
  for (const h of heights.values()) max = Math.max(max, h);
  // Only on a change: `useSafeInsets` watches <html>'s style attribute, and a
  // ResizeObserver repeating the same height would wake every one of them.
  if (max === written) return;
  written = max;
  const root = document.documentElement;
  if (max > 0) root.style.setProperty('--bottom-bar-h', `${max}px`);
  else root.style.removeProperty('--bottom-bar-h');
}

/**
 * Publish the height of something pinned to the bottom of a phone screen as
 * `--bottom-bar-h` on <html>, so a toast can sit above it.
 *
 * The toast viewport is `position: fixed` and knows nothing about the page: it
 * cleared the tab bar (`--tab-bar-h`) and the gesture strip and then painted
 * straight over the chat composer and every sticky Save bar — a "Copied" on top
 * of Send, a failed save's error on top of the Save that would retry it. A
 * custom property is the one channel both sides can read without either
 * importing the other.
 *
 * Below md only, and only while `active`: at md the toast is in the corner and
 * clears nothing. Several bars at once publish the tallest; the variable is
 * removed when the last one unmounts.
 *
 * @example
 * const ref = React.useRef<HTMLDivElement>(null);
 * usePublishBottomBar(ref, !hidden);
 * return <div ref={ref} className="sticky bottom-0">…</div>;
 */
export function usePublishBottomBar(ref: React.RefObject<HTMLElement | null>, active = true): void {
  const isMd = useMediaQuery('(min-width: 768px)');
  React.useEffect(() => {
    const el = ref.current;
    if (!active || isMd || !el) return;
    const key = {};
    const measure = () => {
      heights.set(key, Math.round(el.getBoundingClientRect().height));
      write();
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      heights.delete(key);
      write();
    };
  }, [ref, active, isMd]);
}
