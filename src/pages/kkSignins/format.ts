/**
 * The Khata Kavach sign-ins page's small decisions, kept out of the component so they read as plain rules.
 * (This app has no test runner; the sentence for each row is worked out on the server, where it is tested.)
 */
import type { KkSigninDelivery, KkSigninIntent, KkSigninRow, KkSigninVerdict } from '@dk/shared';

/** What the person was trying to do. */
export const INTENT_LABEL: Record<KkSigninIntent, string> = {
  join: 'Join a pump',
  start: 'Start a pump',
  primary: 'Hand over main owner',
};

/** The WhatsApp column: what WhatsApp says about the message, in a word. */
export const DELIVERY_LABEL: Record<KkSigninDelivery, string> = {
  read: 'Opened',
  delivered: 'Delivered',
  failed: 'Failed',
  sent: 'Sent, not delivered',
  none: 'No report',
  'not-sent': 'Not sent',
};

export const VERDICT_INTENT: Record<KkSigninVerdict, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ok: 'success',
  info: 'neutral',
  waiting: 'warning',
  problem: 'danger',
};

export const VERDICT_LABEL: Record<KkSigninVerdict, string> = {
  ok: 'Got in',
  info: 'No action',
  waiting: 'Waiting',
  problem: 'Problem',
};

/** "98765 04836": a number as a person reads it off a card, or as given when it is not a 12-digit Indian mobile. */
export function readable(phone: string): string {
  const m = /^91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** The "what did they do" column: got in, or how far they got. */
export function progress(r: Pick<KkSigninRow, 'outcome' | 'typedRight' | 'wrongTries' | 'result'>): string {
  if (r.outcome === 'joined') return 'Joined the pump';
  if (r.outcome === 'started') return 'Started a pump';
  if (r.outcome === 'handed-over') return 'Handed over';
  if (r.result !== 'sent') return '—';
  if (r.typedRight) return 'Typed the code, did not finish';
  if (r.wrongTries > 0) return `Wrong code ×${r.wrongTries}`;
  return 'Has not typed it';
}

/** Only the last 4 to 10 digits are sent: anything else typed in the box is dropped, so a stray letter never reaches the server. */
export function digitsOnly(input: string): string {
  const d = input.replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-10) : '';
}
