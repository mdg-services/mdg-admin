import type { Intent } from '@/lib/statusIntent';
import type {
  ComplaintAdminRow,
  ComplaintAttention,
  ComplaintRoute,
  ComplaintStage,
} from '@dk/shared';

/** The four systems, in the words the team and the dealers use (ADR 0052). */
export const ROUTE_LABELS: Record<ComplaintRoute, string> = {
  eicts: 'Card machine (eICTS)',
  eracts: 'Automation (eRACTS)',
  du_stp: 'Dispenser (DU/STP)',
  efms: 'Other facility (EFMS)',
};

/** Shorter, for a chip beside other chips. */
export const ROUTE_SHORT: Record<ComplaintRoute, string> = {
  eicts: 'Card machine',
  eracts: 'Automation',
  du_stp: 'Dispenser',
  efms: 'Other facility',
};

export const ROUTE_ORDER: readonly ComplaintRoute[] = ['eicts', 'eracts', 'du_stp', 'efms'];

export const STAGE_WORDS: Record<ComplaintStage, string> = {
  drafting: 'Asking the dealer',
  confirming: 'Waiting for the dealer’s yes',
  filing: 'Filing now',
  filed: 'Filed',
  approved: 'Approved, no contractor yet',
  assigned: 'Engineer assigned',
  fixed_awaiting_ack: 'Fixed, dealer to confirm',
  acknowledging: 'Telling the portal',
  closed: 'Closed',
  reopened: 'Re-opened',
  rejected: 'Rejected',
  escalated: 'IndianOil does it itself',
  auto_closed: 'Closed by the system',
  cancelled: 'Dealer left it',
  expired: 'Yes ran out, not filed',
  not_filed: 'Not filed',
  unclear: 'Unclear, check the portal',
  duplicate: 'Already open',
  unknown_status: 'Status not known',
};

/** Green only for done; amber where the dealer or the team owes a step; red where a check stopped. */
export const STAGE_INTENT: Record<ComplaintStage, Intent> = {
  drafting: 'warning',
  confirming: 'warning',
  filing: 'info',
  filed: 'info',
  approved: 'info',
  assigned: 'info',
  fixed_awaiting_ack: 'warning',
  acknowledging: 'info',
  closed: 'success',
  reopened: 'warning',
  rejected: 'danger',
  escalated: 'info',
  auto_closed: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
  not_filed: 'danger',
  unclear: 'danger',
  duplicate: 'neutral',
  unknown_status: 'danger',
};

export const ATTENTION_WORDS: Record<ComplaintAttention, string> = {
  unclear_press:
    'Submit was pressed and the portal’s answer was lost. Look at the portal’s complaint list and say how it ended.',
  unclear_ack:
    'The acknowledgement was pressed and the portal’s answer was lost. Look at the portal and say how it ended.',
  unknown_status: 'The portal shows a status MDG has no mapping for. Add it, then clear this.',
  refused_unknown:
    'Nothing was pressed: an option was not on the page, or the portal said something MDG does not know.',
  form_changed: 'The portal’s form is not what the robot expects. Nothing was pressed.',
  login_problem: 'The portal login does not work, so the complaint could not be filed or followed.',
  rejected: 'The portal rejected this complaint. Read the reason below and help the dealer.',
  ack_blocked: 'The portal asked for something MDG does not know when acknowledging. Nothing was pressed.',
};

/**
 * The same list as the shared `COMPLAINT_FINAL_STAGES`, spelled out so this file has no
 * runtime import and can be checked by `scripts/complaints.check.ts` (which also checks
 * the two lists agree).
 */
export const FINAL_STAGES: readonly ComplaintStage[] = [
  'closed',
  'auto_closed',
  'cancelled',
  'expired',
  'not_filed',
  'duplicate',
];

export function isOpenStage(stage: ComplaintStage): boolean {
  return !FINAL_STAGES.includes(stage);
}

/**
 * Stages that are not on a portal yet: the dealer is still being asked. The server's
 * "open" count leaves them out (OFF_PORTAL in the complaints route), so the pane's
 * Open tile does too, or the same outlet reads 1 here and 0 on the Complaints page.
 */
const NOT_ON_PORTAL_YET: readonly ComplaintStage[] = ['drafting', 'confirming'];

/** Counted as "Open" the way the server counts it: on a portal and not finished. */
export function isOpenOnPortal(stage: ComplaintStage): boolean {
  return isOpenStage(stage) && !NOT_ON_PORTAL_YET.includes(stage);
}

/**
 * Stages where the next move is the dealer's: a chat complaint at a question, a yes or
 * "is it fixed?", and a portal-found complaint once the team has asked "is it fixed?"
 * (`ackAskedAt`). Before the team asks, a portal complaint waits on the team.
 */
export function waitingForDealer(row: ComplaintAdminRow): boolean {
  if (row.origin === 'portal') return row.stage === 'fixed_awaiting_ack' && !!row.ackAskedAt;
  return row.stage === 'drafting' || row.stage === 'confirming' || row.stage === 'fixed_awaiting_ack';
}

/** "3h 5m ago" style age; days past 48 hours. */
export function ageText(iso: string | undefined, now: number): string {
  if (!iso) return '-';
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '-';
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return mins % 60 ? `${hours}h ${mins % 60}m ago` : `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Where it came from. The row does not say whether IndianOil's own system raised a
 * portal complaint (the record keeps it, the admin row does not carry it), so
 * every portal-origin one reads "found on portal".
 */
export function originLabel(row: ComplaintAdminRow): string {
  if (row.origin === 'chat') return 'from chat';
  // IndianOil's own system raises most automation complaints by itself (ADR 0052).
  return row.systemRaised ? 'raised by system' : 'found on portal';
}

export function paneHref(dealerId: string): string {
  return `/dealers/${dealerId}?tab=data-vault&vault=complaints`;
}
