import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { dealerCodeLabel } from '@dk/shared';

/**
 * A dealer, rendered the one way a dealer is ever identified here: by CODE.
 *
 * A dealer IS its code in this product ("15E"). Screens that print the tail of
 * an ObjectId — Run History printed `dealerId.slice(-6)` — identify nothing:
 * those six hex characters match no label on any other screen, cannot be
 * searched for, and cannot be read aloud down a phone.
 *
 * WHY IT IS A COMPONENT AND NOT SIX COPIES OF A `<Link>`
 *
 * The two places that already linked a dealer code disagreed about the URL, and
 * the ones that did not link left the reader to copy an id and paste it into a
 * filter box. One component means one URL and one visual weight.
 *
 * NESTING IS THE TRAP. This renders an `<a>`. An `<a>` inside a `<button>` is
 * invalid and simply never fires on Android, which is where this admin is
 * actually used. Any row that is itself a button must render the chip as a
 * SIBLING of that button, never inside it — pass `linkTo={false}` when there is
 * no way to avoid nesting, and the chip degrades to plain text rather than to a
 * dead control.
 */
export function DealerChip({
  dealerId,
  code,
  linkTo = true,
  tab,
  className,
}: {
  dealerId?: string | null;
  /** The dealer's code. `null` renders an em dash — never a guessed value. */
  code?: string | null;
  /** Set false inside a clickable row, where an anchor could not fire anyway. */
  linkTo?: boolean;
  /** Optional dealer-detail tab to open, e.g. `services`. */
  tab?: string;
  className?: string;
}) {
  // `dealerCodeLabel` gives an em dash for a missing code rather than an empty
  // gap or a fabricated placeholder, so "we don't know" stays visibly different
  // from "there isn't one".
  const label = dealerCodeLabel(code);
  const base = cn(
    'inline-flex items-center rounded border border-border-strong bg-surface-2 px-1.5',
    'font-mono text-xs font-medium tabular-nums text-text',
    className,
  );

  if (!linkTo || !dealerId || !code) {
    return <span className={base}>{label}</span>;
  }
  return (
    <Link
      to={`/dealers/${dealerId}${tab ? `?tab=${tab}` : ''}`}
      // Deliberately NOT `.tap-target`: its halo is `inset:-12px` on all four
      // sides, and this chip is routinely a sibling of another control (the run
      // row's own button), where the halo would sit over that neighbour's
      // padding and swallow taps meant for it. Vertical padding buys the height
      // instead, without reaching sideways into anything.
      className={cn(base, 'py-2 hover:bg-surface hover:underline')}
      aria-label={`Open outlet ${label}`}
    >
      {label}
    </Link>
  );
}
