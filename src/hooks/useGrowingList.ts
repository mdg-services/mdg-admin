import * as React from 'react';

/** Rows a growing list shows before "Show more". */
export const GROWING_LIST_FIRST = 5;
/** Rows that join each time the end of the list nears the bottom of the screen. */
export const GROWING_LIST_STEP = 25;

/**
 * A list that arrives whole but is too long to draw at once: its first five
 * rows, then — once "Show more" is pressed — 25 more each time its end nears
 * the bottom of the screen. Drawn whole, the Films page's 7,392 share links
 * were half a million pixels tall, and Message results' 8,000 people froze the
 * page while they rendered.
 *
 * `resetKey` changing (another film, another send, another filter) starts the
 * list short again. Put `top` just above the list, so "Show fewer" can bring
 * it back into view, and `sentinel` just below its last row.
 */
export function useGrowingList(total: number, resetKey: string) {
  const [listed, setListed] = React.useState(GROWING_LIST_FIRST);
  React.useEffect(() => setListed(GROWING_LIST_FIRST), [resetKey]);
  const expanded = listed > GROWING_LIST_FIRST;

  // Watched against the screen, as the page itself scrolls. Built again after
  // every step, so a step that leaves the end still on screen (a tall screen)
  // reports again and adds the next, until the end is out of sight.
  const sentinel = React.useRef<HTMLDivElement>(null);
  const growing = expanded && listed < total;
  React.useEffect(() => {
    const el = sentinel.current;
    if (!growing || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setListed((n) => n + GROWING_LIST_STEP);
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [growing, listed]);
  const top = React.useRef<HTMLDivElement>(null);

  return {
    /** How many rows to draw. */
    listed: Math.min(listed, total),
    expanded,
    /** Rows "Show more" stands for; 0 when the list fits in its first rows. */
    hidden: Math.max(0, total - GROWING_LIST_FIRST),
    showMore: () => setListed(GROWING_LIST_FIRST + GROWING_LIST_STEP),
    showFewer: () => {
      setListed(GROWING_LIST_FIRST);
      // A long list folding up would leave the reader far below it.
      top.current?.scrollIntoView({ block: 'nearest' });
    },
    sentinel,
    top,
  };
}
