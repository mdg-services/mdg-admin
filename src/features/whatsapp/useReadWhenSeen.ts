import * as React from 'react';

/** Quiet for this long before the server is told, so scrolling past ten messages is one request. */
const SETTLE_MS = 600;
/** After a failed attempt, wait this long before asking again. */
const RETRY_MS = 15_000;

export interface ReadWhenSeenOptions {
  scrollRef: React.RefObject<HTMLElement>;
  /** Changes whenever lines are added or removed, so new ones get watched. */
  contentVersion: string;
  /** The chat is drawn and nothing is still loading. */
  enabled: boolean;
  /** Tell the server. Rejects if it did not go through; the next trigger tries again. */
  markRead: (upTo: string) => Promise<unknown>;
}

/**
 * "Read" means read: a message is marked only once it has been on the screen.
 *
 * Every unread message from them carries `data-unread-at` (its time). An
 * observer on the thread's own scroll box notes the newest one that has been at
 * least half in view; after a short quiet spell, and only while the tab is
 * visible, the server is told "up to that one". A message below the fold stays
 * unread until it is scrolled to — as in WhatsApp — and one that arrives while
 * the chat is open at the bottom is marked a moment later, by the same path.
 *
 * "Half in view" is measured against the box or the message, whichever is the
 * smaller test: a photo taller than the screen can never be half visible, but
 * half the screen of it is.
 */
export function useReadWhenSeen({ scrollRef, contentVersion, enabled, markRead }: ReadWhenSeenOptions): void {
  const seen = React.useRef<{ ms: number; at: string } | null>(null);
  const sent = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  const markRef = React.useRef(markRead);
  React.useEffect(() => {
    markRef.current = markRead;
  });

  // Named, so the retry below can call itself without the hook listing itself as a dependency.
  const schedule = React.useCallback(function schedule(delay: number) {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const s = seen.current;
      if (!s || s.ms <= sent.current) return;
      // A hidden tab is not reading. The visibility listener below picks it up.
      if (document.visibilityState !== 'visible') return;
      const before = sent.current;
      sent.current = s.ms;
      markRef.current(s.at).catch(() => {
        if (sent.current === s.ms) sent.current = before;
        schedule(RETRY_MS);
      });
    }, delay);
  }, []);

  React.useEffect(() => {
    const root = scrollRef.current;
    if (!enabled || !root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        let moved = false;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const at = (e.target as HTMLElement).dataset.unreadAt;
          if (!at) continue;
          const boxHeight = e.rootBounds?.height ?? root.clientHeight;
          if (e.intersectionRatio < 0.5 && e.intersectionRect.height < boxHeight * 0.5) continue;
          const ms = Date.parse(at);
          if (!Number.isFinite(ms)) continue;
          if (!seen.current || ms > seen.current.ms) {
            seen.current = { ms, at };
            moved = true;
          }
        }
        if (moved) schedule(SETTLE_MS);
      },
      { root, threshold: [0, 0.5, 1] },
    );
    root.querySelectorAll('[data-unread-at]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scrollRef, enabled, contentVersion, schedule]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && seen.current && seen.current.ms > sent.current) {
        schedule(SETTLE_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [schedule]);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
}
