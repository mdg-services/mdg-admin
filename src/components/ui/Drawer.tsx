import { X } from 'lucide-react';
import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { cn } from '@/lib/cn';

import { ActionRow } from './ActionRow';
import { Portal } from './Portal';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
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
 * as `Dialog`.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
  presentation = 'sheet',
  bodyPadding = 'default',
}: DrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
      >
        <div
          className={cn(
            'flex flex-col bg-surface shadow-lg',
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
            {/* min-w-0: without it a long unbroken title cannot shrink and
                squeezes the close button to nothing. */}
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="break-words text-lg font-semibold text-text">
                  {title}
                </h2>
              ) : null}
              {description ? (
                // Clamped below md: this header is sticky above the body and
                // does not scroll, so a long description is height the reader
                // can never get past to reach the content.
                <p className="mt-1 line-clamp-2 break-words text-sm text-text-muted md:line-clamp-none">
                  {description}
                </p>
              ) : null}
            </div>
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
            className={cn(
              'flex-1 overflow-y-auto overscroll-contain',
              bodyPadding === 'none' ? '' : 'p-4',
            )}
          >
            {children}
          </div>
          {footer ? (
            // The same `ActionRow below="stack"` footer as `Dialog`: stacked
            // full-width below md, the right-aligned row it has always been at
            // md. Only the sticky chrome and the safe-area padding are local.
            <ActionRow
              below="stack"
              align="end"
              className="sticky bottom-0 z-10 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-3"
            >
              {footer}
            </ActionRow>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
