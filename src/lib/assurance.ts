/**
 * The pre-send correctness check, as the admin reads it.
 *
 * WHY THERE IS ANYTHING TO READ. On 3 Sep 2026 dealer 1E was re-inspected, the
 * re-baseline put the inspection's meter readings on the wrong nozzles, and the
 * report printed a stock variation of 2,646,765 L against a true 263 L. Every
 * structural guard passed — no row was missing, no ledger day was out of order —
 * because nothing anywhere asked whether a number was POSSIBLE. The report
 * rendered, saved, and sat one confirm click from the dealer's phone.
 *
 * Nothing posted to a dealer can be recalled: there is no message delete and no
 * message edit endpoint. So the only defence is refusing to send, and the only
 * job of this module is to make the refusal legible before the admin presses
 * anything.
 *
 * THE TYPES BELOW ARE MIRRORED BY HAND from `mdg-backend/src/assurance/types.ts`
 * and `gate.ts`, which is the same convention `DsrReportView` already follows in
 * `hooks/api/useDsr.ts`: the server types live behind `@dk/shared`-less module
 * boundaries, so the admin restates the wire shape and keeps the comments that
 * say what each field means.
 *
 * EVERYTHING DECIDABLE LIVES HERE, with no React import. mdg-admin has no test
 * runner, so a rule expressed inside a component is a rule nobody can read on
 * its own — severity order, whether a verdict is withholding, whether an
 * override form is complete. Those are the four things that decide whether a
 * dealer receives a wrong report, so they are functions with names.
 */
import { formatYmd } from '@/lib/format';

/* ─────────────────────────── Wire types (mirrored) ──────────────────────── */

/**
 * How bad a finding is.
 *
 * `BLOCK` means the artefact states something the physics or the arithmetic of a
 * forecourt forbids — 2,646,765 L of variation out of tanks that hold 40,000 L.
 * `REVIEW` means it is implausible enough that a person should look. `NOTE` is
 * recorded and never withholds anything: nearly half of all real product-days
 * sit outside the permissible variation band, so that condition can never be
 * more than a note.
 */
export type AssuranceSeverity = 'BLOCK' | 'REVIEW' | 'NOTE';

/** The floor an admin remark may lower a finding to. `NONE` = not downgradable. */
export type AssuranceDowngradeFloor = AssuranceSeverity | 'NONE';

/**
 * The outcome for one report.
 *
 * `ERROR` is deliberately not `HOLD`: a hold is a statement about the report, an
 * error is a statement about us, and the screen has to tell those apart because
 * only one of them is the dealer's problem.
 */
export type AssuranceDecision = 'PASS' | 'HOLD' | 'ERROR';

/** `A` = evaluable from the stored report alone. `B` = needs history or config. */
export type AssuranceTier = 'A' | 'B';

/**
 * `OFF` — nothing runs. `SHADOW` — everything runs and is recorded, nothing is
 * withheld. `ENFORCE` — a holding verdict withholds the report.
 *
 * This is why `decision` and `releasable` are two fields and not one, and why
 * the panel can honestly say "this would have been held" without the Share
 * button being disabled.
 */
export type AssuranceMode = 'OFF' | 'SHADOW' | 'ENFORCE';

/** Where a finding came from. The model's findings can never be `BLOCK`. */
export type AssuranceSource = 'DETECTOR' | 'MODEL';

/** What part of the report a finding is about. */
export interface AssuranceScope {
  productKey?: string;
  businessDate?: string;
  tankNo?: number;
  nozzleNo?: number;
}

/** One thing wrong with one report. */
export interface AssuranceFinding {
  /** Stable catalogue id, e.g. `dsr.variation.exceeds_stock_ever_held`. */
  code: string;
  tier: AssuranceTier;
  severity: AssuranceSeverity;
  /**
   * The lowest severity a standing remark may take this to, declared by the
   * check's author. A physical impossibility carries `NONE`.
   */
  maxDowngrade: AssuranceDowngradeFloor;
  scope: AssuranceScope;
  /**
   * One plain sentence with the real figures in it.
   *
   * Rendered VERBATIM everywhere in this admin. The backend already writes these
   * for a person to act on, and a second wording in the UI is a second thing to
   * keep true when a threshold moves.
   */
  message: string;
  /** The figure that tripped the check. */
  observed: number | null;
  /** The bound it broke. */
  limit: number | null;
  source: AssuranceSource;
  /** Set when a standing remark moved this finding's severity. */
  downgradedBy?: {
    remarkId: string;
    from: AssuranceSeverity;
    /** The figure when the remark was written, so a fault that GREW is not silenced. */
    observedAtIssue: number | null;
  };
}

