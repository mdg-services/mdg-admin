import type {
  CalibrationClaimAction,
  CalibrationClaimOverview,
  CalibrationClaimStage,
  CalibrationClaimView,
  ClaimCheck,
  ClaimDocumentSlot,
  ClaimDocumentSource,
  ClaimOverrides,
  ClaimPlan,
  ClaimUploadSlot,
} from '@dk/shared';
import type { CalibrationClaimActionInput, ClaimOverridesInput } from '@dk/shared/schemas';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package to its
// compiled `dist/`, which these tables are newer than (`lib/portalLogin.ts` does the same).
import {
  CALIBRATION_CLAIM_CLOSED_STAGES,
  CLAIM_UPLOAD_SLOTS,
} from '../../../../../shared/src/types/calibrationClaim';
import { formatDateTime, formatInrWhole, formatYmd } from '../../../../lib/format';

/**
 * Every decision the calibration claim pane makes, taken out of the components.
 *
 * `mdg-admin` has no component test runner, so a rule written inside a `.tsx` is
 * a rule nothing can check. The pane reads functions here — what the claim's
 * stage is called, which buttons are allowed and why not, which checks come
 * first, what the corrections form sends — and the components are left with
 * nothing to get wrong but layout. `scripts/calibrationClaim.check.ts` runs them.
 *
 * Imports are relative and runtime-light on purpose: the check script runs under
 * `tsx`, which does not know the `@/` alias, so nothing here may import through it
 * (a type-only import is erased and is fine).
 *
 * NO JARGON IN THE OUTPUT. A plain admin never reads a stage slug, a check key, a
 * slot name or an action type; every label below is a sentence a person says.
 */

export const NO_VALUE = '—';

/** The look of a status pill, without importing the component's type. */
type Intent = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/* ─────────────────────── stages, claims, polling ─────────────────────── */

export const STAGE_VIEW: Record<CalibrationClaimStage, { label: string; intent: Intent }> = {
  documents: { label: 'Waiting for the papers', intent: 'warning' },
  review: { label: 'Needs a look', intent: 'danger' },
  letter: { label: 'Waiting for the signed letter', intent: 'warning' },
  ready: { label: 'Ready to file', intent: 'success' },
  filing: { label: 'Filing on IndianOil', intent: 'info' },
  filed: { label: 'Saved, not finalized', intent: 'info' },
  finalized: { label: 'Finalized', intent: 'success' },
  cancelled: { label: 'Cancelled', intent: 'neutral' },
};

export function isClosed(claim: Pick<CalibrationClaimView, 'stage'>): boolean {
  return CALIBRATION_CLAIM_CLOSED_STAGES.includes(claim.stage);
}

/** What a portal run in flight is doing, as the header says it. */
export const WORKING_TEXT: Record<CalibrationClaimAction, string> = {
  wemmis_fetch: 'Downloading the certificate and the receipt from eMaaptaul.',
  wemmis_reset: 'Resetting the eMaaptaul password with the owner, then downloading the papers.',
  sdms_preflight: 'Reading IndianOil’s list of units and claims. Nothing is changed there.',
  sdms_file: 'Filing the claim on IndianOil.',
  sdms_finalize: 'Finalizing the saved claim on IndianOil.',
};

/**
 * The badge for a step that is queued but has not started. Quiet on purpose: it is
 * a note that something is coming, not a run in flight, and nothing is locked by it.
 */
export const QUEUED_BADGE = 'Starting soon…';

/** Claims still moving, newest first as the server sent them. */
export function openClaims(claims: readonly CalibrationClaimView[]): CalibrationClaimView[] {
  return claims.filter((c) => !isClosed(c));
}

/**
 * The claim the pane shows: the one the admin picked, else the newest open one.
 * `null` when there is none to show — the pane then offers to start one.
 */
export function pickClaim(
  claims: readonly CalibrationClaimView[],
  selectedId: string | null,
): CalibrationClaimView | null {
  if (selectedId) {
    const chosen = claims.find((c) => c.id === selectedId);
    if (chosen) return chosen;
  }
  return openClaims(claims)[0] ?? null;
}

/** Stages where the claim is waiting on a person or on the portal: worth a slow check. */
const WAITING_STAGES: readonly CalibrationClaimStage[] = ['documents', 'letter', 'ready', 'filing'];

export const POLL_BUSY_MS = 3_000;
export const POLL_WAITING_MS = 30_000;

/**
 * How often the pane re-reads while it is open: every 3 seconds while a portal
 * run is in flight or about to start (a queued step is picked up within a minute,
 * and the screen changes when it is) or a picture code is waiting for a person (the
 * code has a time limit), every 30 seconds while a claim waits on somebody, and
 * never when nothing can move without an admin pressing a button.
 */
