import { formatYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type {
  FuelDraftView,
  FuelIndentVaultView,
  FuelNoticeView,
  FuelOrderLineView,
  FuelOrderView,
  FuelProduct,
} from '@dk/shared';

/**
 * The plain words the Fuel orders pane uses for the codes the server carries.
 *
 * Everything the PORTAL said (an order's status, a refusal) is shown verbatim
 * and never passes through here: the full list of the portal's words is not
 * known yet (ADR 0041, Consequences), and a mapping would hide a new one. What
 * passes through here is only MDG's own vocabulary — a draft's state, why a
 * press was not made, whether a message went out.
 */

const PRODUCT_NAME: Record<FuelProduct, string> = {
  HSD: 'Diesel',
  MS: 'Petrol',
  XP: 'XtraPremium',
  XG: 'XtraGreen',
};

export function productName(p: FuelProduct | null | undefined, fallback: string): string {
  return p ? PRODUCT_NAME[p] : fallback;
}

/** KL as a dealer writes it: whole numbers bare, else one decimal. */
export function klText(kl: number | null | undefined): string {
  if (kl === null || kl === undefined) return '?';
  const r = Math.round(kl * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "Diesel 12 KL · Petrol 4 KL". A portal material we do not recognise is shown as the portal wrote it. */
export function linesText(lines: readonly FuelOrderLineView[]): string {
  if (lines.length === 0) return '-';
  return lines.map((l) => `${productName(l.product, l.material)} ${klText(l.kl)} KL`).join(' · ');
}

export function draftLinesText(lines: FuelDraftView['lines']): string {
  if (lines.length === 0) return 'No fuels yet';
  return lines.map((l) => `${productName(l.product, l.product)} ${klText(l.kl)} KL`).join(' · ');
}

export function datesText(dates: readonly string[]): string {
  return dates.length === 0 ? '-' : dates.map((d) => formatYmd(d)).join(', ');
}

/**
 * The portal's shipment / load time, 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD' (IST),
 * as "13 Nov 2026, 07:42". Read as text, never as a Date: it is already India
 * time, and parsing it as an instant would shift it by the browser's offset.
 */
export function portalTimeText(v: string | null | undefined): string {
  if (!v) return '-';
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v.trim());
  if (!m) return v;
  const day = formatYmd(m[1]);
  return m[2] ? `${day}, ${m[2]}:${m[3]}` : day;
}

/** Where a record stands, in MDG's own words. */
export const STATE_WORDS: Record<FuelOrderView['state'], { label: string; intent: Intent; hint: string }> = {
  drafting: {
    label: 'Being put together',
    intent: 'neutral',
    hint: 'The owner is still telling the assistant the date, tanker and fuels.',
  },
  awaiting_confirm: {
    label: 'Waiting for the owner’s yes',
    intent: 'info',
    hint: 'The order was read back in the chat. Nothing is placed until an owner writes yes.',
  },
  confirmed: {
    label: 'Owner said yes',
    intent: 'info',
    hint: 'The next run places it on the portal, within 30 minutes of the yes.',
  },
  submitting: {
    label: 'Being placed now',
    intent: 'info',
    hint: 'Submit is being pressed on the portal.',
  },
  placed: { label: 'Placed', intent: 'success', hint: 'The portal accepted the order.' },
  refused: {
    label: 'Refused by the portal',
    intent: 'danger',
    hint: 'The portal did not take the order. Its words are below. It is never retried by itself.',
  },
  unclear: {
    label: 'Answer not clear',
    intent: 'warning',
    hint: 'Submit was pressed but the portal’s answer could not be read. The next read of the list settles it; it is never pressed again.',
  },
  expired: {
    label: 'Not placed in time',
    intent: 'warning',
    hint: 'The yes is more than 30 minutes old and the order was not placed. The owner has to confirm again.',
  },
  abandoned: {
    label: 'Dropped',
    intent: 'neutral',
    hint: 'Given up before Submit was pressed: a newer order, placing switched off, or the form did not match.',
  },
  portal: {
    label: 'Placed by the dealer',
    intent: 'neutral',
    hint: 'Found on the portal’s list. It was placed directly on the portal, not through the chat.',
  },
};

/** Why Submit was not pressed, or what the portal's refusal was about. */
const SUBMIT_REASON_WORDS: Record<string, string> = {
  min_tt_capacity: 'Less than the smallest tanker the plant sends.',
  shortage_of_funds: 'Not enough money in the outlet’s account with IndianOil.',
  other: 'The portal gave another reason (its words are below).',
  form_mismatch: 'The filled form did not match the order, so Submit was not pressed.',
  product_not_on_portal: 'A fuel in the order is not on this outlet’s list on the portal.',
  date_rejected: 'The portal did not accept the delivery date.',
  qty_rejected: 'The portal did not accept one of the quantities.',
  no_time: 'The run ran out of time before pressing. It tries again in a few minutes.',
  dry_run: 'A test run. Nothing was pressed.',
  press_vetoed: 'A safety check stopped the press.',
  screen_unexpected: 'The portal showed a screen the robot did not expect. It tries again in a few minutes.',
  expired: 'The yes ran out (30 minutes) before the order could be placed.',
  switched_off: 'Placing was switched off when the robot got to it.',
  login_refused: 'IndianOil refused the outlet’s SDMS password. The owner was told to update it.',
  no_login: 'The outlet has no SDMS login saved. The owner was told.',
  paused: 'The Fuel orders service was paused for the outlet.',
  outside_pilot: 'Placing is not switched on for this outlet.',
  not_attached: 'The Fuel orders service is not attached to this outlet.',
  placing_paused: 'Placing was paused by the team.',
  portal_unreachable: 'The portal did not open in the 30 minutes after the yes.',
  captcha: 'The portal’s captcha could not be passed in the 30 minutes after the yes.',
  account_cooldown: 'The portal had the outlet’s login on hold.',
  portal_busy: 'The outlet’s SDMS was open in a Summon window for the whole 30 minutes.',
  date_passed: 'The delivery date passed before it could be placed.',
  list_window: 'The portal’s order list did not reach the delivery date, so a duplicate could not be ruled out.',
  new_order_on_portal: 'An order of the same kind appeared on the portal after the owner’s yes, so it was not placed. The owner was asked to say again if they want one more.',
  replaced_order_not_cancelled: 'The order it was replacing was not cancelled, so it was not placed.',
  owner_stopped: 'The owner said stop before it was pressed.',
  product_on_contract: 'The fuel is bought on a contract at this outlet; MDG does not order contract fuels.',
  settled_by_admin_not_placed: 'A person checked the portal: it was not placed.',
  settled_by_admin: 'A person checked the portal and recorded the order number.',
  settled_by_list: 'The press’s answer was lost; the portal’s list showed it went through.',
  earlier_press_unsettled: 'An earlier press from the chat was still unsettled, so this one was not sent.',
};

export function submitReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return SUBMIT_REASON_WORDS[reason] ?? 'Not pressed, for a reason the pane has no words for yet.';
}

const CANCEL_WORDS: Record<NonNullable<FuelOrderView['cancel']>['state'], string> = {
  confirmed: 'The owner asked to cancel it; the next run cancels it',
  cancelling: 'Being cancelled now',
  cancelled: 'Cancelled on the portal',
  refused: 'The portal refused to cancel it',
  unclear: 'Cancel was pressed but the answer was not clear',
  not_pressed: 'Cancel was not pressed',
  expired: 'The cancel was not carried out in time',
};

export function cancelText(c: FuelOrderView['cancel']): string | null {
  return c ? CANCEL_WORDS[c.state] : null;
}

/**
 * Whether the outlet's chats heard about the tanker. "Not yet" only makes sense
 * once there IS a tanker; before that the cell is a dash.
 */
export function tankerMessageWords(
  notice: FuelNoticeView | null | undefined,
  hasTanker: boolean,
): { label: string; intent: Intent } {
  if (notice?.state === 'posted') return { label: 'Sent', intent: 'success' };
  if (notice?.state === 'claimed') return { label: 'Sending', intent: 'info' };
  if (notice?.state === 'failed') return { label: 'Failed, will retry', intent: 'danger' };
  if (notice?.state === 'skipped') return { label: 'Not sent: tanker already gone', intent: 'neutral' };
  return hasTanker ? { label: 'Not yet', intent: 'warning' } : { label: '-', intent: 'neutral' };
}

/** Why placing is off for this outlet, in a sentence. */
export function placingOffText(block: FuelIndentVaultView['placingBlock']): string {
  switch (block) {
    case 'switched_off':
      return 'Placing and cancelling orders are switched off for every outlet right now.';
    case 'outside_pilot':
      return 'Placing and cancelling orders are switched on only for some outlets, and this is not one of them.';
    case 'not_attached':
      return 'The Fuel orders service is not attached to this outlet.';
    case 'paused':
      return 'The Fuel orders service is paused for this outlet.';
    case 'no_login':
      return 'This outlet’s SDMS login is not working, so nothing can be placed until it is fixed.';
    case 'placing_paused':
      return 'Placing orders through MDG is paused by the team (below). An owner’s yes is not acted on; the owner is told they can place it on the portal.';
    default:
      return 'Placing and cancelling orders are off for this outlet.';
  }
}

/** The messages MDG sends about an order, in the admin's words (the per-order timeline). */
export const EVENT_WORDS: Record<string, string> = {
  placed: 'Placed message',
  refused: 'Refused message',
  unclear: '“We are checking” message',
  not_placed: 'Not placed message',
  tanker_assigned: 'Tanker message',
  cancelled: 'Cancel result message',
  not_executed_reason: 'IndianOil’s reason message',
  no_tanker_by_afternoon: 'No tanker by 3 pm message',
  lapsed_not_executed: 'Date passed, not executed message',
  closed_on_portal: 'Closed on the portal message',
  tanker_changed: 'Tanker changed message',
  possible_duplicate: 'Possible duplicate message',
  delayed: 'Portal not opening message',
  check_result: 'Check result',
  tracking_stopped: 'Checks stopped message',
};

/** A notice slot's state, in a word. */
export const NOTICE_STATE_WORDS: Record<string, string> = {
  claimed: 'being sent',
  posted: 'sent',
  failed: 'failed, will retry',
  skipped: 'not sent on purpose',
};
