import * as React from 'react';

import { useSafeInsets } from '@/hooks/useSafeInsets';
import { cn } from '@/lib/cn';

import { ActionRow } from './ActionRow';

/** The bar's own breathing room, and the desktop bottom padding (`md:pb-3`). */
const MIN_BOTTOM_PAD = 12;

export interface StickyActionBarProps {
  /** What is pending and what the buttons will do to it. Hidden below md unless
   *  `summaryOnMobile` — a phone screen is 640px tall and the buttons are the
   *  part that has to be reachable. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  /** Hide the bar without unmounting its children, so a form's state and any
   *  focus inside it survive the bar going quiet. */
  hidden?: boolean;
  /** `'sticky'` (default) pins to the page scroller's bottom. The tab bar is an
   *  in-flow flex child of the shell, not `fixed`, so a sticky element inside
   *  `main` already rests **above** it — no tab-bar arithmetic, no z-index
   *  bidding. `'fixed'` pins to the viewport and has to clear the tab bar and
   *  the gesture strip itself; use it only when the content is not inside the
   *  page scroller. */
  mode?: 'sticky' | 'fixed';
  summaryOnMobile?: boolean;
  className?: string;
}

/**
 * The save/apply bar for a long editing screen.
 *
 * Both modes carry their own bottom inset. On a drill-in — `/dealers/:id`, an
 * open Inbox thread — the tab bar is gone and `body` gets `padding-bottom: 0`,
 * so **nothing else in the app is carrying the safe area** and a bar without it
 * lands in the Android gesture strip, where a swipe goes to the system and not
 * to the button.
 *
 * `'fixed'` reads the tab bar's live height instead of assuming 56px: it is 56
 * on a list screen, 0 on a drill-in and 0 at md+. Where the tab bar is present
 * it already clears the gesture strip, so the bar only adds the safe-area
 * inset when it is standing on the viewport edge alone.
 *
 * @example
 * <StickyActionBar
 *   summary={`${pending} unsaved change${pending === 1 ? '' : 's'}`}
 *   summaryOnMobile
 * >
 *   <Button variant="secondary" onClick={reset}>Discard</Button>
 *   <Button onClick={save} loading={saving}>Save changes</Button>
 * </StickyActionBar>
 */
export function StickyActionBar({
  summary,
  children,
  hidden = false,
  mode = 'sticky',
  summaryOnMobile = false,
  className,
}: StickyActionBarProps) {
  const insets = useSafeInsets();
  // When the tab bar is up it is the thing standing on the gesture strip, so
  // the bar only needs its own padding. At md+ both numbers are 0 and this
  // resolves to the same 12px `md:pb-3` the sticky mode writes as a class.
  const fixedBottomPad = Math.max(
    insets.tabBar > 0 ? 0 : insets.bottom,
    MIN_BOTTOM_PAD,
  );

  return (
    <div
      className={cn(
        'border-t border-border bg-surface px-4 pt-3',
        mode === 'sticky'
          ? 'sticky bottom-0 z-[var(--z-sticky)] pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-3'
          : 'fixed inset-x-0 z-[var(--z-page-bar)]',
        hidden && 'hidden',
        className,
      )}
      style={
        mode === 'fixed'
          ? { bottom: insets.tabBar, paddingBottom: fixedBottomPad }
          : undefined
      }
    >
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
        {summary != null ? (
          <div
            className={cn(
              'min-w-0 break-words text-sm text-text-muted',
              summaryOnMobile ? 'block' : 'hidden md:block',
            )}
          >
            {summary}
          </div>
        ) : null}
        <ActionRow below="stack" align="end" className="md:shrink-0">
          {children}
        </ActionRow>
      </div>
    </div>
  );
}
