import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * A checkbox and its label as one tap target.
 *
 * The app had eight raw `<input type="checkbox">` boxes in ~20px rows, and
 * several of them are the primary decision of their screen: whether a bank
 * holiday pushes the Credit & DOD due date, whether a work item stays active,
 * the safety gate in front of a tank/nozzle/product identity change. A browser
 * default box is about 13px and the browser gives it no hit padding — the label
 * beside it was plain text, so the only thing to aim at was the box itself.
 *
 * Two things make that safe here. The whole `<label>` is the control (a label
 * with a nested input forwards its clicks), so the row is the target rather
 * than the box; and `min-h-11` below md gives that row 44px. Both the box and
 * the row return to their old size at md, so a desktop form is unchanged.
 *
 * The ref is forwarded because every call site reaches this through
 * react-hook-form's `{...register('active')}`, and `register` returns a `ref`.
 * A component that silently drops it registers a field that never reads back.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode;
  /** A second, quieter line under the label. Explains what ticking it does. */
  hint?: React.ReactNode;
  /**
   * Where the box sits against a label that runs to more than one line.
   * `'center'` (default) is right for a one-line label; `'start'` lines the box
   * up with the first line of a two-line warning.
   *
   * It is a prop and not a `labelClassName` because it cannot be one: `cn` is
   * clsx, and Tailwind emits `.items-start` before `.items-center`, so a
   * call-site `items-start` lands in the class list and then silently loses.
   * Two packets hit exactly that and gave up on the alignment.
   */
  align?: 'center' | 'start';
  /** Classes for the `<label>` wrapper. `className` goes on the input. */
  labelClassName?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, hint, align = 'center', labelClassName, className, ...rest },
    ref,
  ) {
    return (
      <label
        className={cn(
          'flex min-h-11 gap-2 text-sm text-text md:min-h-0',
          align === 'start' ? 'items-start' : 'items-center',
          rest.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          labelClassName,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            // The box grows to 20px below md and returns to 16px at md. It is
            // not the hit target — the row is — but a 13px box next to 14px
            // text also reads as decoration rather than as a control.
            'h-5 w-5 shrink-0 rounded border-border-strong accent-brand md:h-4 md:w-4',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            // Top-aligned: below md the 20px box already matches the 20px line
            // box of `text-sm`, so only the 16px desktop box needs nudging.
            align === 'start' && 'md:mt-0.5',
            className,
          )}
          {...rest}
        />
        {label != null || hint != null ? (
          // min-w-0 so a long hint wraps inside the row instead of pushing the
          // row wider than the card it sits in.
          <span className="min-w-0 flex-1">
            {label != null ? <span className="block">{label}</span> : null}
            {hint != null ? (
              <span className="mt-0.5 block text-xs text-text-subtle">
                {hint}
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
    );
  },
);
