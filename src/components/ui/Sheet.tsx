import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOverlayEntry, useOverlayFocus } from '@/hooks/useOverlayStack';
import { cn } from '@/lib/cn';

import { Portal } from './Portal';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /**
   * A control for the title row — in practice `<HowThisWorks variant="icon" />`.
   * Kept OUT of the element `aria-labelledby` points at, so the sheet is named
   * "Actions" and not "Actions How this works: Conversation". Ignored without a
   * `title`.
   */
  help?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the panel (e.g. a max height). */
  className?: string;
}

/**
 * A minimal mobile-only bottom-sheet shell for menu lists: the "More" nav menu,
 * the thread-actions kebab, and the long-press message menu (§6.5). It renders
 * nothing at `≥ md` (`md:hidden`) — those surfaces keep their desktop popovers.
 * Compose it with `SheetItem` rows.
 *
 * Portalled to the body and sharing `--z-overlay` with the other three: with
 * every overlay a sibling of the others, whichever opened last is the one
 * painted last, which is what the old hand-picked 50/60 pair was trying to
 * approximate. Escape and Back reach it through the shared overlay stack, like
 * the other three, and focus moves onto the panel while it is open.
 */
export function Sheet({ open, onClose, title, help, children, className }: SheetProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // The panel is `md:hidden`, and a landscape phone is already `≥ md`
  // (852×393). Locking on `open` alone would leave a rotated device frozen
  // behind a sheet it can no longer see — and a sheet still on the overlay
  // stack would spend the next Escape or Back on closing nothing visible.
  const isMd = useMediaQuery('(min-width: 768px)');
  useOverlayEntry(open && !isMd, onClose);
  useOverlayFocus(open, panelRef);
  useBodyScrollLock(open && !isMd);

  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center bg-black/40 md:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // pointerdown fires on the first touch; mousedown waits for the tap to
        // resolve into a click.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          // The panel is its own scroller, so it is also the overlay body the
          // grid min-width rule in index.css needs to reach.
          data-overlay-body
          className={cn(
            'w-full max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface shadow-lg focus:outline-none',
            'pb-[max(env(safe-area-inset-bottom),0.5rem)] animate-sheet-up',
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong" />
          {title ? (
            <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3 text-sm font-semibold text-text">
              <span id={titleId} className="min-w-0 flex-1 break-words">
                {title}
              </span>
              {/* `-my-2` lets a 44px target sit on the 20px title line without
                  making the row taller. */}
              {help != null ? <span className="-my-2 -mr-2 flex shrink-0">{help}</span> : null}
            </div>
          ) : null}
          <div className="py-1">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

export interface SheetItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  active?: boolean;
}

/** A full-width tappable row for use inside `Sheet`. */
export function SheetItem({
  icon,
  active,
  children,
  className,
  ...rest
}: SheetItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface-2',
        // A sheet row is only ever touched: no lingering hover tint after the
        // tap, and a pressed paint while the finger is down.
        '[@media(hover:none)]:hover:bg-transparent [@media(hover:none)]:active:bg-surface-2',
        active ? 'text-brand' : 'text-text',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