/** What the model contributed, kept apart from what the detectors proved. */
/** One plain-words account of why a rule finding probably fired. */
export interface AssuranceExplanation {
  /** The catalogue code of the finding this explains. */
  findingCode: string;
  scope: AssuranceScope;
  /** A named cause from the backend's closed list. */
  cause: string;
  /** One sentence naming the figures that point at that cause. */
  because: string;
  /** Optional: the innocent explanation this is NOT. Often the most useful line. */
  ruledOut?: string;
  citations: string[];
}

export interface AssuranceAdjudication {
  outcome:
    | 'ANSWERED'
    | 'ABSTAINED'
    | 'SAFETY_BLOCKED'
    | 'DECLINED'
    | 'TRUNCATED'
    | 'EMPTY'
    | 'UNPARSEABLE'
    | 'SCHEMA_REJECTED'
    | 'UNGROUNDED'
    | 'TIMEOUT'
    | 'TRANSPORT_ERROR'
    | 'BUDGET'
    | 'SKIPPED';
  /** Concerns that survived the fence. Never `BLOCK`. */
  concerns: AssuranceFinding[];
  /**
   * Why a finding the RULES made probably fired, in plain words.
   *
   * Optional on the wire so a report checked before this shipped still parses.
   * It is reading material and nothing else: it carries no severity, it is not
   * acknowledged in a release, and deleting every entry changes no decision.
   */
  explanations?: AssuranceExplanation[];
  droppedUngrounded: number;
  latencyMs: number | null;
  estPaise: number | null;
  model: string | null;
}

/** An admin's decision to release a held report anyway. */
export interface AssuranceOverride {
  adminId: string;
  reason: string;
  /** The exact finding codes acknowledged. An override covers nothing else. */
  acknowledged: string[];
  /** The digest the override was granted against. */
  subjectHash: string;
  at: string;
}

/** The verdict STORED on the report at generate time. */
export interface AssuranceVerdict {
  version: number;
  mode: AssuranceMode;
  decision: AssuranceDecision;
  /** Always true under SHADOW — that is what shadow means. */
  releasable: boolean;
  findings: AssuranceFinding[];
  adjudication: AssuranceAdjudication | null;
  checkedAt: string;
  /**
   * Digest of the figures judged. An override is pinned to this, so permission
   * granted against one set of numbers never transfers to a regenerated set.
   */
  subjectHash: string;
  override?: AssuranceOverride;
}

/**
 * The verdict evaluated NOW, at an egress point — `evaluateGate` on the server.
 *
 * Not the stored verdict: the gate takes the worse of what was stored and a
 * fresh pass over today's rules, because `stale` is set on an EXISTING report
 * long after it was generated. That is exactly what happened to 1E — the
 * re-baseline marked it stale and a generate-time verdict could not have known.
 */
export interface GateEvaluation {
  decision: AssuranceDecision;
  releasable: boolean;
  /** The findings withholding the report, most severe first. Empty when passing. */
  holding: AssuranceFinding[];
  /** One line per holding finding — the same text the API refusal carries. */
  reasons: string[];
  findings: AssuranceFinding[];
  /** True when this report has never been checked. Never a pass. */
  neverChecked: boolean;
}

/** `GET /assurance/reports/:reportId`. */
export interface AssuranceReportVerdict extends GateEvaluation {
  reportId: string;
  subjectHash: string;
  /** The verdict written at generate time, or `null` if there never was one. */
  stored: AssuranceVerdict | null;
}

/** `POST /assurance/reports/:reportId/override` body. */
export interface AssuranceOverrideInput {
  reason: string;
  acknowledged: string[];
}

/** `POST /assurance/reports/:reportId/override` result. */
export interface AssuranceOverrideResult {
  override: AssuranceOverride;
}

/**
 * The least a caller has to hand over to be judged.
 *
 * Both an `AssuranceVerdict` (stored, carries `override`, no `holding`) and a
 * `GateEvaluation` (live, carries `holding` and `neverChecked`, no `override`)
 * satisfy this, so every helper below takes either without a cast.
 */
export interface AssuranceOutcome {
  decision: AssuranceDecision;
  releasable: boolean;
  holding?: readonly AssuranceFinding[];
  findings?: readonly AssuranceFinding[];
  neverChecked?: boolean;
  override?: AssuranceOverride;
}

/* ──────────────────────────────── Decidable ─────────────────────────────── */

