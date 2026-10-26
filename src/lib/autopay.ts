/**
 * The rules behind the Autopay section of an outlet's Setup card, kept out of the
 * components as plain decisions (this app has no test runner;
 * `scripts/autopay.check.ts` runs these, `npm run check:autopay`): which words and
 * colour each state gets, which buttons a state allows, what the confirm says, how
 * long a note may be, and how an ended autopay and the call after it read.
 *
 * TYPES ONLY from `@dk/shared`, as `lib/onboarding.ts` does: the check script runs
 * this file outside Vite, where `@dk/shared` resolves to the package's compiled
 * `dist/`, which a pending shared change can leave behind the source. The words
 * for each stop reason and each way it ended live in `@dk/shared`
 * (`AUTOPAY_STOP_REASON_LABELS`, `AUTOPAY_ENDED_BY_LABELS`) and are looked up by
 * the component, not here.
 *
 * Nothing in here decides whether autopay is on, failing or off, or whether it can
 * be started: the server says so (`state`, `canStart`). What lives here is only
 * how that answer is put to a person.
 *
 * The words are the admin's, in English. The owner's own screen is a different
 * one with its own words, in Hindi and English.
 */
import type {
  AdminAutopay,
  AdminAutopayOverview,
  AutopayEndedBy,
  AutopayViewState,
} from '@dk/shared';

import { phoneLabel } from './intake';
import { formatPaise, isDay, ymdLabel } from './onboarding';
import type { Intent } from './statusIntent';

// ── The chip ────────────────────────────────────────────────────────────────

/** The chip's words for each state. */
export const AUTOPAY_STATE_LABEL: Record<AutopayViewState, string> = {
  setting_up: 'Waiting for approval',
  on: 'On',
  failing: 'Debit failing, retrying',
  off: 'Off',
};

/**
 * The chip's colour. Amber while the owner has yet to approve (somebody may need
 * to chase), green once it is taking the money, red while a debit is failing.
 */
export const AUTOPAY_STATE_INTENT: Record<AutopayViewState, Intent> = {
  setting_up: 'warning',
  on: 'success',
  failing: 'danger',
  off: 'neutral',
};

/** The small badge beside the chip: which Razorpay account the money goes through. */
export function modeBadge(mode: AdminAutopay['mode']): { text: string; intent: Intent } {
  return mode === 'test'
    ? { text: 'Test mode', intent: 'warning' }
    : { text: 'Live', intent: 'neutral' };
}

// ── Which buttons ───────────────────────────────────────────────────────────

/** "Stop autopay" is offered while there is something to stop. */
export function canStopAutopay(a: Pick<AdminAutopay, 'state'>): boolean {
  return a.state === 'setting_up' || a.state === 'on' || a.state === 'failing';
}

/**
 * The ways an autopay ended that leave an owner to be rung. An admin's own stop
 * was on the owner's word already, an unapproved link that ran out and a plan that
 * finished need no call.
 */
const CALL_AFTER: ReadonlySet<AutopayEndedBy> = new Set(['dealer', 'upi_app', 'halted']);

/** Whether a call is still owed on this ended autopay: it ended in a way that needs one, and none is logged. */
export function needsFollowUp(a: Pick<AdminAutopay, 'endedBy' | 'followUp'>): boolean {
  return a.endedBy !== null && CALL_AFTER.has(a.endedBy) && !a.followUp;
}

// ── Notes ───────────────────────────────────────────────────────────────────

/**
 * How long the free text may be. Mirror `stopAutopayAdminSchema` and
 * `autopayFollowUpSchema` in `@dk/shared`; `scripts/autopay.check.ts` fails if
 * they ever disagree.
 */
export const AUTOPAY_STOP_NOTE_MIN = 3;
export const AUTOPAY_STOP_NOTE_MAX = 300;
export const AUTOPAY_FOLLOW_UP_MIN = 3;
export const AUTOPAY_FOLLOW_UP_MAX = 500;

/** Why a typed note cannot be saved, or `null`. Counted after trimming, as the server counts. */
function noteProblem(note: string, min: number, max: number, empty: string): string | null {
  const n = note.trim().length;
  if (n === 0) return empty;
  if (n < min) return `Write a little more: at least ${min} characters.`;
  if (n > max) return `That is ${n} characters. Keep it to ${max}.`;
  return null;
}

