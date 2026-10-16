/**
 * Everything the DSR share window DECIDES, as plain functions: which choices are
 * dead and why, what a send would add, who still holds an old copy, what the
 * button says, what the toast says.
 *
 * Pure on purpose. This app has no test runner, so a rule that lived inside a
 * component could only be checked by eye — and this window is the last thing
 * between an admin and a message that cannot be taken back. The components
 * (`DsrShareDialog`, `DsrShareSection`) only render what these return.
 *
 * Words: a DSR is two sheets. `sales` is "Daily sales", `variation` is "Stock
 * variation". Who can get one is split in two sides — the OWNERS (each in their
 * own private chat) and the MANAGER (the outlet's one group chat, which every
 * owner can also read).
 */
import {
  audienceFromSides,
  audienceSides,
  describeHolders,
  describeShareRecipients,
  DSR_SHEET_AUDIENCE_LABELS,
  DSR_SHEET_LABELS,
  DSR_SHEETS,
  dsrPlanSendsAnything,
  dsrSendPreview,
  type DsrShareOutcome,
  type DsrShareStatus,
  type DsrSheet,
  type DsrSheetAudience,
  type DsrSheetHolders,
  type DsrSheetPlan,
} from '@dk/shared';

/** The two sides of an outlet a sheet can go to. */
export type ShareSide = 'owners' | 'manager';

/** Who holds which sheet — what the server's status and outcome both carry. */
export type SheetHolders = Record<DsrSheet, DsrSheetHolders>;

/** Who is on the app right now. */
export type OutletPeople = DsrShareStatus['outlet'];

/* ─────────────────────────────── Words ─────────────────────────────── */

/** "daily sales", "stock variation" — a sheet's name inside a sentence. */
export function sheetName(sheet: DsrSheet): string {
  return DSR_SHEET_LABELS[sheet].toLowerCase();
}

/** "both sheets", "daily sales" — the sheets in a list, for a summary line. */
function sheetsPhrase(sheets: DsrSheet[]): string {
  if (sheets.length >= DSR_SHEETS.length) return 'both sheets';
  return sheets.map(sheetName).join(' and ');
}

/** "1 owner", "2 owners". */
function ownersPhrase(n: number): string {
  return n === 1 ? '1 owner' : `${n} owners`;
}

/** The sentence shown when a hold stops a send: it covers the whole report. */
export const HOLD_APPLIES_TO_BOTH_SHEETS =
  'The hold covers both sheets, so neither one can be sent until it is cleared.';

/* ───────────────────────── Who can be reached ───────────────────────── */

/** Whether anybody of this side is on the app, and if not, the reason in words. */
export function sideAvailability(
  side: ShareSide,
  outlet: OutletPeople,
): { available: boolean; reason: string | null } {
  if (side === 'owners') {
    return outlet.owners > 0
      ? { available: true, reason: null }
      : { available: false, reason: 'No owner on the app yet' };
  }
  return outlet.manager
    ? { available: true, reason: null }
    : { available: false, reason: 'No manager on the app yet' };
}

/** The sentence for an outlet with nobody on the app at all, else null. */
export function nobodyOnApp(outlet: OutletPeople): string | null {
  return outlet.owners === 0 && !outlet.manager
    ? 'Nobody from this outlet is on the app yet, so there is nobody to send to.'
    : null;
}

/** The plan with every side nobody is on the app for taken out. */
export function clampPlan(plan: DsrSheetPlan, outlet: OutletPeople): DsrSheetPlan {
  const one = (a: DsrSheetAudience): DsrSheetAudience => {
    const s = audienceSides(a);
    return audienceFromSides(s.owners && outlet.owners > 0, s.managers && outlet.manager);
  };
  return { sales: one(plan.sales), variation: one(plan.variation) };
}

