import * as React from 'react';

import { cn } from '@/lib/cn';

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface shadow-sm',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border px-4 py-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold text-text', className)}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardSubtitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-text-muted', className)} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-border px-4 py-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
