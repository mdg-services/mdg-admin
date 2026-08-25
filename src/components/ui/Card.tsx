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

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The right-hand slot — a button, a filter, a count. Full width on its own
   *  line below md, back on the right at md+. Pass it here rather than as a
   *  second child: as a child it is just another item in a `justify-between`
   *  row that cannot wrap, and a `whitespace-nowrap` Button in a 296px card
   *  then squeezes the title to nothing or runs off the edge. */
  action?: React.ReactNode;
}

/**
 * With no `action`, the emitted classes are exactly what they have always been,
 * so the seven call sites that pass an 18px icon as their second child are
 * untouched.
 */
export function CardHeader({
  className,
  action,
  children,
  ...rest
}: CardHeaderProps) {
  if (action === undefined) {
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
  return (
    <div
      className={cn(
        'flex flex-col items-stretch gap-2 border-b border-border px-4 py-3',
        'md:flex-row md:items-start md:justify-between md:gap-3',
        className,
      )}
      {...rest}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="shrink-0 [&>button]:w-full md:[&>button]:w-auto">
        {action}
      </div>
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
