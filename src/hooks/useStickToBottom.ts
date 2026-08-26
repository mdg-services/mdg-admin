import * as React from 'react';

export interface StickToBottomOptions {
  /** How far from the bottom still counts as "reading the latest". */
  threshold?: number;
}

export interface StickToBottom<T extends HTMLElement> {
  /** Attach to the scrolling element. */
  ref: React.RefObject<T>;
  /** False once the reader has scrolled up — render a "jump to latest" cue. */
  isPinned: boolean;
  scrollToBottom: () => void;
}

/**
 * Keep a scroller pinned to its newest content — while the reader is at the
 * bottom, and only then.
 *
 * The naive version keys on the message count alone, which misses every case
 * where the scroller's *height* changes instead of its contents. That is the
 * common one on a phone: `interactive-widget=resizes-content` (deliberate, and
 * load-bearing for the composer) shrinks the layout viewport when the keyboard
 * opens, while `scrollTop` is preserved — so the newest messages slide below
 * the fold and the admin replies to something they can no longer see. The
 * reply-quote strip and a staged attachment row do the same thing from above.
 *
 * So near-bottom-ness is recorded on every scroll, and restored after any
 * resize of the element itself or of the visual viewport, plus whenever `deps`
 * says the content changed.
 */
export function useStickToBottom<T extends HTMLElement>(
  deps: React.DependencyList,
  opts?: StickToBottomOptions,
): StickToBottom<T> {
  const threshold = opts?.threshold ?? 200;
  const ref = React.useRef<T>(null);
  // The listeners below run outside React's render, so the live answer lives in
  // a ref; the state exists only for the caller's own rendering.
  const pinnedRef = React.useRef(true);
  const [isPinned, setIsPinned] = React.useState(true);

  const setPinned = React.useCallback((next: boolean) => {
    pinnedRef.current = next;
    setIsPinned((prev) => (prev === next ? prev : next));
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, [setPinned]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(gap <= threshold);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [threshold, setPinned]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const restore = () => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    };
    const observer = new ResizeObserver(restore);
    observer.observe(el);
    // On iOS the layout viewport can stay put while the visual one moves, so
    // the ResizeObserver alone would never hear the keyboard.
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', restore);
    return () => {
      observer.disconnect();
      viewport?.removeEventListener('resize', restore);
    };
  }, []);

  // `useLayoutEffect`, not `useEffect`: this is the branch that fires when a
  // thread first loads, and after paint means the reader sees the TOP of the
  // page they just opened for one frame before it jumps. The count-keyed code
  // this replaced was a layout effect, and dropping to a passive one was a
  // regression on a slow phone. The ResizeObserver and visualViewport branches
  // above stay passive — they react to events, not to a render.
  React.useLayoutEffect(() => {
    if (pinnedRef.current) scrollToBottom();
    // The caller owns this dependency list — it is the "content changed" signal
    // (message ids, a pending upload) and cannot be spelled out here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, isPinned, scrollToBottom };
}
