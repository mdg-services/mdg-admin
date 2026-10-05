import { Check, Copy } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';

import { IconButton } from './IconButton';
import { Input } from './Input';
import { useToast } from './Toast';

/**
 * A value the admin has to be able to READ IN FULL and take away with them.
 *
 * WHY A REAL `<input readOnly>` FOR `mode="field"`
 * ------------------------------------------------
 * `index.css` sets `user-select: none` on `#root` and `-webkit-touch-callout:
 * none` on `html` — deliberately, it is what stops the app feeling like a web
 * page inside the WebView. Only `input`, `textarea` and `[contenteditable]` are
 * exempted. So a value printed into a `<div>` on a phone cannot be selected,
 * cannot be long-pressed, and has no Copy in any menu. Add `truncate` and it
 * cannot even be read.
 *
 * That combination is behind the one genuine data-loss path in this app: the
 * dealer onboarding panel shows a one-time temporary password in a truncated
 * `font-mono` div about 118px wide, in a panel that says on the next line that
 * the password cannot be retrieved later — and its own error branch tells the
 * admin to "copy it manually", which on this platform is not a thing they can
 * do. `mode="field"` is the answer: a real field, so selection and the paste
 * callout come back, at full width, with the value never truncated.
 *
 * Below md that field is a read-only TEXTAREA that grows to fit, not a
 * one-line input. A revealed portal login ID is often a 52-character email and
 * a generated password 32 characters; in a 232px single-line field the admin
 * reading one out over the phone saw 22 characters and had to scrub through the
 * rest. A textarea is on the same selection and long-press allow-lists as an
 * input, so nothing else changes. At md it is today's `<Input>`.
 *
 * `mode="inline"` is for a value inside a sentence — a run id, a dealer code —
 * where a field would be absurd. It marks the span `select-text`, which hands
 * the same three CSS properties back to that one span AND is the exact class
 * the native shell's long-press allow-list looks for.
 *
 * THE COPY ITSELF NEVER SILENTLY FAILS
 * ------------------------------------
 * `navigator.clipboard` is absent outside a secure context and its `writeText`
 * rejects when the WebView has not granted permission — both of which happen
 * here. So there are three rungs: `copyText` (`@/lib/clipboard`) tries the
 * async Clipboard API and then the document's own copy, and if both refuse,
 * this selects the value on screen and SAYS SO ("select-and-tell"), which is a
 * worse outcome than a copy but a far better one than a button that appears to
 * do nothing.
 */
export interface CopyableProps {
  /** The exact text placed on the clipboard. */
  value: string;
  label?: React.ReactNode;
  mono?: boolean;
  /**
   * 'field'  — a readOnly `<input>` plus a copy button. Use it for secrets and
   *            for any value the admin must read in full or transcribe.
   * 'inline' — a `select-text` span plus a copy button, for use inside prose.
   */
  mode?: 'field' | 'inline';
  toastLabel?: string;
  className?: string;
}

/** How long the button shows a tick before returning to the copy glyph. */
const COPIED_FEEDBACK_MS = 1600;

