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
  /** How the buttons lay out below md, passed straight to `ActionRow`.
   *  `'stack'` (default) gives each its own full-width 44px row — right for one
   *  or two. `'wrap'` keeps them on one wrapped line, which is what three short
   *  labels want: stacked, Undo / Discard all / Review & apply cost 148px of a
   *  640px screen. */
  below?: 'stack' | 'wrap';
  /**
   * The bar's own chrome. `'bar'` (default) is the full-bleed `border-t` strip.
   * `'card'` gives it the rounded `Card` surface used by a save bar that is a
   * plain card at the top of a desktop page and only becomes a bar on a phone;
   * pair it with `className="md:static md:order-none"` at that call site.
   *
   * It is a prop because two packets needed it and each hand-rolled its own
   * `Card` plus its own spelling of the safe-area inset — the inset that fact 5
   * says nothing else on a drill-in is carrying.
   */
  surface?: 'bar' | 'card';
  /** `'below-md'` hides the bar from md up without depending on a `md:hidden`
   *  in `className` winning against the root's own display class. */
  visibility?: 'all' | 'below-md';
  summaryOnMobile?: boolean;
  /**
   * Below md, lift the pinned bar off the page: its own surface, an upward
   * shadow, and the full width of the screen.
   *
   * Opt-in because it only makes sense for `mode="sticky"` + `surface="bar"`,
   * and it is ignored otherwise. The default bar is the same white as the cards
   * and stops at the same gutter, so a card's side borders run straight past it
   * and the row it happens to be covering reads as a card someone sliced in
   * half — the bar looks like part of the list rather than like the thing
   * pinned over it. Bleeding to the screen edges is what breaks that line;
   * the surface and shadow say which of the two is on top.
   */
  elevated?: boolean;
  /**
   * Where the summary sits below md. `'above'` (default) gives it its own line
   * over the buttons; `'beside'` puts it on the same line, which is worth ~50px
   * of a 640px screen — a bar carrying a sentence and two buttons was 114px
   * tall, 15% of the screen, permanently over the list it serves.
   *
   * `'beside'` only pays off with a SHORT mobile summary: the buttons keep their
   * width (they are `whitespace-nowrap`) and the summary gets what is left, so a
   * sentence that wraps to four lines in ~140px is taller than stacking it was.
   * Pair it with `below="wrap"` or `below="row"`; the default `'stack'` puts the
   * buttons in a column, which is the shape this is trying to get rid of.
   * Ignored without `summaryOnMobile` and a `summary`. At md both placements are
   * the same row this bar has always drawn.
   */
  summaryPlacement?: 'above' | 'beside';
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
  below = 'stack',
  surface = 'bar',
  visibility = 'all',
  summaryOnMobile = false,
  elevated = false,
  summaryPlacement = 'above',
  className,
}: StickyActionBarProps) {
  const insets = useSafeInsets();
  // A `card` that bleeds to the screen edges is no longer a card, and a `fixed`
  // bar already spans the viewport, so the lift only applies to the one shape
  // it was drawn for.
  const lift = elevated && mode === 'sticky' && surface === 'bar';
  // With no summary on screen there is nothing to sit beside, and a lone
  // `shrink-0` ActionRow in a `justify-between` row would land at the left
  // instead of filling the line the way the stacked default does.
  const beside =
    summaryPlacement === 'beside' && summaryOnMobile && summary != null;
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
        // The bleed has to be the gutter token, not a hard-coded `-mx-3`: the
        // two numbers drifting apart is an overhang, and `main` is
        // `overflow-x-hidden`, so the overhang is clipped rather than
        // scrollable. Written as one branch rather than as extra classes on top
        // of the default because `cn` is clsx — a second `bg-*` or `px-*` in the
        // list is decided by stylesheet order, not by which one was written
        // last. The `md:` half restores today's bar exactly.
        lift
          ? '-mx-[var(--app-gutter)] bg-surface-2 px-[var(--app-gutter)] shadow-[0_-6px_16px_rgba(15,23,42,0.10)] md:mx-0 md:bg-surface md:px-4 md:shadow-none'
          : 'bg-surface px-3 md:px-4',
        // `card` matches the `Card` + `CardContent` (`p-4`) it replaces exactly,
        // so adopting it is a no-op at md; `bar` keeps the strip's own py-3.
        surface === 'card'
          ? 'rounded-md border border-border pt-4 shadow-sm'
          : cn(
              'border-t pt-3',
              lift ? 'border-border-strong md:border-border' : 'border-border',
            ),
        mode === 'sticky'
          ? cn(
              // `stick-bottom`, not `bottom-0`: a sticky offset resolves against
              // the scrollport inset by the SCROLLER'S padding, so `bottom-0`
              // parked the bar one page gutter above the bottom edge and let the
              // list scroll through the strip underneath it. The bar now spans
              // that gutter, so its own bottom padding has to cover it too —
              // hence the gutter inside the max().
              'sticky stick-bottom z-[var(--z-sticky)]',
              'pb-[calc(var(--app-gutter)+max(env(safe-area-inset-bottom),0.75rem))]',
              surface === 'card' ? 'md:pb-4' : 'md:pb-3',
            )
          : 'fixed inset-x-0 z-[var(--z-page-bar)]',
        visibility === 'below-md' && 'md:hidden',
        hidden && 'hidden',
        className,
      )}
      style={
        mode === 'fixed'
          ? { bottom: insets.tabBar, paddingBottom: fixedBottomPad }
          : undefined
      }
    >
      <div
        className={cn(
          'flex gap-2 md:flex-row md:items-center md:justify-between md:gap-3',
          beside
            ? 'flex-row items-center justify-between'
            : 'flex-col items-stretch',
        )}
      >
        {summary != null ? (
          <div
            className={cn(
              'min-w-0 break-words text-sm text-text-muted',
              // `flex-1` only where the buttons sit alongside: they are
              // `whitespace-nowrap` and never give width up, so the summary has
              // to be the item that takes what is left and wraps inside it.
              beside && 'flex-1',
              summaryOnMobile ? 'block' : 'hidden md:block',
            )}
          >
            {summary}
          </div>
        ) : null}
        <ActionRow
          below={below}
          align="end"
          className={cn('md:shrink-0', beside && 'shrink-0')}
        >
          {children}
        </ActionRow>
      </div>
    </div>
  );
}
