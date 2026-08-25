import { X } from 'lucide-react';
import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { cn } from '@/lib/cn';

import { Portal } from './Portal';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * A centered modal at `≥ md` (unchanged from before) and a full-height bottom
 * sheet below `md`. Every `md:` class restores the original desktop layout so
 * the desktop appearance is byte-for-byte the same; only the mobile behavior is
 * additive. The panel is a flex column capped at 92dvh with a scrolling body,
 * so the sticky footer stays above the keyboard (paired with
 * `interactive-widget=resizes-content`).
 *
 * It renders through `Portal`, which matters more than it looks: the mobile
 * panel keeps a `transform` after its entrance animation, and a transformed
 * element becomes the containing block for `position: fixed` descendants — so
 * a Dialog opened from inside a Drawer used to measure itself against the
 * drawer and sit a few percent off, on phones only.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogProps) {
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
        className="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
        role="dialog"
        aria-modal="true"
        // pointerdown, not mousedown: a touch fires pointerdown immediately and
        // mousedown only after the tap resolves, so a dismissing tap used to
        // land ~300ms late — long enough to read as an unresponsive backdrop.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={cn(
            'w-full border border-border bg-surface shadow-lg',
            'rounded-t-2xl rounded-b-none md:rounded-lg',
            'flex max-h-[92dvh] flex-col md:block md:max-h-none',
            'animate-sheet-up md:animate-none',
            SIZE_CLASSES[size],
          )}
        >
          {/* Grabber cue that this is a sheet — mobile only. */}
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong md:hidden" />
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3">
            {/* min-w-0 because a flex item defaults to min-width:auto, so a
                title with no spaces in it — a camera filename such as
                IMG_20260826_103211_register.jpg — refused to shrink and pushed
                the close button off the panel. */}
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="break-words text-lg font-semibold text-text">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 break-words text-sm text-text-muted">
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
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:max-h-[70vh] md:flex-none">
            {children}
          </div>
          {footer ? (
            // Stacked full-width below md, the row it has always been at md.
            // The buttons carry `whitespace-nowrap`, so the old equal-width
            // split gave "Cancel" and "Apply and regenerate" 164px each and the
            // longer label ran out of its own box and off the panel.
            // flex-col-REVERSE keeps the primary action last in the DOM, where
            // the tab order wants it, and first on screen.
            <div className="sticky bottom-0 z-10 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:flex-row md:items-center md:justify-end md:pb-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
