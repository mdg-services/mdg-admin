import * as React from 'react';

import { cn } from '@/lib/cn';

import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

type Variant = ButtonVariant;
type Size = ButtonSize;

/**
 * The paint for each variant, exported because `IconButton` has to render the
 * identical surface from its own element. It cannot reach it by wrapping a
 * `Button` and passing `className`: `cn` is plain clsx, so `h-11 w-11 p-0`
 * would land *alongside* `h-8 px-3` rather than replacing it, and which one
 * wins would be decided by stylesheet order. Sharing the string is the only
 * way the two stay the same colour when one of them is retinted.
 */
export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-text-inverse hover:bg-brand-hover disabled:bg-brand/60',
  secondary:
    'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90',
};

// The `min-h-11` floor (44px) only wins below `md`; `md:min-h-8`/`md:min-h-9`
// restores the original desktop density so ≥ md looks identical to before.
const SIZES: Record<Size, string> = {
  sm: 'h-8 min-h-11 md:min-h-0 px-3 text-sm gap-1.5',
  md: 'h-9 min-h-11 md:min-h-0 px-4 text-sm gap-2',
};

/** Size classes with the horizontal padding taken back out. Written as separate
 *  strings rather than as an added `px-0`, because `.px-0` is emitted BEFORE
 *  `.px-3` and would silently lose — the trap three call sites already fell
 *  into, each shipping a `className="px-0"` that did nothing. */
const SIZES_NO_PADDING: Record<Size, string> = {
  sm: 'h-8 min-h-11 md:min-h-0 text-sm gap-1.5',
  md: 'h-9 min-h-11 md:min-h-0 text-sm gap-2',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** `'none'` drops the horizontal padding — for a `ghost` button that has to
   *  line up with the text above it, such as a "Show all N fields" disclosure. */
  padding?: 'default' | 'none';
  /** `'start'` left-aligns the content. A call-site `justify-start` happens to
   *  win today and a call-site `px-0` happens to lose; neither is a fact a call
   *  site should have to know, so both are props. */
  align?: 'center' | 'start';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      padding = 'default',
      align = 'center',
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
          'inline-flex items-center whitespace-nowrap rounded-md font-semibold',
          align === 'start' ? 'justify-start text-left' : 'justify-center',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          BUTTON_VARIANTS[variant],
          padding === 'none' ? SIZES_NO_PADDING[size] : SIZES[size],
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : leftIcon}
        <span>{children}</span>
        {!loading && rightIcon}
      </button>
    );
  },
);