/** Severity order. Same numbers as `fold.ts`, so both ends sort identically. */
export const SEVERITY_RANK: Record<AssuranceSeverity, number> = {
  BLOCK: 0,
  REVIEW: 1,
  NOTE: 2,
};

export function severityRank(severity: AssuranceSeverity): number {
  return SEVERITY_RANK[severity];
}

/** The severities that withhold a report under ENFORCE. `NOTE` never does. */
const HOLDING_SEVERITIES: readonly AssuranceSeverity[] = ['BLOCK', 'REVIEW'];

/**
 * Most severe first.
 *
 * Copies before sorting — the array handed in belongs to the query cache, and
 * `Array.prototype.sort` mutates in place. Array sort has been stable since
 * ES2019, so findings of equal severity keep the order the catalogue produced
 * them in, which is per-product and therefore already meaningful.
 */
export function sortFindings(
  findings: readonly AssuranceFinding[],
): AssuranceFinding[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

/**
 * Is this report being withheld right now?
 *
 * `!releasable`, and nothing else. Under SHADOW a verdict can read `HOLD` while
 * `releasable` is true — the check is recording what it WOULD have done — and
 * disabling the Share button then would be a button that refuses for a reason
 * the server does not share.
 *
 * A missing verdict is NOT a hold. The gate is the authority on that, and the
 * moment the endpoint 404s or the network drops, treating "no answer" as "held"
 * would take Share away from every dealer at once. The server refuses on its own
 * if it has to; this only decides what the admin is shown.
 */
export function isHolding(verdict: AssuranceOutcome | null | undefined): boolean {
  if (!verdict) return false;
  return !verdict.releasable;
}

/**
 * The findings that are withholding, most severe first.
 *
 * `holding` when the server computed it (the gate does), otherwise derived from
 * `findings` — a stored `AssuranceVerdict` read straight off the report has no
 * `holding` array of its own.
 */
export function holdingFindings(
  verdict: AssuranceOutcome | null | undefined,
): AssuranceFinding[] {
  if (!verdict) return [];
  const source =
    verdict.holding ??
    (verdict.findings ?? []).filter((f) => HOLDING_SEVERITIES.includes(f.severity));
  return sortFindings(source);
}

/**
 * The distinct catalogue codes an override has to name, in severity order.
 *
 * DEDUPLICATED, because an override acknowledges CODES and not findings: the
 * server builds `new Set(holding.map(f => f.code))` and checks that the
 * acknowledged list covers it. A three-grade dealer trips the same check once
 * per product, so without this a single fault would be three tick boxes saying
 * the same sentence, and ticking one would leave two looking undone.
 */
export function holdingCodes(
  verdict: AssuranceOutcome | null | undefined,
): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const finding of holdingFindings(verdict)) {
    if (seen.has(finding.code)) continue;
    seen.add(finding.code);
    codes.push(finding.code);
  }
  return codes;
}

/** The severity word, for a chip beside a finding. Never replaces `message`. */
export const SEVERITY_LABEL: Record<AssuranceSeverity, string> = {
  BLOCK: 'Impossible figure',
  REVIEW: 'Needs a look',
  NOTE: 'Note',
};

/**
 * What a finding is about — "HSD · Tank 6", "MS · Nozzle 3".
 *
 * The scope is the difference between one fault and four: a four-grade dealer
 * trips the same check once per product, and without the grade beside each one
 * the list reads as four identical sentences with different numbers in them.
 * Empty when the finding is about the whole report, which is the common case for
 * the structural checks.
 */