/** The note on a stop: who asked, and how. */
export function stopNoteProblem(note: string): string | null {
  return noteProblem(
    note,
    AUTOPAY_STOP_NOTE_MIN,
    AUTOPAY_STOP_NOTE_MAX,
    'Say who asked for this, and how. For example: Owner on phone, 25 Oct.',
  );
}

/** The note on the call after a stop: what the owner said. */
export function followUpNoteProblem(note: string): string | null {
  return noteProblem(
    note,
    AUTOPAY_FOLLOW_UP_MIN,
    AUTOPAY_FOLLOW_UP_MAX,
    'Write what the owner said, even if it is only "did not pick up".',
  );
}

// ── Days and amounts ────────────────────────────────────────────────────────

/**
 * A day without the year while it is this year, "24 Nov"; with it from another
 * year, "9 Jan 2027". `today` is an IST `YYYY-MM-DD`. Read off the string, so no
 * timezone can move it a day.
 */
export function shortDay(ymd: string | null | undefined, today: string): string {
  if (!isDay(ymd)) return ymd ?? '-';
  const full = ymdLabel(ymd);
  return ymd.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
}

/** "Taken 1 month", "Taken 3 months". */
export function monthsTakenLine(n: number): string {
  return `Taken ${n} ${n === 1 ? 'month' : 'months'}`;
}

/** "₹3,540 a month". */
export function perMonth(paise: number): string {
  return `${formatPaise(paise)} a month`;
}

// ── What the status line says ───────────────────────────────────────────────

/**
 * The facts under the chip, in the order a person reads them: the amount, then
 * when the money is next taken (or, before the owner approves, when it first
 * will be), then how many months have been taken so far.
 */
export function statusFacts(
  a: Pick<AdminAutopay, 'state' | 'amountPaise' | 'firstDebitOn' | 'nextDebitOn' | 'chargedCount'>,
  today: string,
): string[] {
  const facts = [perMonth(a.amountPaise)];
  if (a.state === 'setting_up') {
    facts.push(
      a.firstDebitOn
        ? `First debit ${shortDay(a.firstDebitOn, today)}`
        : 'First debit when the owner approves',
    );
    return facts;
  }
  if (a.state !== 'off' && a.nextDebitOn)
    facts.push(`Next debit ${shortDay(a.nextDebitOn, today)}`);
  if (a.state !== 'off' || a.chargedCount > 0) facts.push(monthsTakenLine(a.chargedCount));
  return facts;
}

/** What the owner is waiting on, said under a chip that is not green. */
export function stateHint(state: AutopayViewState): string | null {
  switch (state) {
    case 'setting_up':
      return 'The owner has to approve once with their UPI PIN. This page checks again by itself.';
    case 'failing':
      return 'The last debit failed and Razorpay is trying again. If it keeps failing, autopay stops, the bill goes to the owner as a link, and an alert asks you to call.';
    default:
      return null;
  }
}

// ── Setting it up ───────────────────────────────────────────────────────────

/**
 * What the confirm says before "Set up autopay". The first debit day is not known
 * until the server has made the subscription (it comes back in the answer and is
 * shown then), so the confirm says only what is certain: the debit waits for the
 * month already paid to run out, or is taken at approval when none is left.
 * `paidThrough` is the last paid day, `today` an IST `YYYY-MM-DD`.
 */
export function startConfirmWords(
  o: Pick<AdminAutopayOverview, 'monthlyPricePaise' | 'paidThrough'> & {
    firstMonth?: AdminAutopayOverview['firstMonth'];
  },
  today: string,
): string {
  const lead = `Razorpay will text the owner an approval link for ${perMonth(o.monthlyPricePaise)}.`;
  const paid = o.paidThrough;
  // No paid month yet: the approval takes the first month and pays the first bill.
  if (
    !paid &&
    o.firstMonth &&
    (o.firstMonth.status === 'due' || o.firstMonth.status === 'processing')
  ) {
    return `${lead} The first month is taken when the owner approves, and that pays the first bill (${o.firstMonth.number}). If they pay the bill's link instead, the approval charge goes back by itself.`;
  }
  const firstDebit =
    isDay(paid) && paid >= today
      ? `The first debit is when the month already paid for runs out (paid until ${shortDay(paid, today)}).`
      : 'The first debit is when the owner approves.';
  return `${lead} ${firstDebit}`;
}