/** The plan after one side of one sheet is ticked or unticked. */
export function withSide(
  plan: DsrSheetPlan,
  sheet: DsrSheet,
  side: ShareSide,
  on: boolean,
): DsrSheetPlan {
  const s = audienceSides(plan[sheet]);
  const owners = side === 'owners' ? on : s.owners;
  const managers = side === 'manager' ? on : s.managers;
  return { ...plan, [sheet]: audienceFromSides(owners, managers) };
}

/** True when the two plans send the same sheets to the same people. */
export function plansEqual(a: DsrSheetPlan, b: DsrSheetPlan): boolean {
  return a.sales === b.sales && a.variation === b.variation;
}

/** Whether a side is ticked for a sheet. */
export function sideTicked(plan: DsrSheetPlan, sheet: DsrSheet, side: ShareSide): boolean {
  const s = audienceSides(plan[sheet]);
  return side === 'owners' ? s.owners : s.managers;
}

/** The plan the window opens with: the server's suggestion, held to who is on the app. */
export function initialPlan(status: DsrShareStatus): DsrSheetPlan {
  return clampPlan(status.suggested, status.outlet);
}

/* ───────────────────────────── Quick choices ───────────────────────────── */

export type SharePresetId = 'owners' | 'everyone' | 'split';

export interface SharePreset {
  id: SharePresetId;
  label: string;
  plan: DsrSheetPlan;
}

/** The three one-tap choices on top of the window. */
export const SHARE_PRESETS: readonly SharePreset[] = [
  {
    id: 'owners',
    label: 'Everything to owners',
    plan: { sales: 'owners', variation: 'owners' },
  },
  {
    id: 'everyone',
    label: 'Everything to owners and manager',
    plan: { sales: 'both', variation: 'both' },
  },
  {
    id: 'split',
    label: 'Sales to both, variation to owners only',
    plan: { sales: 'both', variation: 'owners' },
  },
];

/**
 * Whether a quick choice can be used at this outlet. One that names a side
 * nobody is on the app for is dead, with the reason as text — a button that
 * quietly sent something narrower than its label would be a lie.
 */
export function presetState(
  preset: SharePreset,
  outlet: OutletPeople,
): { disabled: boolean; reason: string | null } {
  const wanted = DSR_SHEETS.map((s) => audienceSides(preset.plan[s]));
  const wantsOwners = wanted.some((w) => w.owners);
  const wantsManager = wanted.some((w) => w.managers);
  if (wantsOwners && outlet.owners === 0) {
    return { disabled: true, reason: 'No owner on the app yet' };
  }
  if (wantsManager && !outlet.manager) {
    return { disabled: true, reason: 'No manager on the app yet' };
  }
  return { disabled: false, reason: null };
}

/* ───────────────────────── What each sheet shows ───────────────────────── */

/** "Has it: 2 owners and the manager." — or the honest version when counts may be short. */
export function holdersLine(held: DsrSheetHolders, unrecorded: boolean): string {
  const who = describeHolders(held);
  if (who === 'nobody') {
    return unrecorded ? 'Nobody on record has it (counts may be short).' : 'Nobody has it yet.';
  }
  return `Has it: ${who}${unrecorded ? ' (counts may be short)' : ''}.`;
}

/** The current choice for a sheet, in the words at the head of its block. */
export function choiceLabel(audience: DsrSheetAudience, held: DsrSheetHolders): string {
  if (audience === 'none') {
    return describeHolders(held) === 'nobody' ? DSR_SHEET_AUDIENCE_LABELS.none : 'Nothing added';
  }
  return DSR_SHEET_AUDIENCE_LABELS[audience];
}

/** The line under one tick box: who it is, or why it is dead. */
export function sideHint(
  side: ShareSide,
  held: DsrSheetHolders,
  outlet: OutletPeople,
): string {
  const avail = sideAvailability(side, outlet);
  if (!avail.available) return avail.reason ?? '';
  if (side === 'owners') {
    const n = Math.min(held.owners, outlet.owners);
    if (n >= outlet.owners) {
      return outlet.owners === 1 ? 'The owner has it already' : `All ${outlet.owners} owners have it already`;
    }
    if (n > 0) return `${n} of ${outlet.owners} owners have it`;
    return outlet.owners === 1 ? "The owner's own chat" : `Each of the ${outlet.owners} owners, in their own chat`;
  }
  return held.manager
    ? 'The manager has it already'
    : 'The group chat. Owners can read it there, with no ping';
}

