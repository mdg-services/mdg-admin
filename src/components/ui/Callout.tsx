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
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 rounded-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Retry
          </button>
        ) : null}
      </span>
    </div>
  );
}
