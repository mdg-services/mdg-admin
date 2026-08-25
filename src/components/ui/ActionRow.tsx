import * as React from 'react';

import { cn } from '@/lib/cn';

type Below = 'stack' | 'wrap' | 'row';
type Align = 'start' | 'end' | 'between';

/**
 * `flex-col-reverse` is the whole trick of `stack`: the primary action stays
 * **last** in the DOM, where the tab order and the screen reader want it, and
 * comes out **first** on screen, where the thumb is.
 */
const BELOW: Record<Below, string> = {
  stack: 'flex flex-col-reverse items-stretch gap-2 md:flex-row md:items-center',
  wrap: 'flex flex-wrap items-center gap-2',
  row: 'flex items-center gap-2',
};

const ALIGN: Record<Align, { base: string; md: string }> = {
  start: { base: 'justify-start', md: 'md:justify-start' },
  end: { base: 'justify-end', md: 'md:justify-end' },
  between: { base: 'justify-between', md: 'md:justify-between' },
};

export interface ActionRowProps {
  children: React.ReactNode;
  /** `'stack'` (default): full-width buttons in a column below md, a
   *  right-aligned row at md+. `'wrap'`: stays a row and wraps — for three or
   *  more small secondary actions. `'row'`: never stacks, for short labels
   *  only. */
  below?: Below;
  align?: Align;
  className?: string;
}

/**
 * A row of buttons that survives a 360px screen.
 *
 * `Button` carries `whitespace-nowrap`, and the containers it usually sits in
 * force equal widths with no way to stack: two buttons labelled "Cancel" and
 * "Apply and regenerate" each got half of a 328px panel, and the longer label
 * then ran out of its own box and off the panel — clipped, because `main` is
 * `overflow-x-hidden`. Stacking is the only shape that always fits, so it is
 * the default below md; at md+ the classes restore the row that is there today.
 *
 * `justify-*` is applied at both widths for `wrap`/`row` and at md+ only for
 * `stack`, where a column of stretched items has nothing to justify.
 */
export function ActionRow({
  children,
  below = 'stack',
  align = 'end',
  className,
}: ActionRowProps) {
  const justify = ALIGN[align];
  return (
    <div
      className={cn(
        BELOW[below],
        below === 'stack' ? justify.md : cn(justify.base, justify.md),
        className,
      )}
    >
      {children}
    </div>
  );
}