/* ─────────────────────────── What a send adds ─────────────────────────── */

export interface SendSummary {
  /** One plain line per side that gets something new. Never empty. */
  lines: string[];
  /** True when nobody would receive anything they do not already have. */
  addsNothing: boolean;
  /** Who it reaches, for the button: "2 owners and the manager". Empty when nobody. */
  reach: string;
}

/** "2 owners", "the manager", "2 owners and the manager" — who a send adds. */
function reachOf(added: SheetHolders): string {
  const counts = DSR_SHEETS.map((s) => added[s].owners).filter((n) => n > 0);
  const manager = DSR_SHEETS.some((s) => added[s].manager);
  const parts: string[] = [];
  if (counts.length > 0) {
    // A count only when every sheet agrees on it; otherwise the people differ
    // from sheet to sheet and a number would be a guess.
    parts.push(counts.every((n) => n === counts[0]) ? ownersPhrase(counts[0] as number) : 'the owners');
  }
  if (manager) parts.push('the manager');
  return parts.join(' and ');
}

/**
 * What this plan would ADD, side by side. A sheet somebody already holds is not
 * sent to them again, so "Owners: both sheets" only appears for the sheets some
 * owner is still missing.
 */
export function sendSummary(status: DsrShareStatus, plan: DsrSheetPlan): SendSummary {
  const added = dsrSendPreview(status, plan);
  const toOwners = DSR_SHEETS.filter((s) => added[s].owners > 0);
  const toManager = DSR_SHEETS.filter((s) => added[s].manager);
  const lines: string[] = [];
  if (toOwners.length > 0) lines.push(`Owners: ${sheetsPhrase(toOwners)} in their own chat.`);
  if (toManager.length > 0) {
    lines.push(`Manager: ${sheetsPhrase(toManager)} in the group chat. Owners can read it there, with no ping.`);
  }
  if (lines.length === 0) {
    lines.push(
      dsrPlanSendsAnything(plan)
        ? 'Nothing new: everyone chosen already has these sheets.'
        : 'Nothing is chosen yet.',
    );
  }
  return { lines, addsNothing: toOwners.length === 0 && toManager.length === 0, reach: reachOf(added) };
}

/** What the window's Send button says. */
export function sendButtonLabel(summary: SendSummary, plan: DsrSheetPlan): string {
  if (!summary.addsNothing) return `Send to ${summary.reach}`;
  return dsrPlanSendsAnything(plan) ? 'Nothing new to send' : 'Choose who gets what';
}

/** Every sheet to everyone: what a send would be with no rule and nothing held back. */
const EVERYTHING: DsrSheetPlan = { sales: 'both', variation: 'both' };

/**
 * Whether the report still has somebody to be sent to.
 *
 * With a saved rule the question is whether the RULE is met: judged against the
 * rule, held to who is on the app. Judged against "both sheets to everyone" an
 * outlet that keeps stock variation from the manager always had one more thing
 * to send — the manager never holds that sheet — so a report sent exactly as the
 * rule says kept offering "Send to more people". Without a rule, the fullest plan
 * the outlet allows: false only when every person on the app holds both sheets.
 */
export function canSendMore(status: DsrShareStatus): boolean {
  const wanted =
    status.rule && dsrPlanSendsAnything(status.rule) ? status.rule : EVERYTHING;
  return !sendSummary(status, clampPlan(wanted, status.outlet)).addsNothing;
}

/** The section's button: the first send, or a top-up. */
export function triggerLabel(sentBefore: boolean): string {
  return sentBefore ? 'Send to more people' : 'Share with dealer';
}

/** The quieter button for a report that has everything its rule asks for. */
export const CHANGE_WHO_LABEL = 'Change who has it';

