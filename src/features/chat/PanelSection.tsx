import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * One section of the inbox's side panel: a 13px title row, then its body, with
 * a hairline between sections.
 *
 * FLAT, NOT A CARD. The panel used to be a column of `Card`s — each with its
 * own border, shadow, header rule and padding inside a white aside, frames
 * inside frames — and `CardTitle`'s `md:text-lg` beat the call sites'
 * `text-sm`, so "Triage" and "Dealer" printed at 18px, louder than the name of
 * the person being answered. Here the title is the quietest heading on the
 * screen and the content carries the weight.
 */
export function PanelSection({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  /** Right of the title: a count, a small button, a help glyph. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('border-b border-border px-4 py-4 last:border-b-0', className)}
    >
      <div className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
        <h3 id={id} className="text-[13px] font-semibold leading-5 text-text">
          {title}
        </h3>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
      <div className={cn('text-sm', bodyClassName)}>{children}</div>
    </section>
  );
}
