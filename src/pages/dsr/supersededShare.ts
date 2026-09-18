/**
 * How to describe a report the dealer holds an older copy of.
 *
 * Pure on purpose: this repo has no test runner, so anything that DECIDES
 * something lives here as a plain function rather than inside a component,
 * where it could only be checked by eye.
 *
 * The distinction this exists to draw: a regeneration after a share is usually
 * cosmetic — a re-render, a reworded warning — and the banner used to say the
 * same thing for that as for a correction that moved the dealer's stock
 * variation. 1E was sent a 2026-09-14 card reading HSD −8,043 L and OUT of the
 * permissible limit; an 8,000 L delivery landed on the previous day an hour
 * later and the true figure was −43 L, within limit. Nobody re-shared for three
 * days, because the banner gave no reason to hurry.
 */
import { formatLitres } from '@/lib/format';


/** One product's variation, before and after the regeneration. */
export interface SupersededChange {
  productKey: string;
  fromVariation: number;
  toVariation: number;
  wasWithinLimit: boolean;
  isWithinLimit: boolean;
}

export type SupersededSeverity = 'verdict-flipped' | 'figures-moved' | 'unchanged' | 'unknown';

/**
 * How badly the dealer's copy is out of date.
 *
 * `unknown` is for a report generated before the comparison existed — absence of
 * evidence, which must not be shown as "nothing changed".
 */
export function supersededSeverity(changed: SupersededChange[] | undefined): SupersededSeverity {
  if (changed === undefined) return 'unknown';
  if (changed.length === 0) return 'unchanged';
  return changed.some((c) => c.wasWithinLimit !== c.isWithinLimit) ? 'verdict-flipped' : 'figures-moved';
}

/** One line per product: what their copy says, and what it should say. */
export function describeChange(change: SupersededChange): string {
  const verdict = change.wasWithinLimit === change.isWithinLimit
    ? ''
    : change.wasWithinLimit
      ? ' — their copy says within limit, it is now OUT of limit'
      : ' — their copy says OUT of limit, it is now within limit';
  return `${change.productKey}: ${formatLitres(change.fromVariation)} → ${formatLitres(change.toVariation)}${verdict}`;
}

/** The headline, matched to how wrong the dealer's copy actually is. */
export function supersededHeadline(severity: SupersededSeverity): string {
  switch (severity) {
    case 'verdict-flipped':
      return 'The dealer is holding a report whose verdict has since changed';
    case 'figures-moved':
      return 'The dealer is holding a report whose figures have since changed';
    case 'unchanged':
      return 'The dealer has an older copy of this report, with the same figures';
    case 'unknown':
    default:
      return 'The dealer already has an older version of this report';
  }
}