export function claimPollInterval(
  overview: Pick<CalibrationClaimOverview, 'claims' | 'liveCaptcha'> | undefined,
): number | false {
  if (!overview) return false;
  if (overview.liveCaptcha || overview.claims.some((c) => c.working || c.queued)) {
    return POLL_BUSY_MS;
  }
  if (overview.claims.some((c) => WAITING_STAGES.includes(c.stage))) return POLL_WAITING_MS;
  return false;
}

/**
 * The overview with one claim's new state written in. A new claim goes to the
 * front (the list is newest first) and its year stops being offered; a claim the
 * overview already holds is replaced where it stands.
 */
export function upsertClaim(
  overview: CalibrationClaimOverview,
  view: CalibrationClaimView,
): CalibrationClaimOverview {
  const known = overview.claims.some((c) => c.id === view.id);
  if (known) {
    return { ...overview, claims: overview.claims.map((c) => (c.id === view.id ? view : c)) };
  }
  return {
    ...overview,
    claims: [view, ...overview.claims],
    startableYears: overview.startableYears.filter((y) => y !== view.financialYear),
  };
}

/* ─────────────────────── financial years ─────────────────────── */

/**
 * The financial year (April to March) a calendar day falls in, as "2026-27".
 * `todayYmd` is the IST day (`istTodayYmd()`), so the year turns at IST midnight
 * on 1 April whatever the browser's own clock says.
 */
