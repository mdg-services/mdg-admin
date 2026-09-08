import type * as React from 'react';

import { cn } from '@/lib/cn';
import { documentValidityLabel, type ExpiryState } from '@dk/shared';

import { validityKey, VALIDITY_CLASSES, VALIDITY_TEXT_CLASSES, VALIDITY_WORD } from './format';

/**
 * IS THIS PAPER STILL GOOD — drawn so that colour is never the only thing
 * saying so.
 *
 * The same rule `StatusPip` sets out for the whose-move-is-it mark, applied to
 * the second question these screens answer. Each verdict differs in SHAPE as
 * well as in colour:
 *
 *   ▲  filled red triangle    expired — it has run out
 *   ◗  half-filled amber disc  running out — inside the reminder window
 *   ✓  green tick              in force
 *   —  dashed grey rule        no date on file, so no verdict
 *
 * Shape carries it because colour cannot be relied on: roughly one man in twelve
 * cannot separate the amber from the green, this list is read on a phone in
 * daylight on a forecourt, and the first thing anybody does with it is screenshot
 * it into a chat where it may be viewed in a dark theme or printed in black and
 * white.
 *
 * Inline SVG rather than a text glyph, again for `StatusPip`'s reason: `▲` and
 * `✓` render at wildly different weights across the fonts an Android WebView
 * falls back to, and some of them are missing the tick outright.
 *
 * NO WHITE TEXT ON A TINT, ANYWHERE, AND NO 3:1 EITHER. The pill takes its
 * colours from `VALIDITY_CLASSES`, which pairs each soft background with the
 * matching `strong` shade: 6.37:1 for amber, 6.80:1 for red, 6.49:1 for green.
 * The portal's shared `INTENT_CLASSES` pairing measures 3.14:1 and 3.00:1 on the
 * first two, and the person reading this is 55, outdoors, under a canopy, on a
 * cheap screen. White on `warning.DEFAULT` would be 2.15:1 and appears nowhere.
 */

/** Geometry for one verdict. The colour rides on `currentColor` from the pill. */
const GLYPHS: Record<ExpiryState | 'undated', React.ReactElement> = {
  expired: (
    <path
      d="M5 0.8 9.4 8.6 H0.6 Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinejoin="round"
    />
  ),
  expiring: (
    // A disc with half of it filled: time half gone. Distinct from the tick and
    // from the triangle at a glance and at 10px.
    <>
      <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1.2 A3.8 3.8 0 0 1 5 8.8 Z" fill="currentColor" />
    </>
  ),
  valid: (
    <path
      d="M1.6 5.2 4 7.6 8.6 2.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  undated: (
    <path
      d="M1 5h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray="2.4 2"
      strokeLinecap="round"
    />
  ),
};

/** The 10×10 mark on its own. `aria-hidden` — the pill's words carry the meaning. */
export function ValidityGlyph({
  state,
  className,
}: {
  state: ExpiryState | undefined;
  className?: string;
}) {
  const key = validityKey(state);
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden className={cn('shrink-0', className)}>
      {GLYPHS[key]}
    </svg>
  );
}

/**
 * The verdict cell: the mark, the word, and — when there is one — how long is
 * left.
 *
 * The word is not optional. A mark alone would be a legend lookup on every row,
 * and this list is read once a week. `documentValidityLabel` supplies the count
 * ("8 days left", "Expired 3 days ago") because it is the ONE place that sentence
 * is written — the dealer's own notification is built from the same function, so
 * a screen and a push cannot come to describe one deadline two ways.
 */
export function ValidityPill({
  state,
  daysToExpiry,
  showDays = true,
  className,
}: {
  state: ExpiryState | undefined;
  daysToExpiry: number | null;
  /** Off for a narrow cell that prints the count in a column of its own. */
  showDays?: boolean;
  className?: string;
}) {
  const key = validityKey(state);
  const days = showDays && daysToExpiry !== null ? documentValidityLabel(daysToExpiry, 'en') : '';
  return (
    <span
      className={cn(
        // `h-auto` and wrapping rather than `Badge`'s fixed 22px: "Expired 12
        // days ago" is 19 characters and the column is ~120px on a 360px screen,
        // where a badge would clip its own label inside its own box.
        'inline-flex min-h-[22px] min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        VALIDITY_CLASSES[key],
        className,
      )}
    >
      <ValidityGlyph state={state} />
      <span className="min-w-0 break-words">
        {VALIDITY_WORD[key]}
        {days ? <span className="font-normal"> · {days}</span> : null}
      </span>
    </span>
  );
}

/**
 * The legend under a validity list.
 *
 * Always drawn, never behind a toggle — four marks is more than anybody holds in
 * their head on a screen they open once a week, and a legend that has to be
 * opened is a legend nobody reads. Same decision, same reason, as `MarkLegend`.
 */
export function ValidityLegend({ className }: { className?: string }) {
  const entries: ReadonlyArray<{ state: ExpiryState | undefined; text: string }> = [
    { state: 'expired', text: 'Expired — it has run out' },
    { state: 'expiring', text: 'Running out — inside the reminder window' },
    { state: 'valid', text: 'In force' },
    { state: undefined, text: 'No date on file, so no verdict' },
  ];
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-subtle',
        className,
      )}
    >
      {entries.map((entry) => (
        <li key={validityKey(entry.state)} className="flex items-center gap-1.5">
          <ValidityGlyph state={entry.state} className={VALIDITY_TEXT_CLASSES[validityKey(entry.state)]} />
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
