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
  /** How the title block lines up against `action` at md+. `'start'` (default)
   *  is today's header. Props, not `className`: `cn` is clsx and Tailwind emits
   *  `items-start` before `items-center`, so a call-site override only works by
   *  accident of stylesheet order — which is the trap this repo keeps hitting. */
  align?: 'start' | 'center';
  /** `'default'` is the header's own `py-3`. `'comfortable'` is `py-4`, which
   *  is what the hand-rolled `p-4` section headers this prop absorbed had. */
  padding?: 'default' | 'comfortable';
  /**
   * How wide the `action` button is below md. `'auto'` (default) lets it be as
   * wide as its label; `'full'` stretches it across the card.
   *
   * Full width used to be unconditional, so a header whose action reads "Add
   * task" drew a 328px x 44px bar under the title on every card that had one —
   * a button four times the size of its own text, on the screen with the least
   * room for it. Ask for `'full'` where the action really is the card's
   * primary control. From md up both settings are the auto-width button that
   * has always been there.
   */
  actionWidth?: 'auto' | 'full';
}

/**
 * With no `action`, `align` or `padding`, the emitted classes are exactly what
 * they have always been, so the seven call sites that pass an 18px icon as
 * their second child are untouched.
 */
export function CardHeader({
  className,
  action,
  align = 'start',
  padding = 'default',
  actionWidth = 'auto',
  children,
  ...rest
}: CardHeaderProps) {
  // Below md the gutter is 12px and a card usually sits inside another one, so
  // a 16px header inset is the third helping of the same padding. From md up
  // these resolve to the historic `px-4` + `py-3`/`py-4`.
  const pad =
    padding === 'comfortable' ? 'py-3 md:py-4' : 'py-2.5 md:py-3';
  if (action === undefined) {
    return (
      <div
        className={cn(
          'flex justify-between gap-3 border-b border-border px-3 md:px-4',
          pad,
          align === 'center' ? 'items-center' : 'items-start',
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
        'flex flex-col items-stretch gap-2 border-b border-border px-3 md:px-4',
        pad,
        'md:flex-row md:justify-between md:gap-3',
        align === 'center' ? 'md:items-center' : 'md:items-start',
        className,
      )}
      {...rest}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div
        className={cn(
          'shrink-0 md:[&>button]:w-auto',
          // An `action` that renders NOTHING must not cost the header a row.
          // This branch is chosen on `action !== undefined`, and a React element
          // is defined even when it returns null — which <HowThisWorks/> does on
          // every card whose video is not made yet. Without this the card takes
          // the two-column layout, and below md the `gap-2` on the parent puts
          // 8px under the title for an action slot nobody can see. `:empty`
          // catches it because a component returning null leaves no DOM node.
          'empty:hidden',
          actionWidth === 'full' && '[&>button]:w-full',
        )}
      >
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
      className={cn('text-base font-semibold text-text md:text-lg', className)}
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

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `'none'` removes the padding entirely — for a card whose whole body is a
   * list or a table that should run to the card's own edges.
   *
   * This is the fix for the stacked-surface problem the owner photographed on
   * the Dealers list: `main`'s gutter, then this padding, then a bordered row
   * card with padding of its own, put the dealer's code 59px from the left of a
   * 360px screen — a third of the width spent on margins before a character of
   * data. With `padding="none"` and rows that divide instead of float, the same
   * text starts at 24px.
   *
   * It is a prop and not a `className`, because `cn` is plain clsx: a `p-0`
   * passed in would land BESIDE `p-3` and lose on stylesheet order.
   */
  padding?: 'default' | 'tight' | 'none';
}

export function CardContent({
  className,
  padding = 'default',
  children,
  ...rest
}: CardContentProps) {
  return (
    <div
      className={cn(
        padding === 'none' ? '' : padding === 'tight' ? 'p-2 md:p-3' : 'p-3 md:p-4',
        className,
      )}
      {...rest}
    >
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
        'flex items-center justify-end gap-2 border-t border-border px-3 py-2.5 md:px-4 md:py-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