export function currentFinancialYear(todayYmd: string): string {
  const year = Number(todayYmd.slice(0, 4));
  const month = Number(todayYmd.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** "FY 2026-27 · April 2026 to March 2027", with "this year" on the current one. */
export function fyOptionLabel(fy: string, current: string): string {
  const start = Number(fy.slice(0, 4));
  const span = `April ${start} to March ${start + 1}`;
  return `FY ${fy} · ${span}${fy === current ? ' · this year' : ''}`;
}

/**
 * What the Services tab says after Run now on the claim service. The generic "Run
 * enqueued" told an admin nothing, and a Run now on an outlet with no open claim
 * starts one (the server's own rule), so the words say which year, that a year
 * with a claim already is refused, and where the claim is followed. Shown when the
 * run is accepted, before its outcome, so it says what it will try.
 */
export function claimRunNowWords(todayYmd: string): { title: string; description: string } {
  const fy = currentFinancialYear(todayYmd);
  return {
    title: 'Run started',
    description: `If the outlet has a claim open, this does its next step. If not, it starts the claim for FY ${fy}, unless that year already has one; the run then says why. Follow it in the Data Vault tab, under Calibration claim.`,
  };
}

/** The year the start form opens on: the current one when it is on offer, else the newest. */
export function defaultStartYear(years: readonly string[], current: string): string {
  return years.includes(current) ? current : (years[0] ?? '');
}

/* ─────────────────────── the plan, in words ─────────────────────── */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function includedUnits(plan: Pick<ClaimPlan, 'dus'>): ClaimPlan['dus'] {
  return plan.dus.filter((d) => d.include);
}

/** "3 units · 12 nozzles · ₹18,000 for FY 2026-27" */
export function planSummary(plan: ClaimPlan): string {
  return [
    plural(includedUnits(plan).length, 'unit'),
    plural(plan.nozzleCount, 'nozzle'),
    `${formatInrWhole(plan.totalAmount)} for FY ${plan.financialYear}`,
  ].join(' · ');
}

/** "DU 8" when SDMS gave a number, else "Serial 201400000111". */
export function unitName(du: { duNo: string | null; serialNo: string }): string {
  return du.duNo ? `DU ${du.duNo}` : `Serial ${du.serialNo}`;
}

export interface ApprovalFact {
  label: string;
  value: string;
}

/**
 * Exactly what an approval lets the robot type into IndianOil, as label / value
 * lines for the approve box. A value that is a list has one item per line. Every figure is the plan's own — the same numbers
 * the filing run types and checks the portal against.
 */
export function approvalFacts(plan: ClaimPlan): ApprovalFact[] {
  const claimed = includedUnits(plan);
  return [
    { label: 'Financial year', value: plan.fyLabel },
    {
      label: 'Units claimed',
      value:
        claimed.length === 0
          ? NO_VALUE
          : claimed
              .map((d) => `${unitName(d)} (serial ${d.serialNo}), ${plural(d.nozzles, 'nozzle')}`)
              .join('\n'),
    },
    { label: 'Certificate number', value: plan.certificateNo },
    { label: 'Calibration date', value: formatYmd(plan.calibrationDate) },
    { label: 'Validity date', value: formatYmd(plan.validityDate) },
    { label: 'Receipt number', value: plan.receiptNo },
    { label: 'Receipt date', value: formatYmd(plan.receiptDate) },
    {
      label: 'Amount',
      value: `${formatInrWhole(plan.amountPerNozzle)} × ${plural(plan.nozzleCount, 'nozzle')} = ${formatInrWhole(plan.totalAmount)}`,
    },
  ];
}

/** The units the plan leaves out, each with the plain reason the plan gives. */
export function leftOutUnits(plan: ClaimPlan): string[] {
  return plan.dus
    .filter((d) => !d.include)
    .map((d) => `${unitName(d)} (serial ${d.serialNo}): ${d.reason}`);
}

/* ─────────────────────── units table ─────────────────────── */

/** Serial numbers are compared without spaces or leading zeros, and without case. */
export function normalizeSerial(serial: string): string {
  return serial.replace(/\s+/g, '').replace(/^0+/, '').toLowerCase();
}

export interface UnitRow {
  key: string;
  serialNo: string;
  duNo: string | null;
  makeModel: string;
  nozzles: number | null;
  /** From the certificate. `null` when the unit is not on it. */
  verified: boolean | null;
  /** `null` while there is no plan to say. */
  included: boolean | null;
  reason: string;
}

function makeModel(make: string | null, model: string | null): string {
  return [make, model].filter(Boolean).join(' ') || NO_VALUE;
}

/**
 * One row per dispensing unit the claim knows about: the plan's units, then any
 * unit on the certificate the plan does not mention, then any unit SDMS lists
 * that is on neither. With no plan yet the rows are the certificate's units and
 * say so, rather than guessing which will be claimed.
 */
export function buildUnitRows(claim: CalibrationClaimView): UnitRow[] {
  const instruments = claim.certificate?.instruments ?? [];
  const byCert = new Map(instruments.map((i) => [normalizeSerial(i.serialNo), i]));
  const rows: UnitRow[] = [];
  const seen = new Set<string>();

  if (claim.plan) {
    for (const du of claim.plan.dus) {
      const norm = normalizeSerial(du.serialNo);
      seen.add(norm);
      rows.push({
        key: `plan-${norm}`,
        serialNo: du.serialNo,
        duNo: du.duNo,
        makeModel: makeModel(du.make, du.model),
        nozzles: du.nozzles,
        verified: byCert.get(norm)?.verified ?? null,
        included: du.include,
        reason: du.reason,
      });
    }
  }

  const portalByNorm = new Map(
    (claim.portal?.dus ?? []).map((d) => [normalizeSerial(d.serialNo), d]),
  );
  for (const inst of instruments) {
    const norm = normalizeSerial(inst.serialNo);
    if (seen.has(norm)) continue;
    seen.add(norm);
    rows.push({
      key: `cert-${norm}`,
      serialNo: inst.serialNo,
      duNo: portalByNorm.get(norm)?.duNo ?? null,
      makeModel: makeModel(inst.make, inst.model),
      nozzles: inst.nozzles.length,
      verified: inst.verified,
      included: claim.plan ? false : null,
      reason: claim.plan ? 'Not in the plan.' : 'The plan is not made yet.',
    });
  }

  for (const du of claim.portal?.dus ?? []) {
    const norm = normalizeSerial(du.serialNo);
    if (seen.has(norm)) continue;
    seen.add(norm);
    rows.push({
      key: `portal-${norm}`,
      serialNo: du.serialNo,
      duNo: du.duNo,
      makeModel: makeModel(du.make, du.model),
      nozzles: du.nozzles,
      verified: null,
      included: false,
      reason: 'On IndianOil’s list, but not on the certificate.',
    });
  }
  return rows;
}

/* ─────────────────────── checks ─────────────────────── */

/** A failed check an admin has not yet accepted that stops the claim. */
export function blockingChecks(claim: Pick<CalibrationClaimView, 'checks'>): ClaimCheck[] {
  return claim.checks.filter((c) => !c.ok && c.level === 'block' && !c.acknowledged);
}

/** A failed warning or block can be accepted after a look; a plain fact cannot. */
export function canAcknowledge(check: ClaimCheck): boolean {
  return !check.ok && check.level !== 'info' && !check.acknowledged;
}

const LEVEL_RANK: Record<ClaimCheck['level'], number> = { block: 0, warn: 1, info: 2 };

/**
 * Failed checks first — blocks, then warnings, then facts — and the ones that
 * passed after them, each group keeping the order the server sent.
 */
export function sortChecks(checks: readonly ClaimCheck[]): {
  failed: ClaimCheck[];
  passed: ClaimCheck[];
} {
  const failed = checks
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.ok)
    .sort((a, b) => LEVEL_RANK[a.c.level] - LEVEL_RANK[b.c.level] || a.i - b.i)
    .map(({ c }) => c);
  const passed = checks.filter((c) => c.ok);
  return { failed, passed };
}

/* ─────────────────────── what each button may do ─────────────────────── */

export interface Gate {
  ok: boolean;
  /** Why not, in a sentence — printed under the button. `null` when allowed. */
  reason: string | null;
}

const YES: Gate = { ok: true, reason: null };
const no = (reason: string): Gate => ({ ok: false, reason });

export interface ClaimGates {
  approve: Gate;
  unapprove: Gate;
  file: Gate;
  finalize: Gate;
  corrections: Gate;
  reviewLetter: Gate;
  fetchDocuments: Gate;
  portalCheck: Gate;
  retry: Gate;
  askOwner: Gate;
  upload: Gate;
  resendLetter: Gate;
  remindLetter: Gate;
  markFiled: Gate;
  cancel: Gate;
}

const BUSY = 'It is working on this now. Wait for it to finish.';

/**
 * True when a signed letter PDF is on the claim, however it got there: accepted
 * from the owner, or uploaded by an admin. This, with an approval, is all the
 * server's "file" action asks of the letter. `claim.documents` lists only the
 * current papers, so a replaced one does not count.
 */
export function signedLetterIn(claim: Pick<CalibrationClaimView, 'documents'>): boolean {
  return claim.documents.some((d) => d.slot === 'signedLetterPdf');
}

/**
 * The body of the Approve press: the choice about Finalize, and the fingerprint of
 * the plan this admin was looking at. The server approves only when the plan it
 * computes now has the same fingerprint, so an approval can never land on figures
 * that changed (a new look at IndianOil, another admin's correction) after the
 * admin read them. A claim with no plan has nothing to approve and sends none.
 */
export function approveAction(
  claim: Pick<CalibrationClaimView, 'planHash'>,
  finalize: boolean,
): Extract<CalibrationClaimActionInput, { type: 'approve' }> {
  return claim.planHash
    ? { type: 'approve', finalize, planHash: claim.planHash }
    : { type: 'approve', finalize };
}

function closedReason(claim: Pick<CalibrationClaimView, 'stage'>): string {
  return claim.stage === 'cancelled' ? 'This claim was cancelled.' : 'This claim is finalized.';
}

/**
 * What each admin button on a claim may do right now, and the reason when it may
 * not. This mirrors the server's own rules so a button is dead for a reason the
 * admin can read; the server stays the authority and still refuses in words if a
 * press slips through.
 */
export function claimGates(claim: CalibrationClaimView): ClaimGates {
  const closed = isClosed(claim);
  // Only a run that is really in flight makes the claim busy. A step that is merely
  // queued (`claim.queued`) leaves every button as it was: the server refuses only
  // while a run is live, and a queued step that cannot start (the service is paused)
  // is exactly when an admin needs Retry.
  const working = !!claim.working;
  const sent = claim.stage === 'filing' || claim.stage === 'filed';

  const whenOpen = (gate: Gate): Gate => (closed ? no(closedReason(claim)) : gate);
  const idle = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (working) return no(BUSY);
    if (sent) return no('It has already gone to IndianOil.');
    return YES;
  };

  const approve = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (claim.approval) return no('Already approved.');
    if (sent) return no('It has already gone to IndianOil.');
    if (!claim.plan)
      return no('There is nothing to approve yet: the papers have not been turned into a plan.');
    const blocks = blockingChecks(claim).length;
    if (blocks > 0) {
      return no(
        `${plural(blocks, 'check')} failed. Fix ${blocks === 1 ? 'it' : 'them'} with Corrections, or accept ${blocks === 1 ? 'it' : 'them'} after a look.`,
      );
    }
    if (working) return no(BUSY);
    return YES;
  };

  const unapprove = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (!claim.approval) return no('It is not approved.');
    if (claim.stage === 'filing')
      return no('Filing has started, so the approval cannot be taken back.');
    if (claim.stage === 'filed') return no('It is already saved on IndianOil.');
    if (working) return no(BUSY);
    return YES;
  };

  const file = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (claim.stage === 'filing') return no('Filing is already running.');
    if (claim.stage === 'filed') return no('It is already saved on IndianOil. Use Finalize now.');
    if (!claim.approval) return no('Approve the claim first.');
    // The server needs the signed PDF on the claim, not the owner's request to be
    // accepted: a letter an admin uploaded by hand has no accepted request at all.
    if (!signedLetterIn(claim)) {
      return no(
        claim.letter.askState === 'SENT'
          ? 'Accept the signed letter first. Filing starts by itself once you do.'
          : 'The signed letter is not in yet. Accept the one the owner sends, or upload a signed copy. Filing starts by itself once it is in.',
      );
    }
    if (working) return no(BUSY);
    if (claim.stage !== 'ready') return no('The claim is not ready to file yet.');
    return YES;
  };

  const finalize = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (claim.stage === 'filing') return no('Filing is still running.');
    if (claim.stage !== 'filed') return no('Nothing is saved on IndianOil yet.');
    if (working) return no(BUSY);
    return YES;
  };

  const corrections = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (working) return no(BUSY);
    if (sent) return no('It has already gone to IndianOil, so a correction would change nothing.');
    return YES;
  };

  const reviewLetter = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (claim.letter.askState !== 'SENT') return no('The owner has not sent a signed letter.');
    if (working) return no(BUSY);
    return YES;
  };

  const resendLetter = (): Gate => {
    const base = idle();
    if (!base.ok) return base;
    if (!claim.letter.sentAt) return no('The letter has not been sent yet.');
    if (!claim.plan) return no('There is no plan to make the letter from yet.');
    return YES;
  };

  const remindLetter = (): Gate => {
    if (closed) return no(closedReason(claim));
    if (claim.letter.askState !== 'ASKED')
      return no('The owner has no letter waiting for a signature.');
    return YES;
  };

  return {
    approve: approve(),
    unapprove: unapprove(),
    file: file(),
    finalize: finalize(),
    corrections: corrections(),
    reviewLetter: reviewLetter(),
    fetchDocuments: idle(),
    portalCheck: idle(),
    // "Try again" is for a step that stopped, and a filing that stopped is still in
    // the filing stage, so it cannot be held to the "not sent yet" rule.
    retry: closed ? no(closedReason(claim)) : working ? no(BUSY) : YES,
    askOwner: whenOpen(YES),
    upload: whenOpen(YES),
    resendLetter: resendLetter(),
    remindLetter: remindLetter(),
    markFiled: whenOpen(YES),
    cancel: whenOpen(YES),
  };
}

