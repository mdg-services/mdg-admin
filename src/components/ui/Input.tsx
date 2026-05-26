import * as React from 'react';

import { cn } from '@/lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-sm border bg-surface px-3 text-sm text-text',
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
