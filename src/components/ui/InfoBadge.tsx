import { Info } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { type Intent } from '@/lib/statusIntent';

import { Badge } from './Badge';
import { Sheet } from './Sheet';

/**
 * A status badge whose explanation is reachable by touch.
 *
 * Eleven badges in this app carry their real content in a `title` attribute and
 * nowhere else: what "Unreadable" means on a Credit & DOD report ("the portal
 * published this in a format we could not read — tell the MDG team"), the
 * amounts and dates behind Late-entries / Overdue / Credit-lock, why a Suspend
 * control is disabled ("you can't suspend your own account"). A `title` fires
 * on hover, and a phone has no hover. On those screens the badge is a bare word
 * with no route to its meaning at all.
 *
 * So: at md this renders today's `<Badge title={detail}>`, byte for byte. Below
 * md it is a real button carrying an info glyph — a visible second cue, because
 * `hover:` styling is invisible on touch — and a tap opens the shared bottom
 * `Sheet` with the full text. The badge itself stays the same size, which is
 * why it wears `.tap-target` rather than growing to 44px: a 44px pill would
 * swamp the row of a table it usually sits in.
 *
 * Pass `detail` as a plain string when you can. The desktop branch puts it in
 * `title`, which only takes text; a rich node still renders in the mobile
 * sheet, but ≥ md would lose the tooltip it has today.
 */
export interface InfoBadgeProps {
  intent?: Intent;
  label: React.ReactNode;
  /** The explanation. Never put this only in `title`. */
  detail: React.ReactNode;
  sheetTitle?: string;
  /**
   * Classes for the outer element — which is the `Badge` itself at md+ and the
   * wrapping `<button>` below md. Anything that sizes or tints the pill belongs
   * in `badgeClassName`, which always lands on the `Badge` at both widths.
   */
  className?: string;
  badgeClassName?: string;
}

/**
 * NOT LEGAL INSIDE A TAPPABLE ROW. Below md this renders a real `<button>`, so
 * dropping one into a `MobileCard` that has an `onClick`, or into a `DataList`
 * row with `onRowClick`, nests a button inside a button — invalid HTML, and on
 * Android the inner one simply never fires. Lift the badge out of the tap
 * target, as the Credit & DOD history card does.
 */
export function InfoBadge({
  intent = 'neutral',
  label,
  detail,
  sheetTitle,
  className,
  badgeClassName,
}: InfoBadgeProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);

  // Only a string can ride in `title`; anything richer is sheet-only content.
  const titleText = typeof detail === 'string' ? detail : undefined;

  if (isMd) {
    return (
      <Badge
        intent={intent}
        title={titleText}
        className={cn(className, badgeClassName)}
      >
        {label}
      </Badge>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // The halo is inset -12px, so keep 8px between two of these or the
        // wrong one takes the tap — see `.tap-target` in index.css.
        className={cn(
          'tap-target inline-flex max-w-full rounded-full align-middle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          className,
        )}
      >
        <Badge intent={intent} className={cn('gap-1', badgeClassName)}>
          <span className="min-w-0 truncate">{label}</span>
          <Info
            width={12}
            height={12}
            strokeWidth={2}
            aria-hidden
            className="shrink-0 opacity-70"
          />
        </Badge>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? (typeof label === 'string' ? label : 'Details')}
      >
        <div className="px-4 pb-3 pt-1 text-sm leading-relaxed text-text-muted">
          {detail}
        </div>
      </Sheet>
    </>
  );
}
