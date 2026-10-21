import * as React from 'react';

/** Within this many pixels of the bottom still counts as "reading the latest". */
const NEAR_BOTTOM_PX = 80;
/** Room left above the unread divider when the chat opens on it. */
const DIVIDER_LEAD_PX = 56;

export interface ThreadScrollOptions {
  /** The first page of messages is on screen. Nothing is positioned before this. */
  ready: boolean;
  /** Key of the newest line on screen; changes when something is added at the bottom. */
  newestKey: string | null;
  /** Key of the oldest line on screen; changes when an older page is added at the top. */
  oldestKey: string | null;
  /** The thread has an "N unread" divider: open on it rather than at the bottom. */
  landOnDivider: boolean;
  /** How many of what was just added at the bottom came from them, given the key that was newest before. */
  countArrivals: (previousNewestKey: string | null) => number;
  /** Goes up by one each time the admin sends: the thread then scrolls down to show it. */
  bottomToken: number;
}

export interface ThreadScroll {
  scrollRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  /** At the bottom, reading the latest. */
  pinned: boolean;
  /** Messages from them that arrived while the reader was further up. */
  arrivals: number;
  scrollToBottom: () => void;
  /** Bring one loaded message to the middle of the screen. False if it is not loaded. */
  revealMessage: (id: string) => boolean;
}

/** A bubble that was on screen, and how far below the top of the scroll box its top edge was. */
interface Anchor {
  id: string;
  offset: number;
}

/**
 * One bubble by its message id. Matched by comparing, not by a selector: a
 * message id has dots and equals signs in it, and every one of those would need
 * escaping.
 */
function findMessageNode(el: HTMLElement, id: string): HTMLElement | undefined {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-message-id]')).find((n) => n.dataset.messageId === id);
}

/**
 * The first bubble whose bottom edge is below the top of the box — the one the
 * reader is looking at, or is about to — and where its top edge is. Bubbles are
 * in reading order, so a binary search finds it in a few reads; this runs on
 * every scroll event.
 */
function captureAnchor(el: HTMLElement): Anchor | null {
  const nodes = el.querySelectorAll<HTMLElement>('[data-message-id]');
  const boxTop = el.getBoundingClientRect().top;
  let lo = 0;
  let hi = nodes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((nodes[mid]?.getBoundingClientRect().bottom ?? 0) > boxTop) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  const node = found >= 0 ? nodes[found] : undefined;
  const id = node?.dataset.messageId;
  return node && id ? { id, offset: node.getBoundingClientRect().top - boxTop } : null;
}

/** Scroll so the anchored bubble is where it was; nothing to do if it is gone. */
function holdPlace(el: HTMLElement, anchor: Anchor | null): void {
  if (!anchor) return;
  const node = findMessageNode(el, anchor.id);
  if (!node) return;
  const drift = node.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
  if (Math.abs(drift) >= 1) el.scrollTop += drift;
}

/**
 * Where a chat is scrolled to, and how it stays there.
 *
 * - Opening: on the "N unread" divider if there is one, otherwise the bottom.
 * - A message arrives: follow it if the reader is at the bottom; otherwise
 *   leave them where they are and count it, so the screen can say "↓ 2 new".
 * - Lines are added or dropped above the reader — an older page loads at the
 *   top, or the loaded window moves because a new message pushed the oldest one
 *   out: the reader's place is kept to the pixel, by holding the first bubble
 *   they can see where it was. (Not by the change in the box's height: that
 *   also counts what was added below them, and what was dropped.)
 *   `overflow-anchor` is switched off on the scroller (see the page) because
 *   Chrome would otherwise make the same correction a second time.
 * - The box above or below changes height — the keyboard opens, the composer
 *   grows, a photo finishes loading — and the reader was at the bottom: stay
 *   at the bottom. A reader who had scrolled up is left alone.
 */
