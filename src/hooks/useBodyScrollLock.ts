import * as React from 'react';

export interface BodyScrollLockOptions {
  /** Override the scroller to lock. Defaults to `[data-app-scroller]`. */
  scrollerSelector?: string;
}

/** The shell marks its own scroller with this so the hook can find it. */
const DEFAULT_SCROLLER = '[data-app-scroller]';

/**
 * Nested overlays must not unlock the page when the inner one closes, so the
 * lock is reference counted at module scope: the first `active` hook locks, the
 * last one to release restores.
 */
let lockDepth = 0;
let releaseAll: Array<() => void> = [];

function lock(scrollerSelector: string): void {
  lockDepth += 1;
  if (lockDepth > 1) return;

  const targets: HTMLElement[] = [];
  const scroller = document.querySelector<HTMLElement>(scrollerSelector);
  if (scroller) targets.push(scroller);
  // Belt for the routes that render outside the shell — login and 404 — where
  // there is no app scroller and the document itself is what scrolls.
  if (document.body && !targets.includes(document.body)) targets.push(document.body);

  releaseAll = targets.map((el) => {
    const prevOverflow = el.style.overflow;
    const prevOverscroll = el.style.overscrollBehavior;
    // Recorded because a few engines drop the offset when a scroller stops
    // being one, and the admin would return to the top of a long ledger.
    const prevScrollTop = el.scrollTop;
    el.style.overflow = 'hidden';
    el.style.overscrollBehavior = 'contain';
    return () => {
      el.style.overflow = prevOverflow;
      el.style.overscrollBehavior = prevOverscroll;
      el.scrollTop = prevScrollTop;
    };
  });
}

function unlock(): void {
  lockDepth = Math.max(0, lockDepth - 1);
  if (lockDepth > 0) return;
  for (const release of releaseAll) release();
  releaseAll = [];
}

/**
 * Freeze the page behind an overlay while `active`, and restore it — scroll
 * position included — on release.
 *
 * The usual `document.body { overflow: hidden }` recipe is a no-op in this app:
 * the body is fixed-height and the thing that actually scrolls is `<main>`
 * inside the shell (`AppShell` tags it `data-app-scroller`). Without this, a
 * drag that started on a bottom sheet and ran past its end scrolled the list
 * underneath, and closing the sheet left the admin somewhere else in the page.
 *
 * Reference counted, so a Dialog opened from inside a Drawer does not unlock
 * the page when only the Dialog closes.
 */
export function useBodyScrollLock(
  active: boolean,
  opts?: BodyScrollLockOptions,
): void {
  const scrollerSelector = opts?.scrollerSelector ?? DEFAULT_SCROLLER;
  React.useEffect(() => {
    if (!active) return;
    lock(scrollerSelector);
    return unlock;
  }, [active, scrollerSelector]);
}
