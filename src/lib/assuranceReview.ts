/**
 * What the AI review contributed, decided once, outside React.
 *
 * mdg-admin has no test runner, so anything that can be got wrong quietly lives
 * here rather than inside a component: which findings a rule proved and which
 * the AI merely suggested, which explanation belongs to which finding, and
 * whether it is honest to tell an admin the report was checked at all.
 *
 * THE ONE RULE THIS MODULE EXISTS TO PROTECT. Only an adjudication that actually
 * ran may be described as having read the report. Every other outcome — not
 * switched on, timed out, unreachable, unreadable, thrown away for quoting
 * figures nobody supplied — must be phrased so an admin cannot mistake it for
 * agreement. Manufacturing confidence out of an outage is worse than having no
 * AI review at all, because the admin stops looking.
 *
 * The second rule, which follows from it: an explanation never causes a finding
 * to be listed. It renders only against a finding the panel was already showing.
 * The AI cannot make this panel grow on a clean day.
 */
import type {
  AssuranceExplanation,
  AssuranceFinding,
  AssuranceReportVerdict,
} from './assurance';

/** A rule finding, with the AI's account of it if one survived the fence. */
export interface ReviewedFinding {
  finding: AssuranceFinding;
  explanation: AssuranceExplanation | null;
}

/** The outcomes that mean the AI genuinely looked and formed a view. */
const LOOKED: ReadonlySet<string> = new Set(['ANSWERED', 'ABSTAINED']);

/** The outcomes where nothing was asked of it at all. Silence is the accurate report. */
const NOT_ASKED: ReadonlySet<string> = new Set(['SKIPPED', 'BUDGET']);

function sameScope(a: AssuranceFinding['scope'], b: AssuranceExplanation['scope']): boolean {
  if (b.productKey && b.productKey !== a.productKey) return false;
  if (b.businessDate && b.businessDate !== a.businessDate) return false;
  if (b.tankNo !== undefined && b.tankNo !== null && b.tankNo !== a.tankNo) return false;
  if (b.nozzleNo !== undefined && b.nozzleNo !== null && b.nozzleNo !== a.nozzleNo) return false;
  return true;
}

/**
 * Attach each explanation to the finding it accounts for.
 *
 * Matched on code first and scope second, and NEVER guessed: an explanation that
 * could belong to two findings belongs to neither. A cause printed under a rule
 * it was not about is the loudest possible way this feature can fail — the admin
 * acts on it, and it is wrong about a report that is genuinely broken.
 */
export function attachExplanations(
  findings: AssuranceFinding[],
  explanations: AssuranceExplanation[],
): ReviewedFinding[] {
  return findings.map((finding) => {
    const candidates = explanations.filter(
      (e) => e.findingCode === finding.code && sameScope(finding.scope, e.scope),
    );
    return { finding, explanation: candidates.length === 1 ? candidates[0]! : null };
  });
}

export interface ReviewSplit {
  /** What the rules proved, with any explanation attached. */
  ruled: ReviewedFinding[];
  /** What the AI raised on its own. Never proved, never `BLOCK`. */
  raised: AssuranceFinding[];
  /** True when the rules all passed and only the AI is withholding this report. */
  heldByReviewOnly: boolean;
}

/**
 * Split a verdict into what was proved and what was suggested.
 *
 * The two never mix in the panel, because telling them apart by reading each
 * row's label is exactly the small print an admin on a phone does not read.
 */
export function splitReview(verdict: AssuranceReportVerdict | null | undefined): ReviewSplit {
  const findings = verdict?.findings ?? [];
  const explanations = verdict?.stored?.adjudication?.explanations ?? [];
  const ruleFindings = findings.filter((f) => f.source !== 'MODEL');
  const raised = findings.filter((f) => f.source === 'MODEL');
  const holding = verdict?.holding ?? [];

  return {
    ruled: attachExplanations(ruleFindings, explanations),
    raised,
    heldByReviewOnly: holding.length > 0 && holding.every((f) => f.source === 'MODEL'),
  };
}

/**
 * The trailing clause on a passing report's line, or null when there is nothing
 * honest to say.
 *
 * Deliberately NOT "agreed", "approved" or "confirmed". The AI has no standing to
 * endorse a report; it only failed to object, and the words have to say exactly
 * that much and no more.
 */