/* ─────────────────────── what fixes a blocker ─────────────────────── */

export type BlockerFix =
  | 'retry'
  | 'fetch'
  | 'ask_login'
  | 'ask_documents'
  | 'upload'
  | 'corrections'
  | 'portal_check';

export const BLOCKER_FIX_LABEL: Record<BlockerFix, string> = {
  retry: 'Retry',
  fetch: 'Fetch papers now',
  ask_login: 'Ask the owner for the eMaaptaul login',
  ask_documents: 'Ask the owner to send the papers',
  upload: 'Upload the papers',
  corrections: 'Corrections',
  portal_check: 'Check SDMS again',
};

/** The gate that decides whether a blocker's button may be pressed. */
export function gateForFix(gates: ClaimGates, fix: BlockerFix): Gate {
  switch (fix) {
    case 'retry':
      return gates.retry;
    case 'fetch':
      return gates.fetchDocuments;
    case 'ask_login':
    case 'ask_documents':
      return gates.askOwner;
    case 'upload':
      return gates.upload;
    case 'corrections':
      return gates.corrections;
    case 'portal_check':
      return gates.portalCheck;
  }
}

const LOGIN_CODE = /LOGIN|PASSWORD|REFUS|ACCOUNT|OTP|MOBILE|WEMMIS|CRED/i;
const CHECK_CODE = /CHECK|REVIEW|OVERRIDE|BLOCK|PLAN|UNIT|DU_|CERTIFICATE_USED|SERIAL/i;
const EXISTS_CODE = /EXIST|ALREADY|DRAFT|DEALER_CODE|MISMATCH|CLAIM_/i;