export function describeScope(scope: AssuranceScope | undefined): string {
  if (!scope) return '';
  const parts: string[] = [];
  if (scope.productKey) parts.push(scope.productKey);
  if (scope.tankNo != null) parts.push(`Tank ${scope.tankNo}`);
  if (scope.nozzleNo != null) parts.push(`Nozzle ${scope.nozzleNo}`);
  if (scope.businessDate) parts.push(formatYmd(scope.businessDate));
  return parts.join(' · ');
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The one line an admin reads at a glance, before any finding.
 *
 * Ordered by what changes what they do next: an error is ours to fix, a hold is
 * theirs to clear, a never-checked report is neither and must not be dressed as
 * a pass, and a pass is the ordinary case and says so in five words.
 */
export function summarise(verdict: AssuranceOutcome | null | undefined): string {
  if (!verdict) {
    return 'This report has not been checked. That is not the same as passing.';
  }

  if (verdict.decision === 'ERROR') {
    return 'The check itself failed, so this report has not been checked.';
  }

  const holding = holdingFindings(verdict);

  if (holding.length === 0) {
    if (verdict.neverChecked) {
      return 'This report has no stored check. That is not the same as passing.';
    }
    const notes = (verdict.findings ?? []).filter((f) => f.severity === 'NOTE').length;
    return notes === 0
      ? 'Checked, and nothing is withholding this report.'
      : `Checked, and nothing is withholding this report (${notes} ${plural(notes, 'note', 'notes')}).`;
  }

  const n = holding.length;
  const blocks = holding.filter((f) => f.severity === 'BLOCK').length;
  const impossible = blocks > 0 ? `, ${blocks} of them impossible` : '';

  if (verdict.releasable) {
    // Releasable with findings still holding is one of two things, and the
    // override is what tells them apart.
    return verdict.override
      ? `Released by hand — ${n} ${plural(n, 'finding', 'findings')} acknowledged.`
      : `${n} ${plural(n, 'finding', 'findings')} recorded${impossible}. The check is not withholding reports yet.`;
  }

  // Deliberately does NOT lead with "not being sent": the panel's own heading
  // already says that, and the two sat one line apart saying the same thing.
  return `${n} ${plural(n, 'finding', 'findings')} to clear${impossible}.`;
}

/**
 * The sentence printed UNDER a disabled Share button, or `null` when the button
 * is live.
 *
 * It is text and not a `title`, because `title` never fires on touch and this
 * admin is used on phones — a tooltip is a reason nobody reads. It lives here
 * rather than in the component for the same reason everything else does: it is
 * the wording of a refusal, and a refusal an admin cannot act on is just a
 * broken button.
 *
 * Two shapes, because a hold and an error are different problems. An errored
 * check produces no holding findings at all (`foldError` returns an empty
 * list), so counting findings would print "0 findings to clear".
 */
export function shareBlockedReason(
  verdict: AssuranceOutcome | null | undefined,
): string | null {
  if (!isHolding(verdict)) return null;
  const n = holdingFindings(verdict).length;
  if (n === 0) {
    return 'Sharing is off because this report could not be checked. Nothing has confirmed these figures — regenerating it runs the check again.';
  }
  return `Sharing is off while this report is being withheld — ${n} ${plural(n, 'finding', 'findings')} to clear, listed above. Regenerate the report, or release it with a reason.`;
}

/** How long an override reason has to be. The server's own `z.string().min(10)`. */
export const MIN_OVERRIDE_REASON = 10;

export interface OverrideReadiness {
  ok: boolean;
  /** Why not, in words an admin can act on. `null` when `ok`. */
  why: string | null;
}

/**
 * Whether the override form is complete.
 *
 * The server enforces every one of these and answers 400, but an admin should
 * not have to discover a rule by pressing a button and reading a toast. The
 * reason is measured TRIMMED, which is stricter than the server's raw
 * `min(10)` — ten spaces would satisfy the server and explains nothing.
 */
export function canSubmitOverride(
  reason: string,
  acknowledged: readonly string[],
  codes: readonly string[],
): OverrideReadiness {
  if (codes.length === 0) {
    return {
      ok: false,
      why: 'Nothing is being withheld, so there is nothing to release.',
    };
  }

  const trimmed = reason.trim();
  if (trimmed.length < MIN_OVERRIDE_REASON) {
    return {
      ok: false,
      why: `Say why this report is right, in at least ${MIN_OVERRIDE_REASON} characters — ${trimmed.length} so far.`,
    };
  }

  const acked = new Set(acknowledged);
  const missing = codes.filter((code) => !acked.has(code));
  if (missing.length > 0) {
    return {
      ok: false,
      why: `Acknowledge every finding you are releasing. Still unticked: ${missing.join(', ')}.`,
    };
  }

  return { ok: true, why: null };
}

/**
 * Does a stored override still cover what is being withheld?
 *
 * The same two conditions as the server's `overrideCovers`. The hash pins the
 * permission to the figures it was granted against, so a regenerated report is
 * held again rather than inheriting a release; the acknowledged list pins it to
 * the specific faults, so permission granted for a known data gap does not also
 * release a baseline mis-assignment that appeared in the same report.
 *
 * Used to say so on screen: an override that no longer applies is not a mistake
 * to hide, it is the reason the report is held again.
 */
export function overrideApplies(
  override: AssuranceOverride | null | undefined,
  subjectHash: string,
  codes: readonly string[],
): boolean {
  if (!override) return false;
  if (override.subjectHash !== subjectHash) return false;
  const acked = new Set(override.acknowledged);
  return codes.every((code) => acked.has(code));
}
