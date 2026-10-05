import { X } from 'lucide-react';
import * as React from 'react';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useOverlayEntry, useOverlayFocus } from '@/hooks/useOverlayStack';
import { cn } from '@/lib/cn';

import { OverlayFooter, type OverlayFooterBelow, OverlayHeading } from './OverlayParts';
import { Portal } from './Portal';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /**
   * A control that belongs on the title line — in practice
   * `<HowThisWorks variant="icon" … />`. Below md it stays beside the FIRST
   * line of a title that wraps instead of dropping to a 44px row of its own in
   * a header that does not scroll; at md it renders exactly the
   * `flex flex-wrap items-center gap-2` row the call sites used to hand-roll
   * inside `title`. Ignored without a `title`.
   */
  help?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * How the footer's buttons lay out below md, passed to its `ActionRow`.
   * `'stack'` (default) is a full-width row per button. `'wrap'` or `'row'`
   * keep them on one line, for a footer of short labels over a form the
   * keyboard will be up for: three stacked buttons are 165px, and with the
   * keyboard open that left a send-back reason box 32px of body to live in.
   * At md every value is the same right-aligned row.
   */
  footerBelow?: OverlayFooterBelow;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether the mobile sheet plays its slide-up as it mounts. Defaults to true
   * and should stay that way everywhere but one place: a Dialog that REPLACES
   * another Dialog which has already slid up.
   *
   * That happens in front of a lazily-loaded dialog, where a Suspense fallback
   * renders a real sheet so the tap feels immediate and the finished dialog
   * takes its place once the chunk lands. The two are separate elements, so the
   * entrance is mount-driven for both and the second one would start at
   * `translateY(100%)` again — the panel would drop off the bottom of the
   * screen and climb back up, which reads as a glitch rather than as loading.
   *
   * Desktop never sees any of this: the entrance is `md:animate-none`, so both
   * settings are visually identical at `≥ md`.
   */
  animateIn?: boolean;
  /**
   * `'none'` removes the body's own `p-4`. For a body that IS a full-bleed
   * thing — a card stack, a table, a report frame — which should meet the
   * panel's edges rather than lose 32px of a 328px sheet to a gutter it did not
   * ask for. A prop and not a `className`, because `cn` is plain clsx and a
   * `p-0` passed in would land beside `p-4` and lose on stylesheet order.
   */
  bodyPadding?: 'default' | 'none';
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
 *
 * Escape and Android's Back go through the shared overlay stack
 * (`useOverlayStack`), so a confirm opened over this dialog takes the key for
 * itself and this one stays open. Focus moves to the panel on open and back to
 * the opener on close, and the dialog is named by its title.
 */
export function Dialog({
  open,
  onClose,
  title,
  help,
  description,
  children,
  footer,
  footerBelow = 'stack',
  size = 'md',
  animateIn = true,
  bodyPadding = 'default',
}: DialogProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  useOverlayEntry(open, onClose);
  useOverlayFocus(open, panelRef);
  useBodyScrollLock(open);

  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // pointerdown, not mousedown: a touch fires pointerdown immediately and
        // mousedown only after the tap resolves, so a dismissing tap used to
        // land ~300ms late — long enough to read as an unresponsive backdrop.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          // The focus target on open: the panel, not its first field, so a
          // phone does not raise the keyboard over a sheet nobody has read.
          tabIndex={-1}
          className={cn(
            'w-full border border-border bg-surface shadow-lg focus:outline-none',
            'rounded-t-2xl rounded-b-none md:rounded-lg',
            'flex max-h-[92dvh] flex-col md:block md:max-h-none',
            animateIn ? 'animate-sheet-up md:animate-none' : 'animate-none',
            SIZE_CLASSES[size],
          )}
        >
          {/* Grabber cue that this is a sheet — mobile only. */}
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong md:hidden" />
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
            // `data-overlay-body` lets index.css's grid rule reach in here: the
            // panel is portalled out of `main`, so the app-scroller version of
            // the rule never applied, and one long unbroken error line widened
            // a run's detail body to ~1,500px on a phone.
            data-overlay-body
            className={cn(
              'flex-1 overflow-y-auto overscroll-contain md:max-h-[70vh] md:flex-none',
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
