import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

type Lines = 2 | 3 | 4 | 5;

/** Written out because Tailwind reads the source as text: a template literal
 *  `line-clamp-${n}` produces no class at all. */
const LINE_CLAMP: Record<Lines, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
};

export interface ClampedTextProps {
  children: React.ReactNode;
  /** How many lines survive below md. Two by default. */
  lines?: Lines;
  /** Classes for the paragraph itself — `text-sm text-text-muted` and friends.
   *  Do not pass a `line-clamp-*`: this owns the clamp and toggles it. */
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}

/**
 * A paragraph that gives the rest of itself back.
 *
 * A bare `line-clamp-2` saves vertical space by DELETING meaning, and the half
 * it deletes is the half that qualifies the first: "A task is certified by an
 * MDG admin —" is not a shorter way of saying "…never by the dealer", it is the
 * opposite reading of the same sentence. Shortening the copy is fine; cutting
 * the clause that carries the point, with no way to reveal it, is not. So the
 * clamp comes with a toggle.
 *
 * Two details that are easy to get wrong:
 *  - The toggle is shown ONLY when the text actually overflows, which has to be
 *    MEASURED (`scrollHeight` vs `clientHeight` while clamped) — a permanent
 *    "more" on a string that already fits is noise, and the operator learns to
 *    ignore it on the one card where it means something.
 *  - Above md nothing is clamped and no toggle exists, so a desktop page renders
 *    exactly the paragraph it renders today. The branch is picked in JS rather
 *    than with `md:line-clamp-none`, because the measurement is only meaningful
 *    on the width that actually clamps.
 *
 * The toggle is a SIBLING of the paragraph, not a child of it — a `-webkit-box`
 * cannot hold a button without the clamp counting it as text — so drop this into
 * a block or `flex-col` parent, and expect it to add a 44px row when (and only
 * when) there is something to reveal.
 *
 * @example
 * <ClampedText className="mt-1 text-sm text-text-muted">
 *   {service.description}
 * </ClampedText>
 */
export function ClampedText({
  children,
  lines = 2,
  className,
  moreLabel = 'more',
  lessLabel = 'less',
}: ClampedTextProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  const ref = React.useRef<HTMLParagraphElement | null>(null);
  const id = React.useId();

  const clamped = !isMd && !expanded;

  React.useLayoutEffect(() => {
    const el = ref.current;
    // Only a clamped paragraph has anything to measure: once it is expanded
    // `scrollHeight === clientHeight` again, and reading it there would retract
    // the "less" that is the only way back.
    if (!el || !clamped) return;
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // Rotation and the sheet/drawer it may sit in both change the width, and
    // the same string clamps at one width and fits at the next.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamped, lines, children]);

  return (
    <>
      <p id={id} ref={ref} className={cn(clamped && LINE_CLAMP[lines], className)}>
        {children}
      </p>
      {!isMd && overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={id}
          // A 44px row of its own. The reveal is worth more than the ~24px it
          // costs: the alternative is a sentence the operator cannot finish.
          //
          // `tap-target` rather than a `min-w-11`: the word is four characters
          // wide, so the painted box is 34px and padding it out to 44 would put
          // a visibly floating label under the paragraph it belongs to. The
          // halo grows the HIT area by 12px a side and paints nothing, which is
          // exactly the case it exists for.
          className="tap-target inline-flex min-h-11 items-center text-sm font-medium text-brand md:hidden"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </>
  );
}
