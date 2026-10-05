import * as React from 'react';

/**
 * Bring an inline message into view the moment it appears.
 *
 * Built for the error line at the top of a long form in a sheet. The admin
 * fills the form, scrolls to the end, presses Save — and the sentence saying
 * why it did not save is inserted ABOVE the part of the sheet they are looking
 * at. Nothing on screen changes, so the press reads as having done nothing.
 * Attach the returned ref to the message and it scrolls itself into view
 * whenever `value` turns truthy or changes.
 *
 * `again` is for the repeat. Pressing Save twice with the same mistake sets
 * the same sentence twice, which React treats as no change at all, so the
 * second press would reveal nothing. Pass a counter the caller moves on every
 * attempt and each press brings the message back.
 *
 * `block: 'nearest'` moves the scroller by the least it can: a message already
 * on screen does not move, and one above the fold lands at the top edge rather
 * than jumping the form out from under the thumb.
 */
export function useRevealOnChange<T extends HTMLElement = HTMLDivElement>(
  value: unknown,
  again?: unknown,
): React.RefObject<T> {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    if (!value) return;
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [value, again]);

  return ref;
}