export function useThreadScroll(opts: ThreadScrollOptions): ThreadScroll {
  const { ready, newestKey, oldestKey, landOnDivider, bottomToken } = opts;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);
  const [pinned, setPinnedState] = React.useState(true);
  const [arrivals, setArrivals] = React.useState(0);
  const landed = React.useRef(false);
  // The bubble the reader was last seen at — the "before" a layout effect
  // needs, since by the time it runs the DOM already holds the "after".
  const anchor = React.useRef<Anchor | null>(null);
  const previous = React.useRef<{ newest: string | null; oldest: string | null }>({
    newest: null,
    oldest: null,
  });
  // Kept current in a layout effect, declared before the one that reads it: a
  // passive effect runs AFTER every layout effect of the same commit, so the
  // reader below would be handed the previous render's function — one that
  // still knows nothing of the message that has just arrived, and counts none.
  const countRef = React.useRef(opts.countArrivals);
  React.useLayoutEffect(() => {
    countRef.current = opts.countArrivals;
  });

  const setPinned = React.useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinnedState((p) => (p === next ? p : next));
    if (next) setArrivals(0);
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, [setPinned]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      anchor.current = captureAnchor(el);
      setPinned(el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [setPinned]);

  // A layout effect: the first frame of a chat must already be where the
  // reader is going to read, not at the top for one frame and then a jump.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    const before = previous.current;
    previous.current = { newest: newestKey, oldest: oldestKey };

    if (!landed.current) {
      landed.current = true;
      const divider = landOnDivider ? el.querySelector<HTMLElement>('[data-unread-divider]') : null;
      if (divider) {
        const top = divider.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
        el.scrollTop = Math.max(0, top - DIVIDER_LEAD_PX);
        setPinned(el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX);
      } else {
        el.scrollTop = el.scrollHeight;
        setPinned(true);
      }
      anchor.current = captureAnchor(el);
      return;
    }

    // Anything added above the reader, or dropped from there, moves what they
    // are reading; put it back. A line added only below leaves the anchor
    // where it was, so this does nothing then.
    if (before.oldest !== oldestKey || before.newest !== newestKey) holdPlace(el, anchor.current);
    if (before.newest !== newestKey) {
      if (pinnedRef.current) {
        el.scrollTop = el.scrollHeight;
      } else {
        const n = countRef.current(before.newest);
        if (n > 0) setArrivals((c) => c + n);
      }
    }
    anchor.current = captureAnchor(el);
  }, [ready, newestKey, oldestKey, landOnDivider, setPinned]);

  // After a send. A layout effect on the token, not a call from the click
  // handler: the new bubble is not in the page until the render that follows.
  React.useLayoutEffect(() => {
    if (bottomToken > 0) scrollToBottom();
  }, [bottomToken, scrollToBottom]);

  React.useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el) return;
    const restore = () => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
      // A reader further up has not scrolled, so no scroll event will say where
      // they are now that something above them has changed size.
      else anchor.current = captureAnchor(el);
    };
    const observer = new ResizeObserver(restore);
    observer.observe(el);
    if (content) observer.observe(content);
    // On iOS the layout viewport can stay put while the visual one moves, so
    // the observer alone would never hear the keyboard.
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', restore);
    return () => {
      observer.disconnect();
      viewport?.removeEventListener('resize', restore);
    };
  }, []);

  const revealMessage = React.useCallback((id: string): boolean => {
    const el = scrollRef.current;
    if (!el) return false;
    const target = findMessageNode(el, id);
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    // The same fade the dealer chat uses when it jumps to a quoted message.
    target.classList.remove('message-flash');
    void target.offsetWidth; // restart the animation when the same message is shown twice
    target.classList.add('message-flash');
    window.setTimeout(() => target.classList.remove('message-flash'), 2000);
    return true;
  }, []);

  return { scrollRef, contentRef, pinned, arrivals, scrollToBottom, revealMessage };
}