export function reviewNote(verdict: AssuranceReportVerdict | null | undefined): string | null {
  const a = verdict?.stored?.adjudication;
  if (!a || NOT_ASKED.has(a.outcome)) return null;
  if (!LOOKED.has(a.outcome)) return null;
  if (a.concerns.length > 0) return null;
  return a.droppedUngrounded > 0
    ? 'The AI review raised nothing that checked out.'
    : 'The AI review read this report and raised nothing.';
}

/**
 * The honest one-liner when the AI review did not complete, or null.
 *
 * Every sentence names who DID decide, in the same breath, so an admin can never
 * read "the AI review failed" as "this report is wrong". The rules are what
 * withhold a report, and they ran regardless.
 */
export function reviewTrouble(verdict: AssuranceReportVerdict | null | undefined): string | null {
  const a = verdict?.stored?.adjudication;
  if (!a) return null;

  // When the CHECKS themselves failed, the reassurance would be a lie: the rules
  // did not run in full, and the panel's error state already owns that story.
  if (verdict?.decision === 'ERROR' || verdict?.stored?.decision === 'ERROR') return null;

  const rulesRan = ' The rules ran in full, so this report was still checked.';
  switch (a.outcome) {
    case 'TIMEOUT':
      return `The AI review did not answer in time.${rulesRan}`;
    case 'TRANSPORT_ERROR':
      return `The AI review could not be reached.${rulesRan}`;
    case 'EMPTY':
    case 'UNPARSEABLE':
    case 'SCHEMA_REJECTED':
    case 'TRUNCATED':
      return `The AI review's answer could not be read, so none of it was used.${rulesRan}`;
    case 'DECLINED':
    case 'SAFETY_BLOCKED':
      return `The AI review did not offer an opinion on this report.${rulesRan}`;
    case 'BUDGET':
      return `The AI review was not run on this report, to stay inside its daily budget.${rulesRan}`;
    case 'UNGROUNDED':
      return `The AI review quoted figures that are not on this report, so everything it said was set aside.${rulesRan}`;
    case 'ANSWERED':
      // It contributed AND some of it was thrown away — worth saying, because a
      // silently shrinking answer is how a drifting prompt hides.
      return a.droppedUngrounded > 0
        ? `Some of what the AI review said quoted figures that are not on this report, and was set aside.`
        : null;
    default:
      // ABSTAINED and SKIPPED say nothing here. ABSTAINED is reported by
      // `reviewNote` on the pass line; SKIPPED was never asked.
      return null;
  }
}

/** The plain-English heading for a named cause. Unknown values fall back safely. */
const CAUSE_LABEL: Record<string, string> = {
  BASELINE_ON_WRONG_NOZZLE: 'A baseline reading landed on the wrong nozzle',
  SHIFT_DATA_MISSING: 'The shift data for part of this window was never entered',
  DELIVERY_NOT_RECORDED: 'A delivery has not been recorded',
  DELIVERY_ON_WRONG_DAY: 'A delivery is sitting on the wrong day',
  METER_DID_NOT_MOVE: 'A meter did not move when it should have',
  DIP_LOOKS_WRONG: 'A tank dip does not fit the rest of the day',
  WINDOW_JUST_MOVED: 'The measuring window moved on this report',
  FIGURES_CHANGED_AFTER_BUILD: 'The figures changed after this report was built',
  CANNOT_TELL: 'Not clear from these figures',
};

export function causeLabel(cause: string): string {
  return CAUSE_LABEL[cause] ?? 'Likely cause';
}

/**
 * Whether a cause is the honest non-answer.
 *
 * Rendered identically to every other cause — same weight, same colour, nothing
 * greyed and nothing apologetic. If "cannot tell" looks like a failure on screen,
 * the reader learns that one answer is unwelcome and starts inventing causes.
 * This exists only so the heading can read as a statement rather than a label.
 */
export function isUnsureCause(cause: string): boolean {
  return cause === 'CANNOT_TELL';
}

/** What the header badge says, and how loudly. */
export interface AssuranceBadge {
  label: string;
  intent: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  /** The long form, for a screen reader and for the title on a pointer device. */
  detail: string;
}