/** Where Razorpay was asked to send the approval link, in a sentence. `null` when that is not known. */
export function sentToLine(sentTo: AdminAutopay['sentTo']): string | null {
  if (!sentTo) return null;
  const parts = [sentTo.phone ? phoneLabel(sentTo.phone) : null, sentTo.email].filter(
    (v): v is string => !!v,
  );
  return parts.length > 0
    ? `Razorpay sent the link to ${parts.join(' and ')}.`
    : 'Razorpay had no phone number or email to send the link to. Send it yourself.';
}

/** The toast after "Set up autopay" worked. */
export function startedToast(sentTo: AdminAutopay['sentTo']): string {
  const delivered = !!sentTo && (!!sentTo.phone || !!sentTo.email);
  return delivered
    ? 'Autopay set up. Razorpay is sending the approval link.'
    : 'Autopay set up. Razorpay had nowhere to send the link, so send it yourself.';
}

// ── Checking with Razorpay ──────────────────────────────────────────────────

/** What the toast says after "Check with Razorpay", given the state before and after. */
export function refreshOutcome(before: AutopayViewState, after: AutopayViewState): string {
  const now = AUTOPAY_STATE_LABEL[after].toLowerCase();
  return before === after
    ? `Nothing new from Razorpay. It is still: ${now}.`
    : `Razorpay says it is now: ${now}.`;
}

// ── A failed press ──────────────────────────────────────────────────────────

/**
 * The error codes that mean "Razorpay did not answer": the call to it timed out
 * or could not be made, so nothing was changed on its side and trying again is
 * safe. `PAYMENT_PROVIDER_ERROR` is NOT one of them: that is Razorpay answering
 * and refusing, with its own reason in the server's message, and the reason is
 * the only thing that tells the admin what to fix.
 */
const RAZORPAY_NO_ANSWER_CODES: ReadonlySet<string> = new Set([
  'AUTOPAY_NOT_STOPPED',
  'RAZORPAY_UNREACHABLE',
]);

/**
 * What to say when a press was refused, decided by the server's error CODE and
 * never by the HTTP status alone: one status (503) carries both "Razorpay is
 * switched off" and "Razorpay did not answer", and they ask for opposite things
 * (wait for the owner to switch it on, or just press again).
 *
 *  - `PAYMENTS_NOT_CONFIGURED`: Razorpay is switched off on the server.
 *  - `AUTOPAY_NOT_STOPPED`, `RAZORPAY_UNREACHABLE`: Razorpay did not answer;
 *    nothing changed; try again.
 *  - `PAYMENT_PROVIDER_ERROR`: Razorpay refused, and the server's sentence quotes
 *    its reason (and, in the money-back, says what was already done). Shown as it is.
 *  - a 5xx the web server made on its own (no error envelope, code `HTTP_5xx`):
 *    a plain "did not answer" line.
 *  - anything else: the server's own plain sentence, as it is (it names the
 *    reason: already on, the first month not paid yet, the outlet paused or closed).
 */
export function failedText(
  status: number | undefined,
  message: string | undefined,
  code?: string,
): string {
  if (code === 'PAYMENTS_NOT_CONFIGURED') {
    return 'Razorpay is switched off, so this cannot be done yet.';
  }
  if (code && RAZORPAY_NO_ANSWER_CODES.has(code)) {
    return 'Razorpay did not answer. Nothing has changed. Try again in a minute.';
  }
  if (status !== undefined && status >= 500 && code?.startsWith('HTTP_')) {
    return 'The server did not answer. Wait a minute, check this page, and try again.';
  }
  return message && message.trim() ? message : 'That did not go through.';
}

// ── The ones that ended ─────────────────────────────────────────────────────

/** Ended ones, newest first. The server sends them that way; this keeps it true if it ever does not. */
export function newestEndedFirst<T extends Pick<AdminAutopay, 'endedAt' | 'createdAt'>>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) =>
    (b.endedAt ?? b.createdAt).localeCompare(a.endedAt ?? a.createdAt),
  );
}

