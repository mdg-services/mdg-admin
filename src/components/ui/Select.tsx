import * as React from 'react';

import { cn } from '@/lib/cn';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded-sm border bg-surface px-2 text-sm text-text',
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
