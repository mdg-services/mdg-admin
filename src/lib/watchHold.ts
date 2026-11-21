/**
 * The decidable parts of the watch period's screens (docs/specs/onboarding-v2.md
 * §5): the review queue of held messages, the "ready to start?" checklist, and the
 * extend-or-end prompt. Kept out of the components, as `lib/onboarding.ts` is, so
 * each rule is a plain function with a check beside it (`scripts/watchHold.check.ts`).
 *
 * Nothing here reaches a dealer. These are the words an admin reads.
 */
import type {
  ChecklistOpenDetails,
  HeldMessage,
  OutletSetupAdmin,
  SetupChecklistItem,
  SetupChecklistKey,
} from '@dk/shared';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package
// to its compiled `dist/`, which this one table is newer than.
import { HELD_MESSAGE_SOURCE_LABELS } from '../../shared/src/types/heldMessage';

// ── The review queue ────────────────────────────────────────────────────────

/** A drop needs a reason the next person can read; the server's own limits. */
export const DROP_REASON_MIN = 3;
export const DROP_REASON_MAX = 300;

export function dropProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < DROP_REASON_MIN) return 'Say why you are dropping it, so the next person knows.';
  if (r.length > DROP_REASON_MAX) return `Keep the reason under ${DROP_REASON_MAX} characters.`;
  return null;
}

export const dropBody = (reason: string): { reason: string } => ({ reason: reason.trim() });

/** Who the message would reach, in the words of the Share window. */
export function audienceLabel(a: HeldMessage['audience']): string {
  return a === 'owners' ? 'Owners' : a === 'manager' ? 'The manager' : 'Owners and the manager';
}

export const sourceLabel = (s: HeldMessage['source']): string => HELD_MESSAGE_SOURCE_LABELS[s];

/** "3h 5m", "42m", "2d 4h" — a stretch of time, whichever way it points. */
export function spanLabel(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * The line under a held message: how long it has waited and when it goes on its
 * own. A message past its time reads as such (the job drops it within 15 minutes).
 */
export function heldTimingLine(h: Pick<HeldMessage, 'heldAt' | 'expiresAt'>, now: number): string {
  const held = now - new Date(h.heldAt).getTime();
  const left = new Date(h.expiresAt).getTime() - now;
  const waited = held < 60_000 ? 'held just now' : `held ${spanLabel(held)} ago`;
  return left <= 0
    ? `${waited} · about to be dropped unsent`
    : `${waited} · dropped unsent in ${spanLabel(left)} if nobody decides`;
}

/** The queue's heading count: "3 waiting". */
export function heldHeadline(n: number): string {
  return n === 1 ? '1 message waiting' : `${n} messages waiting`;
}

/** "2 held" for the dealer's card; null when none. */
export function heldCountLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? '1 message held for review' : `${n} messages held for review`;
}

// ── The checklist ───────────────────────────────────────────────────────────

export const CHECKLIST_LABEL: Readonly<Record<SetupChecklistKey, string>> = {
  logins_working: 'Portal logins work',
  files_received: 'DSR starting figures set',
  services_attached: 'Services attached',
  kavach_started: 'Kavach started',
  first_run_ok: 'First run went well',
};

/**
 * A checklist line's words. A BPCL or HPCL outlet's login is saved, not tried (MDG's team
 * uses it by hand, and nothing signs in with it), so its line does not claim that it
 * "works". `byHand` is `isCompanyPortalOutlet(company)` from `lib/onboarding.ts`, passed in
 * so the two files do not import each other.
 */
export function checklistLabel(key: SetupChecklistKey, byHand: boolean): string {
  return key === 'logins_working' && byHand ? 'Portal login saved' : CHECKLIST_LABEL[key];
}

/** The lines that still stop a clean start. `not_needed` never does. */
export function missingChecklist(list: readonly SetupChecklistItem[]): SetupChecklistKey[] {
  return list.filter((i) => i.state === 'missing').map((i) => i.key);
}

/** "Ready to start", or how many lines are still open. Empty when the server sent no checklist. */
export function checklistSummary(list: readonly SetupChecklistItem[]): string {
  if (list.length === 0) return '';
  const missing = missingChecklist(list).length;
  if (missing === 0) return 'Ready to start';
  const done = list.filter((i) => i.state === 'done').length;
  return `${done} of ${done + missing} ready · ${missing} to do`;
}

/**
 * The lines a start waits for, as the admin sees them (ADR 0050): the logins and something
 * attached. Kavach is a gate line on the server too, but the start sets it up itself, so it
 * never asks a person for a reason; the DSR's figures and the first runs are prepared after
 * the start and never stop it.
 */
const START_GATE: readonly SetupChecklistKey[] = ['logins_working', 'services_attached'];

/** The start-gate lines that are open. */
export function missingStartGate(list: readonly SetupChecklistItem[]): SetupChecklistKey[] {
  return missingChecklist(list).filter((k) => START_GATE.includes(k));
}

/**
 * Does starting need a reason? Yes before the setup is at "setting up" (the wave-1
 * rule), and yes while a line the start waits for is open: the server refuses with
 * `CHECKLIST_OPEN` otherwise, and this form says so first.
 */
export function startNeedsReason(stage: OutletSetupAdmin['stage'], checklist: readonly SetupChecklistItem[]): boolean {
  return stage !== 'setup' || missingStartGate(checklist).length > 0;
}

/** Which keys a `CHECKLIST_OPEN` refusal named, or null when the error is something else. */
export function checklistOpenKeys(err: unknown): SetupChecklistKey[] | null {
  const e = err as { code?: unknown; details?: unknown } | null;
  if (!e || e.code !== 'CHECKLIST_OPEN') return null;
  const missing = (e.details as Partial<ChecklistOpenDetails> | undefined)?.missing;
  return Array.isArray(missing) ? missing : [];
}

/** Is a login line one an admin can ask to try again (not tried, or the try could not tell)? */
export function canRetryLoginCheck(item: SetupChecklistItem | undefined): boolean {
  if (!item || item.key !== 'logins_working' || item.state !== 'missing') return false;
  const d = item.detail ?? '';
  // A refusal is never retried; a login that is not saved has nothing to try.
  if (/refused|not saved yet/.test(d)) return false;
  return /not been tried yet|could not be tried|being tried/.test(d);
}

// ── The end of the watch ────────────────────────────────────────────────────

/**
 * The watch has run out and the outlet is STILL being watched: something was
 * dropped during it, so it does not go live by itself (plan §5). A person ends it
 * or extends it. (With nothing dropped the stage is already `live`.)
 */
export function watchNeedsDecision(
  o: Pick<OutletSetupAdmin, 'stage' | 'milestones'>,
  now: number,
): boolean {
  if (o.stage !== 'watch' || !o.milestones.watchUntil) return false;
  return new Date(o.milestones.watchUntil).getTime() <= now;
}

/**
 * A watch set to end only when a person ends it: an HPCL pump's, started with a watch of
 * ten years (`OPEN_WATCH_DAYS` on the server, owner 15 Nov 2026). Anything over a year
 * reads that way, so the screens say "until the team ends it", not a date in 2036.
 */
export const OPEN_WATCH_MS = 365 * 24 * 3_600_000;
export function watchEndsByHand(watchUntil: string | null | undefined, now: number): boolean {
  if (!watchUntil) return false;
  const t = Date.parse(watchUntil);
  return Number.isFinite(t) && t - now > OPEN_WATCH_MS;
}

export const WATCH_DECISION_TEXT =
  'The watch is over, but a message was dropped during it, so this outlet will not go live by itself. End the watch to make it live, or extend it.';
