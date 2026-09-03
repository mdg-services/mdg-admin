import type { Intent } from '@/lib/statusIntent';
import {
  AI_HANDOFF_REASONS,
  AI_TURN_OUTCOMES,
  DEALER_FIRSTLINE_MODES,
  type AiHandoffReason,
  type AiTurnOutcome,
  type DealerFirstLineMode,
} from '@dk/shared';
import type { AiTurnListQuery } from '@dk/shared/schemas';

/**
 * The AI answers screen's own words and shapes — everything it needs that is not
 * React.
 *
 * WHERE THE DECIDABLE LOGIC ACTUALLY LIVES, AND WHY IT IS NOT HERE
 * ----------------------------------------------------------------
 * The chip rule, the outcome/reason/intent vocabulary, the age and the
 * withheld-answer rule are in `@dk/shared` (`lib/aiFirstLineView.ts`) and are
 * covered by `mdg-client/src/lib/aiFirstLineView.test.ts`. `mdg-admin` has no
 * `test` script and not one test file — checked, not assumed — and there is no
 * precedent anywhere in this repo for a test in one app importing a module out
 * of another by relative path. So the standing rule for this app was followed,
 * the same one `pages/dataVault/documents/format.ts` states: decidable logic
 * goes to `shared`, where the dealer app's vitest can reach it.
 *
 * What is left here is genuinely this screen's and nobody else's — the facet
 * list, the mapping from a facet to a query, and the three-rung shape of the
 * global switch. All three describe CONTROLS on this page rather than facts
 * about a turn: nothing else in the codebase has a "Prose refused" tab or a
 * ladder with a middle rung, and hoisting them would put this screen's chrome in
 * a package the dealer app imports. The outcome and reason COLOURS
 * are not here either: they are `AI_OUTCOME_TONE` and `aiReasonTone` in the same
 * shared module, because the strip above the inbox composer draws the same
 * badges, and this file briefly held a second copy that painted an answered turn
 * grey where the shared one painted it green. It stays free of JSX so it can be
 * read and diffed without a renderer.
 */

/* ─────────────────────────── The review facets ──────────────────────────── */

/**
 * The one question this screen exists to answer is "what has the machine said to
 * a dealer that nobody at MDG has looked at yet". Every other facet is a filter
 * on top of that, which is why `unreviewed` is first AND the default.
 */
export type AiReviewFacet =
  | 'unreviewed'
  | 'refused'
  | 'written'
  | 'wrong'
  | 'answered'
  | 'handed_off'
  | 'all';

export const REVIEW_FACETS: ReadonlyArray<{ value: AiReviewFacet; label: string }> = [
  { value: 'unreviewed', label: 'Unreviewed' },
  /**
   * SECOND, AND SECOND FOR A REASON. This is `?writer=fallback` — every reply
   * the fence refused — and it is the queue the fence is tuned from: the pair
   * "what it wanted to say" and "which rule stopped it" is the only evidence
   * that says whether a refusal was right, and it exists nowhere else. It is
   * also the evidence that the guard is doing anything at all, because a fence
   * with no visible refusals looks exactly like a fence that is switched off.
   */
  { value: 'refused', label: 'Prose refused' },
  { value: 'written', label: 'Written' },
  { value: 'wrong', label: 'Called wrong' },
  { value: 'answered', label: 'Answered' },
  { value: 'handed_off', label: 'Handed off' },
  { value: 'all', label: 'Everything' },
];

/** An unknown `?view=` opens the review queue rather than an empty screen. */
export function resolveReviewFacet(value: string | null): AiReviewFacet {
  const hit = REVIEW_FACETS.find((f) => f.value === value);
  return hit ? hit.value : 'unreviewed';
}

/** The half of the list query a facet decides. Merged over the explicit filters. */
export type AiReviewFacetQuery = Pick<
  AiTurnListQuery,
  'reviewed' | 'verdict' | 'outcome' | 'writer'
>;

/**
 * A facet as query parameters.
 *
 * `reviewed: false` is sent as the literal word `false`, not dropped. The server
 * refuses `z.coerce.boolean()` precisely because `Boolean('false')` is `true`,
 * and a "show me what nobody has checked" request that silently becomes "show me
 * everything" is the failure this whole screen is built to prevent.
 */
