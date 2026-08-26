import * as React from 'react';

import { cn } from '@/lib/cn';

import { BUTTON_VARIANTS, type ButtonSize, type ButtonVariant } from './Button';
import { Spinner } from './Spinner';

/**
 * A button whose whole content is one glyph.
 *
 * WHY THIS IS NOT `Button size="sm"`
 * ----------------------------------
 * `Button`'s sizes floor the HEIGHT at 44px below md (`min-h-11 md:min-h-0`)
 * and say nothing about width, because a button with a word in it is always
 * wide enough. Put a 16px icon in one and the `px-3` padding gives 16 + 24 =
 * 40px — a 40×44 target that reads as square and misses the 44px floor on the
 * axis a thumb actually travels along. Every icon-only control in the app was
 * built that way or smaller: the Toast dismiss was 22×22, the remove-photo X
 * 30×30, the composer's icons 20-22px.
 *
 * So this renders a real square and restores the old desktop density at md:
 * `sm` lands on 32px and `md` on 36px at ≥ md, matching `Button`'s own `h-8`
 * and `h-9` so an icon button sitting in a row of text buttons lines up, and
 * `xs` lands on 24px for an inline glyph that was never chrome-sized.
 *
 * `aria-label` is required by the type, not merely encouraged. An icon-only
 * button has no accessible name at all without one — it is announced as
 * "button", which is the same as unlabelled.
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: the icon carries no text, so this is the button's only name. */
  'aria-label': string;
  /** The icon. */
  children: React.ReactNode;
  /** Defaults to `ghost`: nearly every icon-only control here is chrome — a
   *  close, a kebab, a dismiss — and a filled square would out-shout the row
   *  it sits in. Ask for `danger` or `primary` when the glyph IS the action. */
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

/** `xs` exists for an inline glyph whose desktop paint is deliberately tiny —
 *  a cancel-reply X in a quote strip, a remove-file X on a chip, an upload
 *  glyph in a card header. Those were 16-23px squares built out of `p-1`, and
 *  converting them at `sm` grew them by ~10px on desktop, which is a visible
 *  change to chrome that was already right there. */
export type IconButtonSize = 'xs' | ButtonSize;

// 44px below md on both axes; ≥ md returns to the square the surrounding
// desktop chrome was already drawing.
const SIZES: Record<IconButtonSize, string> = {
  xs: 'h-11 w-11 md:h-6 md:w-6',
  sm: 'h-11 w-11 md:h-8 md:w-8',
  md: 'h-11 w-11 md:h-9 md:w-9',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      className,
      variant = 'ghost',
      size = 'md',
      loading = false,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          // `shrink-0` because the usual home for one of these is the right end
          // of a flex row whose left end is a title that wants all the width;
          // without it the square becomes a sliver on a long title.
          'inline-flex shrink-0 items-center justify-center rounded-md p-0',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          BUTTON_VARIANTS[variant],
          SIZES[size],
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <Spinner size={size === 'md' ? 16 : size === 'sm' ? 14 : 12} />
        ) : children}
      </button>
    );
  },
);