/**
 * The one-glance status, for the report card header.
 *
 * FIVE DISTINCT LABELS, and that is the whole design. A badge that reads the
 * same words on every report every day carries no information within a week and
 * trains the eye to skip the one day it changes — so this never says a single
 * generic "Verified". It says which of five things actually happened, and the
 * commonest good day ("Checked") is visibly different from the commonest
 * not-quite day ("Rules only"), which is the distinction an admin needs.
 *
 * IT NEVER CLAIMS THE AI LOOKED WHEN IT DID NOT. "Checked · AI" is reachable
 * only from an adjudication that genuinely ran and returned. A timeout, a
 * budget skip, or an answer thrown away for quoting figures nobody supplied all
 * land on "Rules only", which is true and is not alarming.
 */
export function assuranceBadge(
  verdict: AssuranceReportVerdict | null | undefined,
): AssuranceBadge | null {
  if (!verdict) return null;

  if (verdict.neverChecked && verdict.holding.length === 0) {
    return {
      label: 'Not checked',
      intent: 'neutral',
      detail: 'This report was built before these checks existed.',
    };
  }

  if (verdict.decision === 'ERROR') {
    return {
      label: 'Not checked',
      intent: 'warning',
      detail: 'This report could not be checked. That is our fault, not the report’s.',
    };
  }

  if (verdict.holding.length > 0) {
    const released = !!verdict.stored?.override && verdict.releasable;
    if (released) {
      return {
        label: 'Released by hand',
        intent: 'warning',
        detail: 'An admin released this report against these exact figures.',
      };
    }
    const n = verdict.holding.length;
    return {
      label: verdict.releasable ? 'Would be held' : 'Not sent',
      intent: verdict.releasable ? 'warning' : 'danger',
      detail: `${n} ${n === 1 ? 'thing' : 'things'} to clear before this can go to the dealer.`,
    };
  }

  return {
    label: 'Checked',
    intent: 'success',
    detail: 'Every rule passed. This report can be sent.',
  };
}

/**
 * The AI review's own badge, separate from the report's.
 *
 * TWO BADGES, NOT ONE, and the split is the point. The rules decide whether a
 * report may be sent; the AI decides nothing and is often the thing that failed
 * on a perfectly good report. Merging them produced a single pill that had to
 * mean both "this report is fine" and "the AI managed to read it", which is how
 * an admin ends up thinking a model timeout is a bad report.
 *
 * Because the report's own badge sits beside this one, THIS one can afford to be
 * red when the AI's answer was unusable — the neighbour is still saying
 * "Checked", so a red AI badge cannot be misread as a condemned report. That is
 * the whole reason the honesty is affordable here and was not before.
 */
export function aiReviewBadge(
  verdict: AssuranceReportVerdict | null | undefined,
): AssuranceBadge | null {
  const a = verdict?.stored?.adjudication;
  if (!a) return null;

  const raised = a.concerns.length;

  switch (a.outcome) {
    case 'ANSWERED':
      return raised > 0
        ? {
            label: `AI · ${raised} to check`,
            intent: 'warning',
            detail: `The AI review raised ${raised} ${raised === 1 ? 'thing' : 'things'} worth a look. None of them withholds this report.`,
          }
        : {
            label: 'AI · clear',
            intent: 'success',
            detail: 'The AI review read this report and raised nothing.',
          };
    case 'ABSTAINED':
      return {
        label: 'AI · clear',
        intent: 'success',
        detail: 'The AI review read this report and had nothing to add.',
      };
    case 'UNGROUNDED':
      return {
        label: 'AI · discarded',
        intent: 'danger',
        detail:
          'Everything the AI review said quoted figures that are not on this report, so all of it was thrown away. The rules ran in full — this is about the AI, not the report.',
      };
    case 'TRUNCATED':
    case 'EMPTY':
    case 'UNPARSEABLE':
    case 'SCHEMA_REJECTED':
      return {
        label: 'AI · unreadable',
        intent: 'danger',
        detail:
          'The AI review’s answer could not be read, so none of it was used. The rules ran in full — this is about the AI, not the report.',
      };
    case 'TIMEOUT':
    case 'TRANSPORT_ERROR':
      return {
        label: 'AI · no answer',
        intent: 'warning',
        detail:
          'The AI review did not answer. The rules ran in full, so this report was still checked.',
      };
    case 'DECLINED':
    case 'SAFETY_BLOCKED':
      return {
        label: 'AI · no opinion',
        intent: 'neutral',
        detail: 'The AI review did not offer an opinion on this report.',
      };
    case 'BUDGET':
    case 'SKIPPED':
    default:
      return {
        label: 'AI · not run',
        intent: 'neutral',
        detail: 'The AI review did not run on this report.',
      };
  }
}
