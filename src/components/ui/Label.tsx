import * as React from 'react';

import { cn } from '@/lib/cn';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  hint?: string;
}

export function Label({
  className,
  children,
  required,
  hint,
  ...rest
}: LabelProps) {
  return (
    <label
      className={cn(
        'block text-sm font-medium text-text mb-1',
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {required ? (
        <span aria-hidden className="ml-1 text-danger">
          *
        </span>
      ) : null}
      {hint ? (
        <span className="ml-2 text-xs text-text-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-danger" role="alert">
      {message}
    </p>
  );
}