/**
 * What the Share section offers once it knows who is on the app:
 *
 *  - `send`   — the first send, or somebody the report has not reached yet
 *               ("Send to more people").
 *  - `change` — the rule is met, but a one-off override is still possible (tick
 *               the manager for the variation sheet). The same window opens; the
 *               button is quieter and says what it is for.
 *  - `none`   — nothing to offer, with the sentence that says why.
 */
export type ShareEntry =
  | { kind: 'send'; label: string }
  | { kind: 'change'; label: string; note: string }
  | { kind: 'none'; note: string };

export function shareEntry(status: DsrShareStatus | undefined, sentBefore: boolean): ShareEntry {
  if (!sentBefore || !status) return { kind: 'send', label: triggerLabel(sentBefore) };
  // Nobody at all on the app: a button here would open a window with nobody to pick.
  const noOne = nobodyOnApp(status.outlet);
  if (noOne) return { kind: 'none', note: noOne };
  if (canSendMore(status)) return { kind: 'send', label: triggerLabel(true) };
  // Everyone the rule names has their sheets. If the fullest plan would still add
  // something, the admin may want to override the rule for this one report.
  const fullest = clampPlan(EVERYTHING, status.outlet);
  if (!sendSummary(status, fullest).addsNothing) {
    return {
      kind: 'change',
      label: CHANGE_WHO_LABEL,
      note: 'Everyone this outlet’s rule names has their sheets.',
    };
  }
  return { kind: 'none', note: 'Everyone on the app already has both sheets.' };
}

/** The sentence under the window's title. */
export function dialogDescription(sentBefore: boolean): string {
  return sentBefore
    ? 'Add people to a report already sent. Each person gets each sheet once. Nothing posted can be taken back.'
    : 'Pick who gets each sheet. Nothing posted can be taken back.';
}

/* ──────────────────────── Old copies, and the rule ──────────────────────── */

/**
 * A warning per sheet whose OLD copy is still with somebody this send does not
 * reach. A correction that goes to the owners but not the manager leaves the
 * manager looking at the wrong figures, and nothing else on screen says so.
 */
export function oldCopyWarnings(status: DsrShareStatus, plan: DsrSheetPlan): string[] {
  if (!status.oldHolders) return [];
  const out: string[] = [];
  for (const sheet of DSR_SHEETS) {
    const old = status.oldHolders[sheet];
    const sides = audienceSides(plan[sheet]);
    const staying: DsrSheetHolders = {
      owners: sides.owners ? 0 : old.owners,
      manager: sides.managers ? false : old.manager,
    };
    if (staying.owners > 0 || staying.manager) {
      out.push(
        `The old ${sheetName(sheet)} copy is still with ${describeHolders(staying)}. This send will not replace it.`,
      );
    }
  }
  return out;
}

/** "Daily sales: 2 owners and the manager" per sheet that somebody still holds an old copy of. */
export function oldHolderLines(old: NonNullable<DsrShareStatus['oldHolders']>): string[] {
  return DSR_SHEETS.filter((s) => old[s].owners > 0 || old[s].manager).map(
    (s) => `${DSR_SHEET_LABELS[s]}: ${describeHolders(old[s])}`,
  );
}

/** "Daily sales: 2 owners and the manager · Stock variation: 2 owners" — who has this version. */
export function holdersSummary(holders: SheetHolders, unrecorded = false): string {
  const text = DSR_SHEETS.map((s) => {
    const who = describeHolders(holders[s]);
    return `${DSR_SHEET_LABELS[s]}: ${who === 'nobody' ? 'not sent' : who}`;
  }).join(' · ');
  return unrecorded ? `${text} (counts may be short)` : text;
}

const AUDIENCE_WORDS: Record<DsrSheetAudience, string> = {
  none: 'not sent',
  owners: 'owners',
  managers: 'the manager',
  both: 'owners and manager',
};

