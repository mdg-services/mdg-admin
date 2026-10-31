import * as React from 'react';

import { useMediaQuery } from './useMediaQuery';

/**
 * Every bar currently publishing, keyed by its own effect; the tallest wins.
 * `right` is how far the bar's right-hand end is from the window's (md only).
 */
const bars = new Map<object, { height: number; right: number }>();
let written = { height: 0, right: 0 };

function write(): void {
  let top = { height: 0, right: 0 };
  for (const b of bars.values()) if (b.height > top.height) top = b;
  // Only on a change: `useSafeInsets` watches <html>'s style attribute, and a
  // ResizeObserver repeating the same height would wake every one of them.
  if (top.height === written.height && top.right === written.right) return;
  written = top;
  const root = document.documentElement;
  if (top.height > 0) root.style.setProperty('--bottom-bar-h', `${top.height}px`);
  else root.style.removeProperty('--bottom-bar-h');
  if (top.right > 0) root.style.setProperty('--bottom-bar-right', `${top.right}px`);
  else root.style.removeProperty('--bottom-bar-right');
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
 * clears nothing — except for a bar that passes `atMd`, the inbox reply boxes,
 * whose right-hand end (Send) IS that corner. Those also publish how far that
 * end is from the window's edge (`--bottom-bar-right`): with the side panel
 * open beside the chat, the corner is the panel's, and a toast there sat on
 * the Reply helper's own Suggest button. Several bars at once publish the
 * tallest; the variables are removed when the last one unmounts.
 *
 * @example
 * const ref = React.useRef<HTMLDivElement>(null);
 * usePublishBottomBar(ref, !hidden);
 * return <div ref={ref} className="sticky bottom-0">…</div>;
 */
export function usePublishBottomBar(
  ref: React.RefObject<HTMLElement | null>,
  active = true,
  atMd = false,
): void {
  const isMd = useMediaQuery('(min-width: 768px)');
  React.useEffect(() => {
    const el = ref.current;
    if (!active || (isMd && !atMd) || !el) return;
    const key = {};
    const measure = () => {
      const r = el.getBoundingClientRect();
      const right = isMd
        ? Math.max(0, Math.round(document.documentElement.clientWidth - r.right))
        : 0;
      bars.set(key, { height: Math.round(r.height), right });
      write();
    };
    measure();
    // The bar narrows as the panel opens beside it; the window resizing moves its end too.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      bars.delete(key);
      write();
    };
  }, [ref, active, isMd, atMd]);
}
