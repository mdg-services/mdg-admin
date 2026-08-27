import * as React from 'react';

import { cn } from '@/lib/cn';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * A native `<select>`. `text-base md:text-sm` for the same reason as `Input`:
 * below 16px, focusing it zooms an iPhone in and nothing zooms back out.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-11 md:h-9 w-full min-w-0 rounded-sm border bg-surface px-2 text-base md:text-sm text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          invalid ? 'border-danger' : 'border-border-strong',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
