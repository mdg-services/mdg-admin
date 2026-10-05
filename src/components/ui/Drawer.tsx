import { X } from 'lucide-react';
import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useOverlayEntry, useOverlayFocus } from '@/hooks/useOverlayStack';
import { cn } from '@/lib/cn';

import { OverlayFooter, type OverlayFooterBelow, OverlayHeading } from './OverlayParts';
import { Portal } from './Portal';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** A control for the title line — `<HowThisWorks variant="icon" … />`. Same
   *  contract as `Dialog`'s: beside the title's first line below md, the
   *  hand-rolled `flex flex-wrap items-center gap-2` row at md. */
  help?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The footer's layout below md, as on `Dialog`: `'stack'` (default),
   *  `'wrap'` or `'row'`. The same right-aligned row at md whichever you pick. */
  footerBelow?: OverlayFooterBelow;
  width?: 'sm' | 'md' | 'lg';
  /**
   * Below md only. `'sheet'` (default) is the bottom sheet capped at 95dvh.
   * `'fullscreen'` gives the panel the whole viewport — for content that is
   * itself the screen, such as a wide report frame, where the 5% and the
   * rounded lip are 40px the content needed more than the page behind it did.
   * `≥ md` is the same right-hand panel either way.
   */
  presentation?: 'sheet' | 'fullscreen';
  /**
   * `'none'` removes the body's own `p-4`, for a body that should meet the
   * panel's edges — a report frame, a table, a card stack. A prop and not a
   * `className`: `cn` is plain clsx, so a `p-0` passed in would lose to `p-4`
   * on stylesheet order.
   */
  bodyPadding?: 'default' | 'none';
}

const WIDTH_CLASSES: Record<NonNullable<DrawerProps['width']>, string> = {
  sm: 'w-full md:w-[420px]',
  md: 'w-full md:w-[560px]',
  lg: 'w-full md:w-[720px]',
};

/**
 * A right-side panel at `≥ md` (unchanged from before) and a full-height bottom
 * sheet below `md`, consistent with `Dialog`. Every `md:` class restores the
 * original desktop layout so desktop is unchanged; only mobile is additive.
 *
 * Renders through `Portal` and locks the page behind it, for the same reasons
 * as `Dialog`, and shares its overlay stack (Escape and Back close only the top
 * overlay), its focus handling and its accessible name.
 */
export function Drawer({
  open,
  onClose,
  title,
  help,
  description,
  children,
  footer,
  footerBelow = 'stack',
  width = 'md',
  presentation = 'sheet',
  bodyPadding = 'default',
}: DrawerProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  useOverlayEntry(open, onClose);
  useOverlayFocus(open, panelRef);
  useBodyScrollLock(open);

  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center bg-black/40 md:items-stretch md:justify-end"
        // pointerdown lands on the first touch; mousedown waits for the tap to
        // resolve, which read as a backdrop that ignored the first tap.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        <div
          ref={panelRef}
          // Focus lands on the panel when it opens — never on its first field,
          // which on a phone would raise the keyboard over an unread sheet.
          tabIndex={-1}
          className={cn(
            'flex flex-col bg-surface shadow-lg focus:outline-none',
            'w-full md:rounded-none',
            // The 95dvh sheet leaves the status bar showing above it; a
            // full-height one does not, and the overlay is `fixed`, so it is
            // laid out against the viewport and not against the body's own
            // safe-area padding. Hence the inset here — without it the panel's
            // title sits under the clock. `box-sizing: border-box` keeps the
            // panel exactly one viewport tall either way.
            presentation === 'fullscreen'
              ? 'h-[100dvh] max-h-none rounded-t-none pt-[env(safe-area-inset-top)] md:h-full md:pt-0'
              : 'max-h-[95dvh] rounded-t-2xl md:max-h-none md:h-full',
            'border-t border-border md:border-t-0 md:border-l',
            'animate-sheet-up md:animate-none',
            WIDTH_CLASSES[width],
          )}
        >
          {/* The grab cue belongs to a sheet. A full-screen panel has no lip to
              drag and nothing behind it to drag towards, so it would only cost
              a line of height. */}
          {presentation === 'sheet' ? (
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong md:hidden" />
          ) : null}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            <OverlayHeading
              titleId={titleId}
              title={title}
              help={help}
              description={description}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm p-2 text-text-muted hover:bg-surface-2 md:h-auto md:w-auto"
            >
              <X width={16} height={16} strokeWidth={1.75} />
            </button>
          </div>
          <div
            // Lets index.css's grid min-width rule reach this portalled body
            // below md, the way it reaches everything inside `main`.
            data-overlay-body
            className={cn(
              'flex-1 overflow-y-auto overscroll-contain',
              bodyPadding === 'none' ? '' : 'p-4',
            )}
          >
            {children}
          </div>
          {footer ? (
            <OverlayFooter below={footerBelow}>{footer}</OverlayFooter>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