export function Copyable({
  value,
  label,
  mono,
  mode = 'field',
  toastLabel = 'Copied',
  className,
}: CopyableProps) {
  const toast = useToast();
  const isMd = useMediaQuery('(min-width: 768px)');
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  /** Put the value under the user's own selection, so a long-press can finish
   *  the job by hand. Returns false when there was nothing to select. */
  const selectValue = React.useCallback((): boolean => {
    const field = inputRef.current ?? areaRef.current;
    if (field) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(0, field.value.length);
      return true;
    }
    const span = textRef.current;
    if (!span || typeof window.getSelection !== 'function') return false;
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, []);

  const copy = React.useCallback(async () => {
    const markCopied = () => {
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => setCopied(false),
        COPIED_FEEDBACK_MS,
      );
      toast.success(toastLabel);
    };

    if (await copyText(value)) {
      markCopied();
      return;
    }

    // Rung three: leave the value selected under the admin's own finger, and
    // say so.
    const selected = selectValue();
    toast.info(
      selected
        ? 'This device would not let the app use the clipboard. The value is selected — long-press it and choose Copy.'
        : 'This device would not let the app use the clipboard. Select the value and copy it by hand.',
      { duration: 8000 },
    );
  }, [value, selectValue, toast, toastLabel]);

  const glyph = copied ? (
    <Check width={15} height={15} strokeWidth={1.75} className="text-success" />
  ) : (
    <Copy width={15} height={15} strokeWidth={1.75} />
  );

  const copyButton = (variant: 'secondary' | 'ghost', extra?: string) => (
    <IconButton
      aria-label={copied ? 'Copied' : 'Copy'}
      variant={variant}
      size="sm"
      className={extra}
      onClick={() => void copy()}
    >
      {glyph}
    </IconButton>
  );

  if (mode === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        {label != null ? (
          <span className="text-text-muted">{label}</span>
        ) : null}
        <span
          ref={textRef}
          // `break-all`, not `truncate`: this is an identifier, and half of one
          // is worse than a wrapped one. `select-text` and not `.selectable`:
          // the shell's contextmenu allow-list is matched by class NAME, so
          // only this exact class gets the long-press callout back — without it
          // the component's own last-resort message ("long-press it and choose
          // Copy") is advice the platform will not honour. Carried here so no
          // caller has to remember it.
          className={cn(
            'select-text min-w-0 break-all',
            mono && 'font-mono text-[0.95em]',
          )}
        >
          {value}
        </span>
        {/* `-my-2` below md: the button is a 44px flex item, and a flex item's
            margin box is what sets the row height — without it a copyable id
            inside a sentence made that line of prose 44px tall. The hit area
            stays 44px; only the space it claims shrinks. */}
        {copyButton('ghost', '-my-2 md:my-0')}
      </span>
    );
  }

  return (
    <div className={cn('grid gap-1', className)}>
      {label != null ? (
        <span className="text-xs font-medium text-text-muted">{label}</span>
      ) : null}
      {/* `items-start` below md: the field can be three lines tall there, and
          the copy button belongs beside its first line, not its middle. */}
      <div className="flex items-start gap-1.5 md:items-center">
        {/* min-w-0 on the wrapper, not the field: an <input>'s min-content
            width comes from its `size` attribute (20 characters by default), so
            `min-width: auto` on the flex item refused to shrink below ~180px
            and pushed the copy button off a 296px card. */}
        <div className="min-w-0 flex-1">
          {isMd ? (
            <Input
              ref={inputRef}
              readOnly
              value={value}
              // Selecting on focus means one tap puts the whole value under the
              // long-press menu even if the copy button is never touched.
              onFocus={(e) => e.currentTarget.select()}
              className={cn(mono && 'font-mono')}
            />
          ) : (
            <WrappingField ref={areaRef} value={value} mono={mono} />
          )}
        </div>
        {copyButton('secondary')}
      </div>
    </div>
  );
}

/**
 * The below-md shape of `mode="field"`: a read-only textarea one row tall that
 * grows to show the whole value, wrapping anywhere (`break-all` — this is an
 * identifier, a password, an email, and none of them has a sensible word
 * break). Sized to the same 44px box as `Input` for a value that fits one line.
 * `field-sizing: content` would do the growing in CSS, but not on every WebView
 * this runs in, so the height is set from `scrollHeight` and re-set when the
 * width changes (rotation, or the sheet it sits in resizing).
 */
const WrappingField = React.forwardRef<
  HTMLTextAreaElement,
  { value: string; mono?: boolean }
>(function WrappingField({ value, mono }, forwardedRef) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLTextAreaElement);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const fit = () => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      el.style.height = 'auto';
      // `scrollHeight` leaves the borders out and the box is border-box.
      el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  return (
    <textarea
      ref={ref}
      readOnly
      rows={1}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        'block w-full min-w-0 resize-none overflow-hidden rounded-sm border border-border-strong bg-surface',
        'px-3 py-[9px] text-base leading-6 text-text break-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        mono && 'font-mono',
      )}
    />
  );
});