/** "Daily sales → owners and manager · Stock variation → owners". */
export function describeRule(rule: DsrSheetPlan): string {
  return DSR_SHEETS.map((s) => `${DSR_SHEET_LABELS[s]} → ${AUDIENCE_WORDS[rule[s]]}`).join(' · ');
}

/** A note when the saved rule names a side nobody is on the app for any more, else null. */
export function ruleReachNote(rule: DsrSheetPlan, outlet: OutletPeople): string | null {
  const wanted = DSR_SHEETS.map((s) => audienceSides(rule[s]));
  const missing: string[] = [];
  if (wanted.some((w) => w.owners) && outlet.owners === 0) missing.push('an owner');
  if (wanted.some((w) => w.managers) && !outlet.manager) missing.push('a manager');
  return missing.length > 0
    ? `The rule needs ${missing.join(' and ')}, and none is on the app yet.`
    : null;
}

/**
 * Whether to offer "Save this as the outlet's rule": only for a plan that sends
 * something and is not what the rule already says. An outlet with no rule differs
 * from every plan.
 */
export function offersSaveRule(plan: DsrSheetPlan, rule: DsrSheetPlan | null): boolean {
  if (!dsrPlanSendsAnything(plan)) return false;
  return !rule || !plansEqual(plan, rule);
}

/* ─────────────────────────────── The trigger ─────────────────────────────── */

/**
 * Whether the Share button is dead, and the reason as TEXT under it. A hold wins
 * over everything and says it covers both sheets; then the correctness check
 * still running; then not yet knowing who is on the app (the window is built
 * from it).
 */
export function triggerBlock(input: {
  held: boolean;
  /** `shareBlockedReason(...)`, the hold's own text, kept as written. */
  holdReason: string | null;
  verdictPending: boolean;
  statusState: 'ready' | 'loading' | 'failed';
}): { blocked: boolean; reason: string | null } {
  if (input.held) {
    return {
      blocked: true,
      reason: [input.holdReason, HOLD_APPLIES_TO_BOTH_SHEETS].filter(Boolean).join(' '),
    };
  }
  if (input.verdictPending) {
    return { blocked: true, reason: 'Checking this report before it can be sent…' };
  }
  if (input.statusState === 'loading') {
    return { blocked: true, reason: 'Checking who is on the app…' };
  }
  if (input.statusState === 'failed') {
    return {
      blocked: true,
      reason: 'Could not load who is on the app, so nothing can be sent yet. Reload to try again.',
    };
  }
  return { blocked: false, reason: null };
}

/** What the admin is told when the hold is found at the moment of the click. */
export function holdAtClickMessage(holdReason: string | null): string {
  return `${holdReason ?? 'This report is being withheld.'} ${HOLD_APPLIES_TO_BOTH_SHEETS}`;
}

/* ──────────────────────────────── The toast ──────────────────────────────── */

export interface ShareToast {
  title: string;
  description?: string;
  /** Warning when part of what was asked for did not go out. */
  tone: 'success' | 'warning' | 'info';
}

/**
 * What the admin is told after a send: who this send reached, who holds each
 * sheet now, and — in a warning tone — every part of the ask that did not go out.
 * A failed copy must never read like the harmless "no manager on the app" case.
 */
export function shareToast(result: DsrShareOutcome | undefined): ShareToast {
  if (!result) return { title: 'Sheets shared with the dealer.', tone: 'success' };
  const held = result.holders ? `${holdersSummary(result.holders)}.` : '';
  if (result.alreadyShared) {
    return {
      title: 'Nothing new to send.',
      description: held ? `Already with: ${held}` : 'This had already been sent.',
      tone: 'info',
    };
  }
  const notReached = result.notReached ?? [];
  const parts = [held, ...notReached].filter(Boolean);
  return {
    title: result.recipients ? describeShareRecipients(result.recipients) : 'Sheets shared with the dealer.',
    ...(parts.length > 0 ? { description: parts.join(' ') } : {}),
    tone: notReached.length > 0 ? 'warning' : 'success',
  };
}
