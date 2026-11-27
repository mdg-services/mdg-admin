import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * Two to four mutually exclusive modes, shown all at once.
 *
 * This is the shape the Credit & DOD tab hand-rolled as `ModeTab` to choose
 * between "today's report" and "a back-dated one" — a 32px-tall pill that gates
 * the whole back-dated generation flow behind a target a thumb cannot reliably
 * hit. Rather than fix that one, this is the form, so the next screen that
 * needs a mode switch does not roll a fifth version of it.
 *
 * `aria-pressed` rather than `role="tablist"`: these buttons change what the
 * surrounding form DOES, they do not swap panels of content. A tablist promises
 * arrow-key navigation between panels and a screen reader announces it that
 * way; a pressed-state toggle group is the honest description.
 *
 * Below md each segment is 44px tall and the group fills its container, because
 * a control that changes what a screen produces should not be a 60px pill in
 * the corner of a phone. At md it collapses back to the compact 32px row.
 */
export interface SegmentedOption<V extends string> {
  value: V;
  label: React.ReactNode;
  /** Leading glyph. Optional, but keep it all-or-nothing across one group. */
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  options: SegmentedOption<V>[];
  /** Fill the row below md. Default true. At md the group is always content-sized. */
  fullWidthOnMobile?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function SegmentedControl<V extends string>({
  value,
  onChange,
  options,
  fullWidthOnMobile = true,
  className,
  ...rest
}: SegmentedControlProps<V>) {
  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex gap-0.5 rounded-md border border-border-strong p-0.5',
        // `w-full` below md, `w-fit` at md. `w-fit` rather than leaving it to
        // `inline-flex`: inside a grid the group's border stretched to whatever
        // the widest sibling row made the column, which is the same trap
        // DateRangeFilter's chip group documents.
        fullWidthOnMobile ? 'w-full md:w-fit' : 'w-fit',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-3 py-1.5',
              'text-sm transition-colors md:min-h-8 md:flex-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              active
                ? 'bg-brand font-semibold text-text-inverse'
                : 'font-medium text-text-muted hover:text-text',
            )}
          >
            {o.icon ? <span className="shrink-0">{o.icon}</span> : null}
            {/* min-w-0 + truncate: a two-word mode label in a 360px group of
                three is ~90px, and a nowrap label would push the group past the
                card and be clipped by `main`'s overflow-x-hidden. */}
            <span className="min-w-0 truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
