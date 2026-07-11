import * as React from 'react';

import { cn } from '@/lib/cn';

export interface MobileCard {
  key: string;
  /** Whole-card tap target. Omit for cards that carry their own action buttons. */
  onClick?: () => void;
  /** Left of the primary row (usually a bold, truncating title). */
  primary: React.ReactNode;
  /** Right of the primary row (status chip, role badge, points, timestamp). */
  primaryRight?: React.ReactNode;
  /** Secondary line, e.g. email / code · phone. */
  secondary?: React.ReactNode;
  /** Muted meta line (small). */
  meta?: React.ReactNode;
  /** Footer actions (buttons). Use only with a non-tappable card (no onClick). */
  actions?: React.ReactNode;
}

/**
 * The mobile card-stack counterpart to a desktop `<Table>` (§4/§5.2). Render a
 * `<Table>` inside `hidden md:block` and this list alongside — it is `md:hidden`
 * so only one shows per breakpoint. Cards with an `onClick` are a single tap
 * target; cards with `actions` render buttons instead (never nest buttons).
 */
export function MobileCardList({
  cards,
  className,
}: {
  cards: MobileCard[];
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-2 md:hidden', className)}>
      {cards.map((c) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{c.primary}</div>
              {c.primaryRight != null ? (
                <div className="shrink-0">{c.primaryRight}</div>
              ) : null}
            </div>
            {c.secondary != null ? (
              <div className="mt-1 min-w-0 text-sm text-text-muted">
                {c.secondary}
              </div>
            ) : null}
            {c.meta != null ? (
              <div className="mt-1 text-xs text-text-subtle">{c.meta}</div>
            ) : null}
            {c.actions != null ? <div className="mt-3">{c.actions}</div> : null}
          </>
        );
        return (
          <li key={c.key}>
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                className="block min-h-11 w-full rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-2/60"
              >
                {inner}
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-surface p-3">
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
