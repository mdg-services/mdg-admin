import type { Intent } from '@/lib/statusIntent';
import type {
  LetterheadWay,
  WorkPermitAdminRow,
  WorkPermitAttention,
  WorkPermitStage,
} from '@dk/shared';

import { ageText } from '../complaints/format';

export { ageText };

/** Plain words for every stage (ADR 0053). No portal codes. */
export const STAGE_WORDS: Record<WorkPermitStage, string> = {
  drafting: 'Asking the dealer',
  confirming: 'Waiting for the dealer’s yes',
  issuing: 'Issuing now',
  issued: 'Issued, work window open',
  closing: 'Closing now',
  extending: 'Adding more time',
  closed: 'Closed',
  extended: 'Replaced by a longer permit',
  lapsed: 'Time is up, not closed',
  cancelled: 'Dealer left it',
  expired: 'Yes ran out, not issued',
  not_issued: 'Not issued',
  unclear: 'Unclear, check SDMS',
};

/** Green only for done; amber where the dealer or the team owes a step; red where a check stopped. */
export const STAGE_INTENT: Record<WorkPermitStage, Intent> = {
  drafting: 'warning',
  confirming: 'warning',
  issuing: 'info',
  issued: 'success',
  closing: 'info',
  extending: 'info',
  closed: 'neutral',
  extended: 'neutral',
  lapsed: 'warning',
  cancelled: 'neutral',
  expired: 'neutral',
  not_issued: 'danger',
  unclear: 'danger',
};

export const ATTENTION_WORDS: Record<WorkPermitAttention, string> = {
  unclear_press:
    'Submit was pressed and SDMS’s answer was lost. Look at the Non-Critical permit list on SDMS and say how it ended.',
  refused: 'SDMS refused the permit, or a check stopped it before anything was pressed. Read the reason below and help the dealer.',
  form_changed: 'SDMS’s permit form is not what the robot expects. Nothing was pressed.',
  login_problem: 'The SDMS login does not work, so the permit could not be issued or followed.',
  close_failed: 'The permit could not be closed on SDMS. Close it there, or press Close now to try again.',
  rep_update_failed: 'The dealer representative could not be added or extended on SDMS.',
  letter_failed: 'The Letter of Authorization could not be made or uploaded.',
  lookup_failed: 'SDMS did not answer the company lookup three times, so the permit was stopped. Check the SDMS login; issue it by hand if the engineer is waiting.',
};

export const LETTERHEAD_WORDS: Record<LetterheadWay, string> = {
  blank_letterhead: 'Photo of the outlet’s blank letterhead; MDG prints each letter onto it',
  sign_each: 'MDG’s letterhead with the outlet’s name; a letter that needs a signature is printed and signed by the dealer',
};

/** The same list as the shared `WORK_PERMIT_FINAL_STAGES`, spelled out (and checked against it) so this file needs no runtime import. */
export const FINAL_STAGES: readonly WorkPermitStage[] = [
  'closed',
  'extended',
  'cancelled',
  'expired',
  'not_issued',
];

export function isFinalStage(stage: WorkPermitStage): boolean {
  return FINAL_STAGES.includes(stage);
}

/** The dealer is still being asked: nothing is on SDMS yet. */
export function isDraftStage(stage: WorkPermitStage): boolean {
  return stage === 'drafting' || stage === 'confirming';
}

/** Counted as "On SDMS now": issued or being worked on, not a draft and not finished. */
export function isLiveOnSdms(stage: WorkPermitStage): boolean {
  return !isFinalStage(stage) && !isDraftStage(stage);
}

export type SettleActionId = 'found' | 'not_found' | 'close_now' | 'closed_on_sdms' | 'clear_flag';

/**
 * Which settle buttons fit a permit. None presses Submit; "Close now" asks the robot to
 * close an open permit, the rest record what a person saw on SDMS.
 *
 *  - unclear: found on SDMS (number needed) or not there;
 *  - issued / lapsed: close it now, or say it was closed on SDMS;
 *  - a flag: clear it, except on a lost Submit, where clearing would leave it stuck.
 */
export function settleActions(row: Pick<WorkPermitAdminRow, 'stage' | 'attention'> & { number?: string }): SettleActionId[] {
  const out: SettleActionId[] = [];
  const unclear = row.stage === 'unclear' || row.attention === 'unclear_press';
  // A lost Submit (no number yet): was a permit made? A lost Close (it has a number): is it closed?
  if (unclear && !row.number) out.push('found', 'not_found');
  if (unclear && row.number) out.push('closed_on_sdms');
  if (row.stage === 'issued' || row.stage === 'lapsed') out.push('close_now', 'closed_on_sdms');
  if (row.stage === 'closing' && !out.includes('closed_on_sdms')) out.push('closed_on_sdms');
  if (row.attention && !unclear) out.push('clear_flag');
  return out;
}

/** "Complaint: DU / number / date" in one line, or what a no-complaint visit says. */
export function complaintText(c: WorkPermitAdminRow['complaint']): string {
  if (!c) return 'Not against a complaint';
  return [c.type, c.number ? `#${c.number}` : null, c.date].filter(Boolean).join(' · ');
}

/** Nature ▸ main work ▸ sub works. */
export function workText(jsa: WorkPermitAdminRow['jsa']): string {
  if (!jsa) return '-';
  const parts = [jsa.nature, jsa.mainWork];
  if (jsa.subWorks.length > 0) parts.push(jsa.subWorks.join(', '));
  return parts.filter(Boolean).join(' ▸ ');
}

export function paneHref(dealerId: string): string {
  return `/dealers/${dealerId}?tab=data-vault&vault=work-permits`;
}
