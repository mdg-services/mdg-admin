/**
 * What each correctness check means, in words an admin can act on — and what a
 * standing remark is and is not able to do to it.
 *
 * WHY THIS IS A MODULE AND NOT MARKUP. The admin app has no test runner, so
 * anything decidable has to be at least readable in one place: which codes can
 * be explained away, what a remark actually achieves when it names one, where
 * the 90-day cap lands, and whether a half-filled remark form is complete. All
 * of that is here, pure, with no React import, so it can be reviewed as
 * arithmetic rather than hunted for inside a form.
 *
 * THE CODES ARE THE BACKEND'S, VERBATIM. `code` and `maxDowngrade` are copied
 * from `mdg-backend/src/assurance/catalogue.ts` and must not drift: the picker
 * sends these strings to `POST /assurance/dealers/:id/remarks`, and a code this
 * file spells differently is a remark that silently explains nothing. The
 * `title` and `meaning` are ours — the backend's own `message` carries the live
 * figures, and this is what the check is ABOUT before any report has fired it.
 *
 * @see mdg-backend/src/assurance/catalogue.ts  every bound, with its replay evidence
 * @see mdg-backend/src/assurance/remarks/match.ts  the four rules that constrain a remark
 */
import { isYmd } from '@/lib/format';

/** Mirrors `AssuranceSeverity`. Milder is a HIGHER rank, as in the backend. */
export type AssuranceSeverity = 'BLOCK' | 'REVIEW' | 'NOTE';

/** The floor a remark may lower a finding to. `NONE` = not downgradable, ever. */
export type AssuranceDowngradeFloor = AssuranceSeverity | 'NONE';

export type AssuranceDecision = 'PASS' | 'HOLD' | 'ERROR';

export const SEVERITY_RANK: Record<AssuranceSeverity, number> = {
  BLOCK: 0,
  REVIEW: 1,
  NOTE: 2,
};

/**
 * The severities that withhold a report.
 *
 * REVIEW is in here, and that is the fact the remarks screen keeps having to
 * restate: taking a BLOCK down to REVIEW softens it and still refuses to send
 * it. Same set as `fold.ts`.
 */
export function severityHolds(severity: AssuranceSeverity): boolean {
  return severity === 'BLOCK' || severity === 'REVIEW';
}

/**
 * Word for word the same as `lib/assurance.ts`, which the DSR panel reads.
 *
 * The same admin sees both screens in one sitting, and one severity going by
 * two names is the fault this codebase keeps having to fix. These two modules
 * should be merged; until they are, changing a label here means changing it
 * there in the same commit.
 */
export const SEVERITY_LABEL: Record<AssuranceSeverity, string> = {
  BLOCK: 'Impossible figure',
  REVIEW: 'Needs a look',
  NOTE: 'Note',
};

export interface CheckMeta {
  /** The stable catalogue id. Sent on the wire; never reworded. */
  code: string;
  /** The heading an admin reads instead of a dotted code. */
  title: string;
  /** One plain sentence: what it means when this fires. */
  meaning: string;
  /** The severity the check's author gave it. */
  severity: AssuranceSeverity;
  /** The lowest a remark may take it. Declared by the check's author. */
  maxDowngrade: AssuranceDowngradeFloor;
}

/**
 * Every check the DSR gate can raise, in the order the backend runs them.
 *
 * Listed explicitly rather than derived, exactly as the backend lists its own:
 * a check that disappears should be a visible deletion in a diff, not a picker
 * that quietly stopped offering an option.
 */
