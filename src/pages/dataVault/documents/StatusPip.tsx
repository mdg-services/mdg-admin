import type * as React from 'react';

import { cn } from '@/lib/cn';
import { documentAskMark, type DocumentAskEstateStatus, type DocumentAskMark } from '@dk/shared';

import { MARK_LEGEND, STATUS_WORD } from './format';

/**
 * WHOSE MOVE IS IT — drawn so that colour is never the only thing saying so.
 *
 * This mark is the point of the whole screen. Nothing in this product today
 * separates MDG's own backlog from the dealer's, and without that separation a
 * list of forty outstanding papers reads as "chase forty dealers" when thirty of
 * them are sitting in our own review queue. So the two never share a colour, and
 * — the part that is easy to skip — they never share a SHAPE either:
 *
 *   ●  filled amber disc   the dealer's turn
 *   ○  hollow slate ring   MDG's turn
 *   ✓  green tick          we have it
 *   ✕  slate cross         closed, and nothing came
 *   —  dashed grey rule    not on this service
 *
 * Shape carries it because colour cannot be relied on: roughly one man in twelve
 * cannot separate the amber from the green, this screen is read on a phone in
 * daylight on a forecourt, and the first thing anybody does with a list like this
 * is screenshot it into a chat, where it may be looked at in a dark theme or
 * printed in black and white. A hollow ring against a filled disc survives all of
 * that; two shades of the same round dot survive none of it.
 *
 * Drawn as an inline SVG rather than as a text glyph on purpose. `●` and `○`
 * render at wildly different weights across the fonts an Android WebView falls
 * back to, and `✓` is missing outright from some of them — which would leave the
 * one distinction this screen exists to draw depending on a font that may not be
 * installed.
 */

/** Geometry and colour for one mark. `stroke`/`fill` are Tailwind text colours. */
const MARKS: Record<DocumentAskMark, { className: string; glyph: React.ReactElement }> = {
  THEM: {
    className: 'text-warning',
    glyph: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  },
  US: {
    // Hollow, and that is a decision rather than a style: MDG's own backlog must
    // not read as an alarm about the dealer. An outline says "on the list", a
    // filled disc says "somebody is late".
    className: 'text-neutral',
    glyph: <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  },
  HAVE: {
    className: 'text-success',
    glyph: (
      <path
        d="M1.6 5.2 4 7.6 8.6 2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  CLOSED: {
    className: 'text-text-subtle',
    glyph: (
      <path
        d="M2 2 8 8 M8 2 2 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  NOT_APPLICABLE: {
    className: 'text-text-subtle',
    glyph: (
      <path
        d="M1 5h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2.4 2"
        strokeLinecap="round"
      />
    ),
  },
};

/**
 * One entry of {@link MARKS}, without letting `noUncheckedIndexedAccess` widen
 * a total `Record` over a closed union to `| undefined`.
 *
 * The fallback is `NOT_APPLICABLE` and not `THEM`, and that choice matters: a
 * mark that could not be resolved must draw a dash and claim nothing, rather
 * than assert that a dealer is being waited on. This screen's whole job is
 * saying whose turn it is, so its failure mode has to be silence.
 */
function markSpec(mark: DocumentAskMark) {
  return MARKS[mark] ?? MARKS.NOT_APPLICABLE;
}

/** The 10×10 mark on its own. `aria-hidden` — the row's words carry the meaning. */
export function MarkGlyph({ mark, className }: { mark: DocumentAskMark; className?: string }) {
  const spec = markSpec(mark);
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      aria-hidden
      className={cn('shrink-0', spec.className, className)}
    >
      {spec.glyph}
    </svg>
  );
}

/**
 * The status cell: the mark, the word, and — when there is one — how late it is.
 *
 * The word is not optional and never has been. A mark on its own would be a
 * legend lookup for every row, and the legend is at the bottom of a list an admin
 * scrolls; the words are what make the row readable on its own, and the mark is
 * what makes a screenful of them scannable at a glance.
 */
export function StatusPip({
  status,
  late,
  className,
}: {
  status: DocumentAskEstateStatus;
  late: boolean;
  className?: string;
}) {
  const mark = documentAskMark(status);
  return (
    <span className={cn('inline-flex min-h-[22px] items-center gap-1.5 text-xs', className)}>
      <MarkGlyph mark={mark} />
      {/* `break-words`, not `truncate`: two of these words run to nineteen
          characters and the column is ~110px on a 360px screen, where a truncated
          "Not on this ser…" and "Not sent" look like the same row at a glance. */}
      <span className="min-w-0 break-words font-medium text-text">{STATUS_WORD[status]}</span>
      {late ? (
        // Only ever on a row that is the dealer's turn — the backend's `isLate`
        // requires it — so this is never MDG's own lateness dressed up as theirs.
        <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger">
          Overdue
        </span>
      ) : null}
    </span>
  );
}

/**
 * The legend.
 *
 * Always rendered, never behind a toggle. Five marks is more than anybody holds
 * in their head on a screen they open once a week, and a legend that has to be
 * opened is a legend nobody reads.
 */
export function MarkLegend({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-subtle',
        className,
      )}
    >
      {MARK_LEGEND.map((entry) => (
        <li key={entry.mark} className="flex items-center gap-1.5">
          <MarkGlyph mark={entry.mark} />
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
