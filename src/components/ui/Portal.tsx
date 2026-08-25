import type * as React from 'react';
import { createPortal } from 'react-dom';

export interface PortalProps {
  children: React.ReactNode;
  /** Defaults to `document.body`. */
  container?: HTMLElement | null;
}

/**
 * Render `children` out of the caller's subtree and into `document.body`.
 *
 * Every overlay in this app used to render exactly where it was written, which
 * is what makes the mobile sheet animation bite: `.animate-sheet-up` is declared
 * with `animation-fill-mode: both`, so the panel keeps `transform: translateY(0)`
 * forever — and a transformed element becomes the containing block for any
 * `position: fixed` descendant. An overlay opened from inside another overlay
 * (the Assist session drawer opens a Dialog; a Menu can open from inside a
 * sheet) therefore measured itself against the panel instead of the viewport,
 * and was mispositioned on phones only. Portalling to the body is the fix, and
 * it also collapses the ad-hoc z-index guessing: overlays become siblings, so
 * the one opened last is simply the one painted last.
 *
 * The container is resolved during render rather than after a mount effect on
 * purpose. Deferring by one commit would leave `Menu`'s popover unmeasured on
 * its first layout effect — it measures the panel to decide whether to flip
 * above the trigger — and the desktop menu would open invisible. With no
 * `document` at all (SSR) there is nothing to portal into, so it renders
 * nothing instead of throwing.
 */
export function Portal({
  children,
  container,
}: PortalProps): React.ReactPortal | null {
  const target =
    container ?? (typeof document === 'undefined' ? null : document.body);
  if (!target) return null;
  return createPortal(children, target);
}