export const CHECK_CATALOGUE: readonly CheckMeta[] = [
  {
    code: 'dsr.report.stale',
    title: 'The report is marked stale',
    meaning:
      'The figures behind this report changed after it was built. It needs regenerating, not explaining.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.variation.identity',
    title: 'The report does not add up',
    meaning:
      'The printed variation is not sales after testing minus dip sales. Something changed between computing the report and storing it.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.variation.exceeds_stock_ever_held',
    title: 'More fuel than the outlet has ever held',
    meaning:
      'The variation is larger than the stock dipped at the inspection plus every litre received since. Nothing can go missing beyond that. This is the check the 3 Sep 1E report broke, at 134x.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.meter.rate_ceiling',
    title: 'A nozzle that cannot have delivered this',
    meaning:
      'The meters imply more than 86,400 L per nozzle per day — one nozzle running flat out at 60 L/min for 24 hours. The busiest real product-day here measured 2,750 L.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.window.no_measured_day',
    title: 'Not one litre measured in the window',
    meaning:
      'Two or more days since the inspection with no meter movement at all, while fuel sat in the tanks. The shift data for that period is missing, so the variation is not a measurement.',
    severity: 'BLOCK',
    maxDowngrade: 'REVIEW',
  },
  {
    code: 'dsr.quantity.negative',
    title: 'A quantity that cannot be negative',
    meaning:
      'An opening stock, receipt, total stock or dip came out below zero on one of the ledger days.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.cumulative.monotonic',
    title: 'Month-to-date sales going down',
    meaning:
      'The running total for the calendar month falls from one day to the next. A running total cannot go down.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
  {
    code: 'dsr.stock.exceeds_ever_received',
    title: 'The tanks hold more than was ever put in',
    meaning:
      'The dip is more than 2% above the stock at inspection plus every receipt since. Usually an unrecorded delivery — and the one check a broken dip gauge genuinely explains.',
    severity: 'REVIEW',
    maxDowngrade: 'NOTE',
  },
  {
    code: 'dsr.variation.outside_permissible',
    title: 'Outside the permissible band',
    meaning:
      'The variation is beyond the 5.1.11 allowance. Nearly half of all real product-days sit outside the band, so this is recorded and never withholds anything.',
    severity: 'NOTE',
    maxDowngrade: 'NOTE',
  },
  {
    code: 'dsr.rebaseline.shock',
    title: 'The inspection window moved and the variation jumped',
    meaning:
      'A fresh window should start near zero and this one is past 2,000 L. Check that each pump’s baseline reading landed on the right nozzle — that is exactly how 1E went wrong.',
    severity: 'REVIEW',
    maxDowngrade: 'REVIEW',
  },
  {
    code: 'assurance.check_failed',
    title: 'A check could not be evaluated',
    meaning:
      'One of the checks threw while running. A report that was not fully checked is not a report that passed — this one is on us, not on the report.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  },
];

const BY_CODE = new Map(CHECK_CATALOGUE.map((c) => [c.code, c]));

/**
 * The prefix the backend forces onto every code the AI review invents.
 *
 * Its codes are free text — the shapes it exists for are the ones no rule
 * anticipated — so they cannot be listed here. The prefix is what lets this
 * screen tell a concern that was SUGGESTED from a finding that was PROVED.
 */
const MODEL_CODE_PREFIX = 'model.';

/**
 * The catalogue entry for a code, or an honest placeholder.
 *
 * Three cases, and the difference between them matters. A known code gets its
 * own entry. A `model.` code is a concern from the AI review: it can never
 * be `BLOCK` (the response schema has no such member) and its floor is always
 * `NOTE`, because a model's opinion is outranked by an admin who has looked at
 * the report and written down why it is fine. Anything else is a backend that
 * has moved ahead of this build, and inventing a meaning for it would be worse
 * than admitting the gap — so the fallback is `NONE`, the strictest reading of
 * an unknown check.
 */
export function checkMeta(code: string): CheckMeta {
  const known = BY_CODE.get(code);
  if (known) return known;
  if (code.startsWith(MODEL_CODE_PREFIX)) {
    return {
      code,
      title: `Raised by the AI review: ${code.slice(MODEL_CODE_PREFIX.length).replace(/_/g, ' ')}`,
      meaning:
        'Not proved by a rule — a second, fallible reader looked at the same figures and said one of them seems wrong. Every number it cited was checked against the report before this was kept.',
      severity: 'REVIEW',
      maxDowngrade: 'NOTE',
    };
  }
  return {
    code,
    title: code,
    meaning:
      'This check is newer than this screen, so there is no plain-English description of it here. The finding’s own message carries the figures.',
    severity: 'BLOCK',
    maxDowngrade: 'NONE',
  };
}

/** What naming a code in a remark actually achieves. */
export type RemarkEffect =
  | 'FORBIDDEN'
  | 'NO_CHANGE'
  | 'SOFTENS_STILL_HELD'
  | 'RELEASES';

/**
 * Where a finding of this kind ends up once a remark covers it.
 *
 * The floor IS the target — a remark records that a condition is explained, not
 * how serious it should be considered instead — so the arithmetic is the same
 * one `applyRemarks` does: take the floor when the floor is milder, otherwise
 * nothing moves.
 */
export function remarkEffect(meta: CheckMeta): RemarkEffect {
  if (meta.maxDowngrade === 'NONE') return 'FORBIDDEN';
  const resulting =
    SEVERITY_RANK[meta.maxDowngrade] > SEVERITY_RANK[meta.severity]
      ? meta.maxDowngrade
      : meta.severity;
  if (resulting === meta.severity) return 'NO_CHANGE';
  return severityHolds(resulting) ? 'SOFTENS_STILL_HELD' : 'RELEASES';
}

/** The one sentence beside a code in the picker. Real consequence, no hedging. */
export function remarkEffectNote(meta: CheckMeta): string {
  switch (remarkEffect(meta)) {
    case 'FORBIDDEN':
      return 'Cannot be suppressed. No remark, at any scope, written by anyone, releases a physical impossibility.';
    case 'RELEASES':
      return `A remark takes this from ${SEVERITY_LABEL[meta.severity].toLowerCase()} to a note, and a note withholds nothing.`;
    case 'SOFTENS_STILL_HELD':
      return `A remark softens this to ${SEVERITY_LABEL[meta.maxDowngrade as AssuranceSeverity].toLowerCase()}, which still withholds the report. The fix is the missing data, not the note.`;
    case 'NO_CHANGE':
      return severityHolds(meta.severity)
        ? `A remark cannot take this below ${SEVERITY_LABEL[meta.severity].toLowerCase()}, so it still withholds the report. Naming it records why, and nothing more.`
        : 'This never withholds anything, so a remark changes nothing. Naming it only records that you know.';
  }
}

/** `true` when the picker may offer the code at all. */
export function isSuppressible(code: string): boolean {
  return remarkEffect(checkMeta(code)) !== 'FORBIDDEN';
}

// ------------------------------------------------------------------ remarks

/**
 * The longest a remark may run before an admin has to re-affirm it. Applied by
 * the server on the way in, so this is not advice — it is what will be stored.
 */
export const MAX_REMARK_DAYS = 90;

/** How much a fault may grow before its remark stops covering it. */
export const MAGNITUDE_ESCALATION_FACTOR = 3;

/**
 * `YYYY-MM-DD` + n days.
 *
 * Parsed as UTC midnight on purpose, the same as the server's: these are
 * calendar dates, not instants, and parsing them in the browser's own zone
 * moves the answer by a day for anyone west of Greenwich.
 */
export function addDays(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The `effectiveTo` the remark will actually be stored with.
 *
 * A mirror of the server's `capEffectiveTo`, and it exists so the admin sees
 * the real end date on the screen where they type it rather than discovering
 * months later that the date they picked was quietly moved. Two answers for one
 * figure is the fault this codebase keeps having to fix; if the server's cap
 * changes, this changes with it.
 */
export function capEffectiveTo(
  effectiveFrom: string,
  requested?: string | null,
): string {
  const ceiling = addDays(effectiveFrom, MAX_REMARK_DAYS);
  if (!requested) return ceiling;
  if (requested > ceiling) return ceiling;
  if (requested < effectiveFrom) return effectiveFrom;
  return requested;
}

/** What will be stored, and whether the admin's own date survived it. */
export function remarkExpiry(
  effectiveFrom: string,
  requested?: string | null,
): { effectiveTo: string; capped: boolean } {
  const effectiveTo = capEffectiveTo(effectiveFrom, requested);
  return { effectiveTo, capped: !!requested && requested !== effectiveTo };
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`, read as UTC calendar days. */
export function daysBetween(a: string, b: string): number {
  const from = Date.parse(`${a}T00:00:00.000Z`);
  const to = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export type RemarkWindowState = 'PENDING' | 'ACTIVE' | 'LAPSED';

/**
 * Where a remark stands against a given day.
 *
 * Judged against a date handed in rather than a clock read here, so the module
 * stays pure and the caller decides which day matters — the screen passes IST
 * today, which is the day the backend's own business dates are cut on.
 */
export function remarkWindow(
  effectiveFrom: string,
  effectiveTo: string,
  today: string,
): { state: RemarkWindowState; daysLeft: number } {
  if (today < effectiveFrom) {
    return { state: 'PENDING', daysLeft: daysBetween(effectiveFrom, effectiveTo) };
  }
  if (today > effectiveTo) return { state: 'LAPSED', daysLeft: 0 };
  return { state: 'ACTIVE', daysLeft: daysBetween(today, effectiveTo) };
}

/**
 * A remark's scope in words.
 *
 * "Everything at this dealer" is said out loud rather than left as an empty
 * space, because the widest possible scope is the one an admin most needs to
 * notice they have chosen.
 */
export function scopeLabel(scope: {
  productKey?: string | null;
  tankNo?: number | null;
  nozzleNo?: number | null;
}): string {
  const parts: string[] = [];
  if (scope.productKey) parts.push(scope.productKey);
  if (scope.tankNo != null) parts.push(`Tank ${scope.tankNo}`);
  if (scope.nozzleNo != null) parts.push(`Nozzle ${scope.nozzleNo}`);
  return parts.length === 0 ? 'Everything at this dealer' : parts.join(' · ');
}

/** The remark form's fields, as the screen holds them: all strings. */
export interface RemarkDraft {
  text: string;
  suppresses: string[];
  effectiveFrom: string;
  effectiveTo: string;
  productKey: string;
  tankNo: string;
  nozzleNo: string;
}

export const EMPTY_REMARK_DRAFT: RemarkDraft = {
  text: '',
  suppresses: [],
  effectiveFrom: '',
  effectiveTo: '',
  productKey: '',
  tankNo: '',
  nozzleNo: '',
};

/**
 * Everything wrong with a draft, in the words the admin should read.
 *
 * Every rule here is one the server enforces, so a draft this returns nothing
 * for is a draft that will be accepted — the point being that an admin never
 * meets a 400 they could have been told about while typing. The bounds
 * (3/2000 characters, 1-20 codes, a 32-character product key, positive whole
 * tank and nozzle numbers) are `remarkBody` in `routes/v1/assurance.ts`.
 */
export function remarkProblems(draft: RemarkDraft): string[] {
  const problems: string[] = [];

  const text = draft.text.trim();
  if (text.length < 3) {
    problems.push(
      'Say what is physically going on, in words — "tank 6’s dip meter is broken so its dip is entered by hand".',
    );
  } else if (text.length > 2000) {
    problems.push(
      `The remark is ${text.length} characters. The most that can be stored is 2,000.`,
    );
  }

  if (draft.suppresses.length === 0) {
    problems.push(
      'Tick at least one check this explains. A remark that names no check explains nothing, and would become a licence over whatever fires next.',
    );
  } else if (draft.suppresses.length > 20) {
    problems.push(
      `${draft.suppresses.length} checks are ticked. A remark may name at most 20.`,
    );
  }

  const forbidden = draft.suppresses.filter((c) => !isSuppressible(c));
  if (forbidden.length > 0) {
    problems.push(
      `${forbidden.join(', ')} cannot be suppressed by any remark. Untick ${forbidden.length === 1 ? 'it' : 'them'}.`,
    );
  }

  if (!isYmd(draft.effectiveFrom)) {
    problems.push('Pick the day this starts applying from.');
  } else if (draft.effectiveTo) {
    if (!isYmd(draft.effectiveTo)) {
      problems.push('The end date is not a real calendar day.');
    } else if (draft.effectiveTo < draft.effectiveFrom) {
      problems.push('The end date is before the start date.');
    }
  }

  if (draft.productKey.trim().length > 32) {
    problems.push('The product key is longer than 32 characters.');
  }

  for (const [label, raw] of [
    ['Tank', draft.tankNo],
    ['Nozzle', draft.nozzleNo],
  ] as const) {
    if (!raw.trim()) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      problems.push(`${label} must be a whole number of 1 or more.`);
    }
  }

  return problems;
}

// ------------------------------------------------------------- the hold queue

/**
 * How far back the server's `/assurance/holds` handler looks.
 *
 * It reads the 600 most recent reports and re-evaluates every one of them, then
 * returns those it is withholding. The empty state quotes this figure, so if
 * the server's `.limit(600)` moves, this sentence on screen becomes wrong.
 */
export const HOLDS_SCAN_LIMIT = 600;

export const DECISION_LABEL: Record<AssuranceDecision, string> = {
  PASS: 'Passed',
  HOLD: 'Held',
  ERROR: 'Not checked',
};

/**
 * A decision in one sentence.
 *
 * `ERROR` is deliberately not phrased as a fault of the report: a hold is a
 * statement about the figures, an error is a statement about us, and an admin
 * reading the queue has to be able to tell those apart before they go looking
 * for a problem that is not there.
 */
export const DECISION_NOTE: Record<AssuranceDecision, string> = {
  PASS: 'Nothing is withholding this.',
  HOLD: 'The figures state something a forecourt forbids, or something close enough to it that a person should look.',
  ERROR: 'The check itself could not run. That is ours to fix, not the report’s.',
};

/** The shape the queue screen sorts and splits. Kept structural on purpose. */
interface HoldLike {
  businessDate: string;
  alreadyShared: boolean;
  outletCode: string | null;
}

/**
 * Newest business date first, oldest last.
 *
 * The server already sorts this way, and doing it again here costs nothing and
 * means the screen's stated order is a property of the screen rather than a
 * habit of an endpoint. Ties break on outlet code so two dealers holding the
 * same day do not swap places between renders.
 */
export function sortHolds<T extends HoldLike>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.businessDate.localeCompare(a.businessDate) ||
      (a.outletCode ?? '').localeCompare(b.outletCode ?? ''),
  );
}

/**
 * Split the queue from the history.
 *
 * A report already in the dealer's chat cannot be unsent — `routes/v1/messages`
 * has no delete and no edit — so there is nothing an admin can do about the
 * ones in `history`. Mixing them into the work list would make the queue read
 * as longer than it is and put rows in it that no action empties.
 */
export function partitionHolds<T extends HoldLike>(
  rows: readonly T[],
): { queue: T[]; history: T[] } {
  const sorted = sortHolds(rows);
  return {
    queue: sorted.filter((r) => !r.alreadyShared),
    history: sorted.filter((r) => r.alreadyShared),
  };
}
