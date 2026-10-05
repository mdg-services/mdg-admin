import * as React from 'react';

/** Input types that raise no keyboard — a box, a picker, a button. */
const NO_KEYBOARD_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextEntry(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !el.disabled && !NO_KEYBOARD_TYPES.has(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The viewport shrinking by more than this share of its full height is the
 *  keyboard; anything smaller is a URL bar sliding away. */
const KEYBOARD_SHARE = 0.2;

/**
 * Whether the on-screen keyboard is up: a text field has focus AND the visible
 * viewport has shrunk well below the tallest it has been at this width.
 *
 * Both halves are needed. Focus alone is true for a field focused by a hardware
 * keyboard or by script with no keyboard shown; a short viewport alone is true
 * in landscape. The comparison is against the tallest height SEEN, not against
 * `innerHeight`, because this app ships `interactive-widget=resizes-content`
 * and the native shell shrinks the WebView itself: the layout viewport shrinks
 * with the keyboard, so `innerHeight` and the visual viewport go down together
 * and comparing them would never notice. A width change (rotation) starts the
 * tallest-seen over.
 *
 * Moving focus from one field to the next does not flicker: `focusout` is read
 * a task later, by which time `focusin` on the next field has already landed.
 */
export function useSoftKeyboard(): boolean {
  const [up, setUp] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const height = () => vv?.height ?? window.innerHeight;
    let width = window.innerWidth;
    let tallest = height();
    let timer: number | null = null;

    const evaluate = () => {
      timer = null;
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = height();
      }
      const h = height();
      tallest = Math.max(tallest, h);
      setUp(isTextEntry(document.activeElement) && h < tallest * (1 - KEYBOARD_SHARE));
    };
    const later = () => {
      if (timer === null) timer = window.setTimeout(evaluate, 0);
    };

    document.addEventListener('focusin', evaluate);
    document.addEventListener('focusout', later);
    vv?.addEventListener('resize', evaluate);
    window.addEventListener('resize', evaluate);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('focusin', evaluate);
      document.removeEventListener('focusout', later);
      vv?.removeEventListener('resize', evaluate);
      window.removeEventListener('resize', evaluate);
    };
  }, []);

  return up;
}
