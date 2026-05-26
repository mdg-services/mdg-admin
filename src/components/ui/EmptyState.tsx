import * as React from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-2 text-text-subtle" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}