/**
 * The server's own blocker codes (`mdg-backend/src/services/calibrationClaim/
 * blockers.ts`), each with the buttons its sentence tells the admin to press. A
 * code missing here falls back to the stage-and-pattern guess below.
 */
const FIXES_BY_CODE: Readonly<Record<string, BlockerFix[]>> = {
  wemmis_login_missing: ['ask_login', 'ask_documents'],
  documents_not_found: ['ask_documents', 'upload'],
  certificate_unreadable: ['upload', 'ask_documents'],
  certificate_needs_values: ['upload'],
  receipt_unreadable: ['upload', 'ask_documents'],
  receipt_needs_values: ['upload', 'corrections'],
  papers_missing: ['fetch', 'upload'],
  check_failed: ['corrections', 'portal_check'],
  du_mismatch: ['portal_check', 'corrections'],
  multiple_receipts_upload: ['upload', 'retry'],
  claim_already_exists: ['portal_check'],
  draft_not_found: ['portal_check', 'retry'],
  signed_letter_unreadable: ['upload'],
  sdms_credentials_missing: ['retry'],
  sdms_password_refused: ['retry'],
};

/**
 * The one or two buttons that fix what is holding a claim up, best first.
 *
 * The claim carries the sentence (`blocker.message`) and a stable code; a known
 * code gets the buttons its sentence names, anything else is chosen from where
 * the claim is stuck. Anything not recognised gets "Try again" — which the
 * server accepts for whatever step stopped — so a new code never leaves an
 * admin with no button.
 */
