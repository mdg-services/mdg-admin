import * as React from 'react';

import { cn } from '@/lib/cn';

import { ActionRow } from './ActionRow';
import { ClampedText } from './ClampedText';

/**
 * The title block and the footer that `Dialog` and `Drawer` share. Internal to
 * those two — not exported from the barrel — so the two headers cannot drift
 * apart again.
 */

export type OverlayFooterBelow = 'stack' | 'wrap' | 'row';

export interface OverlayHeadingProps {
  /** Lands on the element holding the title TEXT, which is what the overlay's
   *  `aria-labelledby` points at — never on anything holding `help`, or the
   *  help button's own label would be read out as part of the dialog's name. */
  titleId: string;
  title?: React.ReactNode;
  help?: React.ReactNode;
  description?: React.ReactNode;
}

export function OverlayHeading({ titleId, title, help, description }: OverlayHeadingProps) {
  return (
    // min-w-0 because a flex item defaults to min-width:auto, so a title with
    // no spaces in it — a camera filename such as
    // IMG_20260826_103211_register.jpg — refused to shrink and pushed the close
    // button off the panel.
    <div className="min-w-0 flex-1">
      {title ? (
        help == null ? (
          <h2 id={titleId} className="break-words text-lg font-semibold text-text">
            {title}
          </h2>
        ) : (
          <h2 className="break-words text-lg font-semibold text-text">
            {/* The md classes are the markup two dozen call sites hand-rolled
                for a title with a help glyph — `flex flex-wrap items-center
                gap-2` around the words and the icon — so moving one onto
                `help` changes nothing on a desktop. Below md that markup
                wrapped the 44px icon onto a row of its own under a two-line
                title, in a header that does not scroll. Here the words take the
                line's width and wrap inside it, and the icon stays beside their
                first line; `-my-2` lets a 44px target sit on a 28px line
                without making the line taller. */}
            <span className="flex items-start gap-2 md:flex-wrap md:items-center">
              <span id={titleId} className="min-w-0 flex-1 break-words md:flex-initial">
                {title}
              </span>
              <span className="-my-2 flex shrink-0 md:my-0">{help}</span>
            </span>
          </h2>
        )
      ) : null}
      {description ? (
        // Two lines and a "more" below md, because this header is sticky above
        // the body and a long description is height the reader can never
        // scroll past. It used to be a bare `line-clamp-2`, which deleted the
        // second half of the sentence with no way to read it — "This will
        // message the dealer" lost "the dealer". Unclamped at md, as before.
        <ClampedText className="mt-1 break-words text-sm text-text-muted">
          {description}
        </ClampedText>
      ) : null}
    </div>
  );
}

export interface OverlayFooterProps {
  below: OverlayFooterBelow;
  children: React.ReactNode;
}

/**
 * The stacking itself belongs to `ActionRow`, which emits exactly these classes:
 * full-width buttons in a column below md, the right-aligned row it has always
 * been at md. Only the footer's own chrome — the sticky bar, its border, and the
 * safe-area padding that keeps it out of the gesture strip — is passed in here.
 *
 * `'wrap'` is a wrapping ROW at md too, so it is pinned back to `nowrap` there:
 * every value of `below` is then the same single row on a desktop.
 */
export function OverlayFooter({ below, children }: OverlayFooterProps) {
  return (
    <ActionRow
      below={below}
      align="end"
      className={cn(
        'sticky bottom-0 z-10 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-3',
        below === 'wrap' && 'md:flex-nowrap',
      )}
    >
      {children}
    </ActionRow>
  );
}
