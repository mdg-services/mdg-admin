import * as React from 'react';

import { cn } from '@/lib/cn';

import { ActionRow } from './ActionRow';

export interface MobileCardKv {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Right-aligned tabular figures, so a column of numbers still lines up. */
  numeric?: boolean;
}

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
  /** How those actions lay out below md. Omit and they are laid out by the
   *  caller, as they always have been. `'wrap'` puts two short actions on one
   *  44px line instead of two full-width rows — a work item whose buttons stack
   *  costs ~200px of a 740px screen, so three items fill the phone. `'stack'`
   *  is the deliberate full-width column for a single primary action. Either
   *  value means the caller drops its own `w-full` classes. */
  actionsLayout?: 'stack' | 'wrap';
  /** A stacked label/value block under `secondary`. This is what lets a six- to
   *  ten-column table have a phone form at all: the columns that do not fit the
   *  primary/secondary/meta slots land here instead of being dropped. */
  kv?: MobileCardKv[];
  /** `'clamp'` swaps the hard `shrink-0` for `min-w-0 max-w-[45%]`, so a right
   *  rail carrying two or three badges wraps instead of squeezing `primary`
   *  down to nothing. */
  primaryRightWidth?: 'auto' | 'clamp';
  /** `'muted'` dims the whole card — the phone counterpart of the `opacity-60`
   *  the desktop table already puts on a disabled / not-counted row. */
  tone?: 'default' | 'muted';
}

export interface MobileCardListProps {
  cards: MobileCard[];
  className?: string;
  /** `'below-md'` (default) keeps the historical `md:hidden`: the list is the
   *  phone half of a `<Table>` / card-stack pair. `'all'` renders at every
   *  width — for a stack inside a narrow container (a drawer, a dealer tab
   *  column) or one whose breakpoint has already been decided in JS, as
   *  `DataList` does. It is a prop and not a class because `cn` is plain clsx:
   *  a `md:block` passed through `className` would not remove `md:hidden`. */
  visibility?: 'below-md' | 'all';
  /**
   * The row's own surface.
   *
   * `'cards'` (default) is the historic look: each row is a rounded, bordered
   * card floating on the page background with a gap between it and the next.
   * That is right when the list IS the page.
   *
   * `'rows'` drops the border, the rounding and the gap and separates rows with
   * a hairline instead — for a list that fills a `<Card>` whose `CardContent`
   * has `padding="none"`. Use it there and nowhere else: a border inside a
   * border reads as a box in a box, and on a 360px screen the two of them plus
   * the page gutter push the row's text 59px in from the edge. Rows are flush,
   * so the same text starts at 24px and every row is ~24px shorter.
   */
  variant?: 'cards' | 'rows';
  /**
   * The padding inside each row. `'default'` is `p-3`. `'compact'` trims the
   * vertical padding only, for a long list where the extra 8px a row is a whole
   * row's worth of screen every six of them. The 44px tap floor is untouched —
   * `min-h-11` still sets the row's minimum height, so density comes out of the
   * whitespace and never out of the target.
   */
  padding?: 'default' | 'compact';
}

/**
 * The mobile card-stack counterpart to a desktop `<Table>` (§4/§5.2). Render a
 * `<Table>` inside `hidden md:block` and this list alongside — it is `md:hidden`
 * by default so only one shows per breakpoint. Cards with an `onClick` are a
 * single tap target; cards with `actions` render buttons instead (never nest
 * buttons).
 *
 * Every text slot wraps. `min-w-0` lets the *box* shrink, but nothing was
 * telling the *text* it may break, and 22 call sites pass raw strings —
 * addresses, S3 keys, 24-character ObjectIds, camera filenames. An unbroken
 * string overflowed the card and was then silently clipped by `main`'s
 * `overflow-x-hidden`, which is to say: gone, with no sideways scroll to
 * recover it. A caller who deliberately wants one line still wins by putting
 * `truncate` on their own child element.
 */
export function MobileCardList({
  cards,
  className,
  visibility = 'below-md',
  variant = 'cards',
  padding = 'default',
}: MobileCardListProps) {
  const rows = variant === 'rows';
  const pad = padding === 'compact' ? 'px-3 py-2' : 'p-3';
  return (
    <ul
      className={cn(
        rows ? 'divide-y divide-border' : 'grid gap-2',
        visibility === 'below-md' && 'md:hidden',
        className,
      )}
    >
      {cards.map((c) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 break-words">{c.primary}</div>
              {c.primaryRight != null ? (
                <div
                  className={
                    c.primaryRightWidth === 'clamp'
                      ? 'flex min-w-0 max-w-[45%] flex-wrap justify-end gap-1'
                      : 'shrink-0'
                  }
                >
                  {c.primaryRight}
                </div>
              ) : null}
            </div>
            {c.secondary != null ? (
              <div className="mt-1 min-w-0 break-words text-sm text-text-muted">
                {c.secondary}
              </div>
            ) : null}
            {c.kv && c.kv.length > 0 ? (
              <dl className="mt-2 grid gap-1 text-sm">
                {c.kv.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="min-w-0 shrink text-text-muted">
                      {row.label}
                    </dt>
                    <dd
                      className={cn(
                        'min-w-0 break-words text-right font-medium text-text',
                        row.numeric && 'tabular-nums',
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {c.meta != null ? (
              <div className="mt-1 min-w-0 break-words text-xs text-text-subtle">
                {c.meta}
              </div>
            ) : null}
            {/* `actions` is dropped, not rendered, when the card is itself a
                tap target. A button inside a button is invalid HTML and on
                Android the inner one is unreachable, so the rule is enforced
                here rather than left to every caller to remember. */}
            {c.actions != null && !c.onClick ? (
              c.actionsLayout ? (
                <ActionRow
                  below={c.actionsLayout}
                  align="start"
                  className="mt-3"
                >
                  {c.actions}
                </ActionRow>
              ) : (
                <div className="mt-3">{c.actions}</div>
              )
            ) : null}
          </>
        );
        return (
          <li key={c.key} className={cn(c.tone === 'muted' && 'opacity-60')}>
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                className={cn(
                  'block min-h-11 w-full text-left hover:bg-surface-2/60',
                  pad,
                  rows
                    ? 'bg-transparent'
                    : 'rounded-lg border border-border bg-surface',
                )}
              >
                {inner}
              </button>
            ) : (
              <div
                className={cn(
                  pad,
                  rows
                    ? 'bg-transparent'
                    : 'rounded-lg border border-border bg-surface',
                )}
              >
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