export function blockerFixes(
  claim: Pick<CalibrationClaimView, 'stage' | 'blocker' | 'checks'>,
  wemmisSaved: boolean,
): BlockerFix[] {
  const code = claim.blocker?.code ?? '';
  const known = FIXES_BY_CODE[code];
  if (known) return known;
  switch (claim.stage) {
    case 'documents':
      if (LOGIN_CODE.test(code) || !wemmisSaved) return ['ask_login', 'upload'];
      return ['fetch', 'upload'];
    case 'review':
      if (blockingChecks(claim).length > 0 || CHECK_CODE.test(code))
        return ['corrections', 'portal_check'];
      return ['retry', 'portal_check'];
    case 'letter':
      return ['retry'];
    default:
      if (EXISTS_CODE.test(code)) return ['portal_check', 'retry'];
      return ['retry'];
  }
}

/* ─────────────────────── papers ─────────────────────── */

export const SLOT_ORDER: readonly ClaimDocumentSlot[] = [
  'certificate',
  'receipt',
  'letter',
  'signedLetter',
  'signedLetterPdf',
];

export const SLOT_LABEL: Record<ClaimDocumentSlot, string> = {
  certificate: 'Certificate of Verification',
  receipt: 'Treasury receipt',
  letter: 'Request letter',
  signedLetter: 'Signed letter',
  signedLetterPdf: 'Signed letter as a PDF for IndianOil',
};

export const SOURCE_LABEL: Record<ClaimDocumentSource, string> = {
  wemmis: 'Downloaded from eMaaptaul',
  dealer: 'Sent by the owner',
  admin: 'Uploaded by an admin',
  generated: 'Made by MDG',
};

/** The papers an admin may upload by hand. */
export function isUploadSlot(slot: ClaimDocumentSlot): slot is ClaimUploadSlot {
  return (CLAIM_UPLOAD_SLOTS as readonly string[]).includes(slot);
}

/** The server refuses a paper over 10 MB (`claimDocumentUploadSchema`). */
export const CLAIM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Why a chosen file cannot be uploaded, or `null` when it can. Checked when the
 * file is picked: a 12 MB scan over a slow line is a wasted wait followed by a
 * refusal.
 */
export function claimUploadProblem(
  file: { name: string; size: number; contentType: string },
  allowedTypes: readonly string[],
): string | null {
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > CLAIM_UPLOAD_MAX_BYTES) {
    return `${file.name} is larger than ${Math.round(CLAIM_UPLOAD_MAX_BYTES / (1024 * 1024))} MB. Send a smaller scan or photo.`;
  }
  if (!allowedTypes.includes(file.contentType)) {
    return 'Send the paper as a PDF, or as a JPEG, PNG or WebP photo.';
  }
  return null;
}

/** "128 KB" / "2.4 MB" for a file chip. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─────────────────────── the letter ─────────────────────── */

export interface LetterStatus {
  label: string;
  intent: Intent;
  detail: string;
}

/**
 * Where the request letter stands, from the claim's side. The letter is made and
 * sent once the papers are read and checked; then it waits for the owner's
 * signature, comes back, and an admin accepts it or sends it back.
 */