/**
 * "Asha called, 26 Oct, 11:00" under an ended autopay. `stamp` is the time as a
 * person reads it (`istStamp`), passed in so this file stays free of the clock.
 */
export function followUpLine(f: NonNullable<AdminAutopay['followUp']>, stamp: string): string {
  return `${f.byName} called${stamp ? `, ${stamp}` : ''}`;
}

/** Who ended it, for the ones an admin did: "Stopped by MDG · Asha". Other ways carry no name. */
export function endedByDetail(
  endedBy: AutopayEndedBy | null,
  endedByName: string | null,
): string | null {
  return endedBy === 'admin' && endedByName ? endedByName : null;
}

/**
 * The first month came by hand (bank, UPI, cash, cheque): the money-back then
 * records the refund given back by hand — how and when — instead of asking Razorpay.
 */
export function firstMonthByHand(fm: AdminAutopayOverview['firstMonth']): boolean {
  return !!fm && fm.paidByHand;
}

/** The first-month money-back line on the outlet page, or null when there is nothing to say. */
export function moneyBackLine(
  fm: AdminAutopayOverview['firstMonth'],
  today: string,
): string | null {
  if (!fm || fm.status === 'due' || fm.status === 'processing' || fm.status === 'cancelled')
    return null;
  if (fm.canMoneyBack) {
    return fm.refundableUntil
      ? `First month: money-back possible till ${shortDay(fm.refundableUntil, today)}.`
      : 'First month: money-back possible.';
  }
  if (!fm.moneyBackReason) return null;
  return `First month: ${fm.moneyBackReason}`;
}

/**
 * Why the day money went back cannot be taken, or `null`. The money cannot go back
 * on a day after today, nor before the day it came (`cameOn`, when known): the
 * server refuses both, and says so here first so nothing is stopped for a press
 * that was always going to fail.
 */
export function refundDayProblem(
  day: string,
  cameOn: string | null | undefined,
  today: string,
): string | null {
  if (!isDay(day)) return 'Pick the day the money went back.';
  if (day > today) return 'The day cannot be in the future.';
  if (isDay(cameOn) && day < cameOn) {
    return `The money came on ${ymdLabel(cameOn)}, so it cannot go back before that day.`;
  }
  return null;
}

/**
 * What the money-back dialog says before the press. After the refund no further
 * monthly bills are raised for the outlet and a bill already raised for the next
 * month is cancelled; the services are not stopped, that is archiving the outlet.
 */
export function moneyBackWords(amount: string): string {
  return `Autopay is stopped first, so nothing more is taken. Then ${amount} goes back to the owner the way they paid, and a credit note is issued. After that, no more monthly bills are raised for this outlet, and any bill already raised for the next month is cancelled. The services keep running until you archive the outlet.`;
}

// ── An autopay is waiting on the first bill ─────────────────────────────────

/**
 * An autopay is out for the owner's approval and will take the outlet's FIRST
 * bill when they approve. `billId`, when given, is the bill the person is about to
 * act on: only the first bill itself is affected.
 */
export function firstBillAutopayWaiting(
  current: Pick<AdminAutopay, 'state' | 'firstBillId'> | null | undefined,
  billId?: string | null,
): boolean {
  if (!current || current.state !== 'setting_up' || !current.firstBillId) return false;
  return billId === undefined || billId === null || billId === current.firstBillId;
}

/** Said on "Send the bill again" while the autopay is waiting. The server enforces it (FIRST_BILL_HAS_AUTOPAY). */
export const FIRST_BILL_AUTOPAY_RESEND_WORDS =
  'Autopay is waiting for the owner to approve, and it will take this first bill. Sending the bill again at the same amount is fine. A bill at a different amount is refused while that approval is out. To change the amount, stop autopay first.';

/** Said on "Record payment received" for that first bill while the autopay is waiting. */
export const FIRST_BILL_AUTOPAY_RECORD_WORDS =
  'Autopay is waiting for the owner to approve, and it will take this first bill. If you record the money here and the owner then approves, the approval charge goes back to them by itself. If the owner has already paid you, stop autopay first so they are not asked to approve.';
