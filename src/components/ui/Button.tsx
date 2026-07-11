import * as React from 'react';

import { cn } from '@/lib/cn';

import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
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
          'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          VARIANTS[variant],
          SIZES[size],
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