export function letterStatus(letter: CalibrationClaimView['letter']): LetterStatus {
  const reminders =
    letter.reminders > 0 ? ` ${plural(letter.reminders, 'reminder')} sent so far.` : '';
  if (!letter.sentAt) {
    return {
      label: 'Not sent yet',
      intent: 'neutral',
      detail: 'The letter is made and sent to the owners once the papers are read and checked.',
    };
  }
  const when = formatDateTime(letter.sentAt);
  switch (letter.askState) {
    case 'ASKED':
      return {
        label: 'Waiting for the owner',
        intent: 'warning',
        detail: `Sent ${when}.${reminders}`,
      };
    case 'SENT':
      return {
        label: 'The owner sent it back',
        intent: 'info',
        detail: 'Check the signature and the stamp, then accept it or send it back.',
      };
    case 'ACCEPTED':
      return {
        label: 'Accepted',
        intent: 'success',
        detail: `Sent ${when}. The signed copy is accepted.`,
      };
    case 'REJECTED':
      return {
        label: 'Sent back to the owner',
        intent: 'warning',
        detail: 'Waiting for a new signed copy.',
      };
    case 'EXPIRED':
    case 'WITHDRAWN':
      return {
        label: 'No longer waiting',
        intent: 'neutral',
        detail: `Sent ${when}. The request was closed — resend the letter to ask again.`,
      };
    default:
      return { label: 'Sent', intent: 'neutral', detail: `Sent ${when}.` };
  }
}

/* ─────────────────────── values read, with corrections ─────────────────────── */

export interface ValueRow {
  key: string;
  label: string;
  value: string;
  /** Set when an admin's correction is in force: what the paper said. */
  readAs?: string;
  mono?: boolean;
  copyable?: boolean;
}

function ymdText(ymd: string | null | undefined): string {
  return ymd ? formatYmd(ymd) : NO_VALUE;
}

/**
 * The values read off the two papers, with an admin's correction shown in place
 * of the reading (and the reading kept beside it), so what is printed is what
 * the claim will use.
 */
export function valueRows(claim: CalibrationClaimView): ValueRow[] {
  const cert = claim.certificate;
  const receipt = claim.receipt;
  const ov = claim.overrides;
  const rows: ValueRow[] = [];

  const add = (
    key: string,
    label: string,
    read: string | null | undefined,
    override: string | undefined,
    opts: { mono?: boolean; copyable?: boolean; date?: boolean } = {},
  ) => {
    const show = (v: string | null | undefined) => (opts.date ? ymdText(v) : v || NO_VALUE);
    const corrected = override !== undefined && override !== '';
    rows.push({
      key,
      label,
      value: show(corrected ? override : read),
      ...(corrected ? { readAs: show(read) } : {}),
      ...(opts.mono ? { mono: true } : {}),
      ...(opts.copyable ? { copyable: true } : {}),
    });
  };

  add('cert-no', 'Certificate number', cert?.vcNumber, ov.certificateNo, {
    mono: true,
    copyable: true,
  });
  add('cal-date', 'Calibration date', cert?.calibrationDate, ov.calibrationDate, { date: true });
  add('valid', 'Valid until', cert?.validityDate, ov.validityDate, { date: true });
  rows.push({
    key: 'next-due',
    label: 'Next verification, as printed',
    value: cert?.nextVerificationText || NO_VALUE,
  });
  add('receipt-no', 'Receipt number', receipt?.receiptNo ?? cert?.receiptNumbers[0], ov.receiptNo, {
    mono: true,
    copyable: true,
  });
  add('receipt-date', 'Receipt date', receipt?.date, ov.receiptDate, { date: true });
  rows.push({
    key: 'receipt-amount',
    label: 'Amount paid',
    value: receipt?.amount != null ? formatInrWhole(receipt.amount) : NO_VALUE,
  });
  rows.push({
    key: 'grand-total',
    label: 'Total on the certificate',
    value: cert?.grandTotal != null ? formatInrWhole(cert.grandTotal) : NO_VALUE,
  });
  rows.push({
    key: 'officer',
    label: 'Officer',
    value:
      [cert?.officerName, cert?.inspectorNo ? `inspector ${cert.inspectorNo}` : null]
        .filter(Boolean)
        .join(', ') || NO_VALUE,
  });
  // The plan already has any correction applied; without a plan, show the correction itself.
  const perNozzle = claim.plan?.amountPerNozzle ?? ov.amountPerNozzle;
  rows.push({
    key: 'per-nozzle',
    label: 'Claimed per nozzle',
    value: perNozzle != null ? formatInrWhole(perNozzle) : NO_VALUE,
  });
  return rows;
}

/* ─────────────────────── the corrections form ─────────────────────── */

/** What the corrections form holds: every box a string, as typed. */
export interface CorrectionForm {
  certificateNo: string;
  validityDate: string;
  receiptNo: string;
  receiptDate: string;
  calibrationDate: string;
  amountPerNozzle: string;
  excludeSerials: string[];
}

