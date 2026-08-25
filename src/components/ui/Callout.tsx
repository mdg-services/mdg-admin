import { AlertTriangle, Info } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * An inline caveat about the data on screen — a truncated result set, a
 * dependency that failed to load, a figure that is an estimate.
 *
 * Distinct from `Toast` (transient, about an action you just took) and from
 * `EmptyState` (there is nothing to show at all): this one sits above content
 * that IS shown and qualifies it. The admin had five hand-rolled versions of
 * this shape before; the tokens here are the ones those already use, so a new
 * caution reads at the same weight as an old one.
 */

const INTENTS = {
  warning: {
    className: 'border-warning bg-warning-soft text-warning',
    Icon: AlertTriangle,
  },
  info: {
    className: 'border-info bg-info-soft text-info',
    Icon: Info,
  },
} as const;

export interface CalloutProps {
  intent?: keyof typeof INTENTS;
  /** Renders a Retry affordance inline at the end of the message. */
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Callout({
  intent = 'warning',
  onRetry,
  children,
  className,
}: CalloutProps) {
  const { className: intentClass, Icon } = INTENTS[intent];
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 rounded-md border px-3 py-2 text-xs',
        intentClass,
        className,
      )}
    >
      <Icon width={14} height={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
      <span className="min-w-0">
        {children}
        {onRetry ? (
          // This is the recovery control when a dependency fails, and it was a
          // ~34×16px word inside a sentence. It cannot simply grow: at 44px it
          // would no longer read as part of the sentence it sits in. So
          // `.tap-target` gives it a 44px halo without repainting it, and the
          // negative margin below md keeps the taller inline box from pushing
          // the callout's two lines apart. Both revert at md.
          <button
            type="button"
            onClick={onRetry}
            className="tap-target -my-2 ml-1 inline-flex min-h-11 items-center rounded-sm px-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:my-0 md:min-h-0 md:px-0"
          >
            Retry
          </button>
        ) : null}
      </span>
    </div>
  );
}
