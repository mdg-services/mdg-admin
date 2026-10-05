/**
 * Put text on the clipboard, and say whether it worked.
 *
 * Two rungs, because the first is often missing here. `navigator.clipboard` is
 * absent outside a secure context, and its `writeText` rejects when the WebView
 * has not granted the permission — both of which happen in this app. The second
 * rung is the old selection copy: a hidden, read-only textarea holding the
 * value, selected, and `document.execCommand('copy')`. It is deprecated and it
 * still works in exactly the places the first rung does not.
 *
 * It never throws. `false` means neither rung took, and the caller owes the
 * admin a visible next step — select the value and say so, or put it in a
 * message — because a copy button that appears to do nothing is the one outcome
 * that is never acceptable. Focus is handed back to whatever had it, so a copy
 * from inside a sheet does not leave focus on <body>.
 *
 * @example
 * if (!(await copyText(link))) toast.info('Copy the link by hand:', { description: link });
 */
export async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission refused, or not a secure context. Fall through.
    }
  }
  if (typeof document === 'undefined' || !document.body) return false;

  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = value;
  // Read-only so a phone raises no keyboard for it; fixed and transparent so
  // nothing scrolls or flashes; 16px so iOS does not zoom in on focus.
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none;';
  document.body.appendChild(field);
  let ok = false;
  try {
    field.select();
    field.setSelectionRange(0, value.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  previous?.focus({ preventScroll: true });
  return ok;
}