/** The form as it opens: each box holds the correction already in force, or is empty. */
export function correctionFormFrom(overrides: ClaimOverrides): CorrectionForm {
  return {
    certificateNo: overrides.certificateNo ?? '',
    validityDate: overrides.validityDate ?? '',
    receiptNo: overrides.receiptNo ?? '',
    receiptDate: overrides.receiptDate ?? '',
    calibrationDate: overrides.calibrationDate ?? '',
    amountPerNozzle: overrides.amountPerNozzle != null ? String(overrides.amountPerNozzle) : '',
    excludeSerials: [...(overrides.excludeSerials ?? [])],
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export type CorrectionResult =
  | { ok: true; payload: ClaimOverridesInput }
  | { ok: false; problem: string };

/**
 * What to send for the corrections form: only the boxes the admin changed. An
 * empty box that had a correction sends the empty value, which is how the server
 * is told to drop it; an empty box that never had one sends nothing.
 */
export function correctionPayload(form: CorrectionForm, current: ClaimOverrides): CorrectionResult {
  const before = correctionFormFrom(current);
  const payload: ClaimOverridesInput = {};

  const text = (key: 'certificateNo' | 'receiptNo', label: string): string | null => {
    const v = form[key].trim();
    if (v === before[key]) return null;
    if (v.length > 40) return `${label} is too long (40 characters at most).`;
    payload[key] = v;
    return null;
  };
  const date = (
    key: 'validityDate' | 'receiptDate' | 'calibrationDate',
    label: string,
  ): string | null => {
    const v = form[key].trim();
    if (v === before[key]) return null;
    if (v !== '' && !YMD.test(v)) return `${label} must be a date.`;
    payload[key] = v;
    return null;
  };

  const problem =
    text('certificateNo', 'The certificate number') ??
    text('receiptNo', 'The receipt number') ??
    date('calibrationDate', 'The calibration date') ??
    date('validityDate', 'The validity date') ??
    date('receiptDate', 'The receipt date');
  if (problem) return { ok: false, problem };

  const amount = form.amountPerNozzle.trim();
  if (amount !== before.amountPerNozzle) {
    if (amount === '') {
      payload.amountPerNozzle = null;
    } else {
      const n = Number(amount);
      if (!Number.isInteger(n) || n < 1 || n > 100_000) {
        return {
          ok: false,
          problem: 'The amount per nozzle must be a whole number of rupees, from 1 to 1,00,000.',
        };
      }
      payload.amountPerNozzle = n;
    }
  }

  if (!sameSet(form.excludeSerials, before.excludeSerials)) {
    payload.excludeSerials = [...form.excludeSerials];
  }

  if (Object.keys(payload).length === 0) return { ok: false, problem: 'Nothing has been changed.' };
  return { ok: true, payload };
}

export interface ExclusionChoice {
  serialNo: string;
  label: string;
}

/**
 * The units an admin may leave out, by the serial number printed on the
 * certificate — the key the server matches on. The certificate's own units when
 * it has been read, else the plan's.
 */
export function exclusionChoices(claim: CalibrationClaimView): ExclusionChoice[] {
  const fromCertificate = claim.certificate?.instruments ?? [];
  if (fromCertificate.length > 0) {
    return fromCertificate.map((i) => ({
      serialNo: i.serialNo,
      label: `Serial ${i.serialNo}${i.make || i.model ? ` · ${makeModel(i.make, i.model)}` : ''} · ${plural(i.nozzles.length, 'nozzle')}`,
    }));
  }
  return (claim.plan?.dus ?? []).map((d) => ({
    serialNo: d.serialNo,
    label: `${unitName(d)} · serial ${d.serialNo} · ${plural(d.nozzles, 'nozzle')}`,
  }));
}

/* ─────────────────────── reasons and notes ─────────────────────── */

/**
 * Why a typed reason or note is not good enough, or `null`. The server wants at
 * least four letters and refuses a long essay; saying so before the press keeps
 * a rejected form from losing what was typed.
 */
export function reasonProblem(text: string, max: number): string | null {
  const t = text.trim();
  if (t.length < 4) return 'Say why, in a few words (at least 4 letters).';
  if (t.length > max) return `Keep it under ${max} characters. It is ${t.length} now.`;
  return null;
}

/* ─────────────────────── history ─────────────────────── */

/** Newest first, whatever order the server sent. */
export function historyNewestFirst(
  history: CalibrationClaimView['history'],
): CalibrationClaimView['history'] {
  return [...history].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/* ─────────────────────── the eMaaptaul login, in words ─────────────────────── */

export function wemmisSetVia(via: 'admin' | 'dealer' | 'reset' | null): string {
  switch (via) {
    case 'admin':
      return 'Typed in by an admin';
    case 'dealer':
      return 'Typed in by the owner in the app';
    case 'reset':
      return 'Reset by the owner with a one-time code';
    default:
      return NO_VALUE;
  }
}
