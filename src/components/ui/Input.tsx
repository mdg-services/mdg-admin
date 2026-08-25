import * as React from 'react';

import { cn } from '@/lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * A single-line text field.
 *
 * `text-base md:text-sm` is not a style choice: iOS zooms the page in when a
 * field smaller than 16px takes focus, and this app ships
 * `maximum-scale=1.0`, so there is no pinch to get back out — the admin is
 * left on a magnified screen with the rest of the form off to one side. The
 * 16px floor in index.css cannot do it alone, because a Tailwind `.text-sm`
 * out-specifies an element selector. At `md` the old 14px is restored, so
 * desktop is unchanged.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 md:h-9 w-full rounded-sm border bg-surface px-3 text-base md:text-sm text-text',
          'placeholder:text-text-subtle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          invalid ? 'border-danger' : 'border-border-strong',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      />
    );
  },
);