export function facetQuery(facet: AiReviewFacet): AiReviewFacetQuery {
  switch (facet) {
    case 'unreviewed':
      return { reviewed: false };
    case 'refused':
      return { writer: 'fallback' };
    case 'written':
      return { writer: 'prose' };
    case 'wrong':
      return { verdict: 'WRONG' };
    case 'answered':
      return { outcome: 'ANSWERED' };
    case 'handed_off':
      return { outcome: 'HANDED_OFF' };
    case 'all':
      return {};
    default: {
      const unhandled: never = facet;
      return unhandled;
    }
  }
}

/* ────────────────────── The three-position kill switch ──────────────────── */

/**
 * Where the global switch is standing, as ONE value.
 *
 * Two booleans on the wire — `enabled` and `writer` — but one control on the
 * screen, because as two toggles they can be read as four states and one of
 * those four (`enabled: false, writer: true`) means nothing at all. A ladder
 * cannot express a position that does not exist.
 */
export type AiSwitchPosition = 'off' | 'templates' | 'full';

/** OFF → TEMPLATES → FULL, in the order the ladder is walked. */
export const SWITCH_POSITIONS: readonly AiSwitchPosition[] = [
  'off',
  'templates',
  'full',
];

export const SWITCH_POSITION_LABEL: Record<AiSwitchPosition, string> = {
  off: 'Off',
  templates: 'Templates only',
  full: 'Full',
};

export const SWITCH_POSITION_HELP: Record<AiSwitchPosition, string> = {
  off: 'Every dealer’s tickets go straight to a person, exactly as they did before any of this shipped. Nothing is lost; the turn log stays.',
  templates:
    'It still answers, but only with the hand-written sentences — exactly the product that was live before the machine started writing its own. Nothing is degraded here; this is a known-good place to stand.',
  full: 'It writes the reply in the dealer’s own words from that turn’s facts, and falls back to the hand-written sentence whenever the checks refuse what it wrote.',
};

/**
 * The two booleans as one rung.
 *
 * `enabled: false` is `off` WHATEVER `writer` says, because with the service
 * stopped the writer flag decides nothing — and a screen that showed "Full" over
 * a stopped first line would be lying about the only thing it exists to report.
 */
export function switchPosition(
  live: { enabled: boolean; writer: boolean } | undefined | null,
): AiSwitchPosition {
  if (!live || !live.enabled) return 'off';
  return live.writer ? 'full' : 'templates';
}

/* ───────────────────────── The per-dealer switch ────────────────────────── */

export const MODE_INTENT: Record<DealerFirstLineMode, Intent> = {
  OFF: 'neutral',
  SHADOW: 'info',
  ON: 'success',
};

export const MODE_HELP: Record<DealerFirstLineMode, string> = {
  OFF: 'The first line never runs for this dealer. Nothing is spent and nothing is logged.',
  SHADOW:
    'It runs the whole turn — guard, model, lookup, template — and posts NOTHING. Real cost, real turn log, no dealer ever sees it.',
  ON: 'It answers this dealer, in about three seconds, and hands the thread to a person the moment it cannot.',
};

/** For the picker, in the order they are meant to be walked: OFF → SHADOW → ON. */
export const MODE_OPTIONS: readonly DealerFirstLineMode[] = DEALER_FIRSTLINE_MODES;

/* ────────────────────────────── Filter options ──────────────────────────── */

export const OUTCOME_OPTIONS: readonly AiTurnOutcome[] = AI_TURN_OUTCOMES;
export const REASON_OPTIONS: readonly AiHandoffReason[] = AI_HANDOFF_REASONS;

/**
 * How many filters are set, for the mobile `FilterBar` trigger.
 *
 * The FACET IS NOT COUNTED. It is always set — `unreviewed` is the default, not
 * the absence of a choice — so counting it would mean the bar reads "1 filter"
 * on a screen nobody has touched, and the operator learns the number means
 * nothing.
 */
export function activeFilterCount(input: {
  dealerId?: string;
  outcome?: string;
  reason?: string;
}): number {
  return [input.dealerId, input.outcome, input.reason].filter(Boolean).length;
}
