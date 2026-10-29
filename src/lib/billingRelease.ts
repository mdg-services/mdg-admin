/**
 * The decisions behind the billing release's screens (ADR 0022 §13.2), kept out of
 * the components as plain functions (this app has no test runner;
 * `scripts/billingRelease.check.ts` runs these): the one-line billing status on the
 * Setup card, "Give more time" and "Hold chasing" (who may move a day, how far, and
 * which bills each applies to), the send history line and the third-send warning,
 * the autopay approval's expiry and the owner's money-back ask, and the building of
 * the `MoneyAction` each money window hands to "What the dealer receives".
 *
 * TYPES ONLY from `@dk/shared`, as `lib/billing.ts` does: the check script runs this
 * file outside Vite, where `@dk/shared` resolves to the package's compiled `dist/`,
 * which a pending shared change can leave behind the source.
 *
 * The words are the admin's, in English. Nothing here is shown to a dealer.
 */
import type {
  AdminAutopay,
  AdminAutopayOverview,
  AdminPayment,
  MoneyAction,
  PaymentSend,
} from '@dk/shared';

import { shortDay } from './autopay';
import { addDays, formatPaise, isDay, ymdLabel } from './onboarding';

// ── India's calendar, read off an instant ───────────────────────────────────

/** `2026-10-28T05:32:00.000Z` → `2026-10-28` in India's calendar (IST is +05:30, no daylight saving). */
export function ymdOfIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** `2026-10-28T05:32:00.000Z` → `11:02` in India time. */
function clockOfIso(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(11, 16);
}

/** Today's IST day, from a clock value passed in so these stay pure. */
function todayOf(now: number): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

// ── What the system has sent about a bill ───────────────────────────────────

/** How many of these were sent on the IST day `day`. */
export function sendsOnDay(sends: ReadonlyArray<Pick<PaymentSend, 'at'>>, day: string): number {
  return sends.filter((s) => ymdOfIso(s.at) === day).length;
}

/**
 * One line for the Payments drawer and for "Send bill again": how many times the
 * dealer was sent something about this bill, and the last one. "Sent 2 times, last
 * on 28 Oct at 11:02 by Asha", or "Not sent yet". A send the system made on its own
 * (a reminder, a renewal) has no admin to name and reads "by the system".
 */
export function sendHistoryLine(sends: readonly PaymentSend[], now: number): string {
  if (sends.length === 0) return 'Not sent yet';
  const last = sends.reduce((a, b) => (Date.parse(b.at) >= Date.parse(a.at) ? b : a));
  const day = ymdOfIso(last.at);
  const when = `on ${shortDay(day, todayOf(now))} at ${clockOfIso(last.at)}`;
  const by = ` by ${last.byName ?? 'the system'}`;
  return sends.length === 1
    ? `Sent once, ${when}${by}`
    : `Sent ${sends.length} times, last ${when}${by}`;
}

/**
 * The warning before a THIRD send on the same day, or `null` while it is the first
 * or second. Counted from what the system logged (an admin's send and the system's
 * own reminders both land in the owner's phone, so both count).
 */
export function repeatSendWarning(sends: readonly PaymentSend[], now: number): string | null {
  const n = sendsOnDay(sends, todayOf(now));
  if (n < 2) return null;
  return `The owner has already been sent this bill ${n} times today. Sending it again can look like nagging. Send it only if they asked for it.`;
}

// ── Give more time ──────────────────────────────────────────────────────────

/** Any admin may move a bill's day up to this many days past its first due day; further is a super-admin's. */
export const MORE_TIME_ADMIN_DAYS = 7;

/** Mirror `giveMoreTimeSchema` and `holdChasingSchema`; `scripts/billingRelease.check.ts` fails if they disagree. */
export const MORE_TIME_REASON_MIN = 3;
export const MORE_TIME_REASON_MAX = 300;

/** The day the bill was first due: before any "Give more time", the day it is due now. */
export function originalDueDay(p: Pick<AdminPayment, 'dueDate' | 'dueDateChanges'>): string | null {
  return p.dueDateChanges?.[0]?.from ?? p.dueDate;
}

/** The last day an ordinary admin may pick: seven days after the bill's first due day. */
export function lastDayWithoutSuperAdmin(originalDue: string): string {
  return addDays(originalDue, MORE_TIME_ADMIN_DAYS);
}

/**
 * The plain note when the chosen day is further out than an ordinary admin may go,
 * or `null` (a super-admin has no limit, and a day inside the seven needs no note).
 * The server refuses it too; saying it first means nobody types a reason for a
 * press that was always going to fail.
 *
 * When the last day an ordinary admin may pick is already behind us, the bill has
 * been overdue for more than seven days: there is no "latest day" to name, so the
 * note says only that a super-admin has to move it.
 */
export function overSevenDaysNote(
  dueOn: string,
  originalDue: string | null,
  isSuperAdmin: boolean,
  today: string,
): string | null {
  if (isSuperAdmin || !originalDue || !isDay(dueOn)) return null;
  const last = lastDayWithoutSuperAdmin(originalDue);
  if (dueOn <= last) return null;
  if (last < today) {
    return `This bill has been overdue more than ${MORE_TIME_ADMIN_DAYS} days, so only a super-admin can move it.`;
  }
  return `More than ${MORE_TIME_ADMIN_DAYS} days needs a super-admin. This bill was first due on ${ymdLabel(originalDue)}, so the latest day you can pick is ${ymdLabel(last)}.`;
}

/**
 * The day "Give more time" starts on: the current due day plus 3. A bill that is
 * already days overdue would start in the past, so it starts tomorrow instead.
 */
export function defaultMoreTimeDay(currentDue: string | null, today: string): string {
  const tomorrow = addDays(today, 1);
  if (!isDay(currentDue)) return addDays(today, 3);
  const plus3 = addDays(currentDue, 3);
  return plus3 < tomorrow ? tomorrow : plus3;
}

/** The reason box, counted after trimming as the server counts. */
export function moreTimeReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return 'Say why. For example: owner asked on the phone, will pay on Friday.';
  if (n < MORE_TIME_REASON_MIN) {
    return `Write a little more: at least ${MORE_TIME_REASON_MIN} characters.`;
  }
  if (n > MORE_TIME_REASON_MAX) {
    return `That is ${n} characters. Keep it to ${MORE_TIME_REASON_MAX}.`;
  }
  return null;
}

/** Why "Give more time" cannot be pressed, or `null`. Every rule is the server's own. */
export function moreTimeProblem(
  v: { dueOn: string; reason: string },
  f: { currentDue: string; originalDue: string | null; today: string; isSuperAdmin: boolean },
): string | null {
  if (!isDay(v.dueOn)) return 'Pick the new pay-by day.';
  if (v.dueOn <= f.currentDue) {
    return `Pick a day after the current one (${shortDay(f.currentDue, f.today)}). To move it earlier, cancel the bill and raise another.`;
  }
  if (v.dueOn < f.today) return 'The new day cannot be in the past.';
  const over = overSevenDaysNote(v.dueOn, f.originalDue, f.isSuperAdmin, f.today);
  if (over) return over;
  return moreTimeReasonProblem(v.reason);
}

export function moreTimeBody(v: { dueOn: string; reason: string; tellDealer: boolean }): {
  dueOn: string;
  reason: string;
  tellDealer: boolean;
} {
  return { dueOn: v.dueOn, reason: v.reason.trim(), tellDealer: v.tellDealer };
}

// ── Hold chasing ────────────────────────────────────────────────────────────

/**
 * Autopay is meant to take this bill, by the server's own rule (`autopayTakes`): its
 * subscription has not let go of it, or its first-month approval is still out. A
 * bill that fell back to a link still carries a subscription id but is no longer
 * autopay's, so the id alone is not the test.
 */
export function autopayMeantToTake(p: Pick<AdminPayment, 'status' | 'autopayTakes'>): boolean {
  return p.status === 'due' && p.autopayTakes === true;
}

/**
 * Only a monthly-service bill ("subscription") has a pay-by day worth moving, and
 * only those get reminders and an overdue alert. The server refuses the other
 * purposes (a one-off service or an add-on) with a plain sentence, so the admin
 * does not offer the buttons on them.
 */
export function isSubscriptionBill(p: Pick<AdminPayment, 'purpose'>): boolean {
  return p.purpose === 'subscription';
}

/**
 * "Hold chasing…" is for a monthly bill autopay is meant to take, or one already on
 * hold (to change or lift it: a link bill is held for a week when the owner asks for
 * their first month back).
 */
export function canHoldChasing(
  p: Pick<AdminPayment, 'status' | 'purpose' | 'autopayTakes' | 'chaseHeldUntil'>,
): boolean {
  return (
    isSubscriptionBill(p) && (autopayMeantToTake(p) || (p.status === 'due' && !!p.chaseHeldUntil))
  );
}

/** "Give more time…" is for a due monthly bill with a day that autopay does NOT take. */
export function canGiveMoreTime(
  p: Pick<AdminPayment, 'status' | 'purpose' | 'dueDate' | 'autopayTakes'>,
): boolean {
  return (
    isSubscriptionBill(p) && p.status === 'due' && p.dueDate !== null && !autopayMeantToTake(p)
  );
}

/** A hold is in force while its last day has not passed. */
export function holdIsOn(chaseHeldUntil: string | null | undefined, today: string): boolean {
  return !!chaseHeldUntil && chaseHeldUntil >= today;
}

/**
 * What the Hold chasing window says about the hold, by what the hold is for:
 *  - autopay is meant to take the bill: no chasing, and Razorpay's own retries go on;
 *  - otherwise it is a link bill held because the owner asked for their first month
 *    back, and Razorpay is not retrying anything, so that line is left out.
 * `null` for a link bill with no hold in force: nothing to explain.
 */
export function holdExplainer(
  p: Pick<AdminPayment, 'autopayTakes' | 'chaseHeldUntil'>,
  today: string,
): string | null {
  if (p.autopayTakes) {
    return 'Until the day you pick, no overdue alert, no reminder and no payment link goes out for this bill. Razorpay still retries the debit by itself: this does not stop it.';
  }
  if (holdIsOn(p.chaseHeldUntil, today)) {
    return 'Held for a week because the owner asked for their first month back.';
  }
  return null;
}

/** Why the hold cannot be set, or `null`. Same seven-day rule as more time, counted from the bill's due day. */
export function holdProblem(
  v: { until: string; reason: string },
  f: { originalDue: string | null; today: string; isSuperAdmin: boolean },
): string | null {
  if (!isDay(v.until)) return 'Pick the day to hold chasing until.';
  if (v.until < f.today) return 'The day cannot be in the past.';
  const over = overSevenDaysNote(v.until, f.originalDue, f.isSuperAdmin, f.today);
  if (over) return over;
  return moreTimeReasonProblem(v.reason);
}

export function holdBody(
  until: string | null,
  reason: string,
): {
  until: string | null;
  reason?: string;
} {
  const why = reason.trim();
  return until === null || !why ? { until } : { until, reason: why };
}

// ── The one-line billing status on the Setup card ───────────────────────────

/** What the status line is made from; every piece is something a screen already holds. */
export interface BillingStatusFacts {
  today: string;
  /** The outlet's first bill, as the setup describes it. */
  first: {
    state: 'not_sent' | 'sent' | 'paid';
    number: string | null;
    amountPaise: number | null;
    dueOn: string | null;
  };
  /** The bill waiting to be paid right now (a renewal or the first one), when the payments list has it. */
  open: Pick<
    AdminPayment,
    | 'number'
    | 'amountPaise'
    | 'dueDate'
    | 'autopayOn'
    | 'waitingForAutopayApproval'
    | 'chaseHeldUntil'
  > | null;
  /** The last day the services are paid for, and when the next bill is raised. */
  paidThrough: string | null;
  nextBillOn: string | null;
  /** The setup says a raised bill is past its day (used when the open bill is not at hand). */
  overdue: boolean;
  billingHold: { at: string } | null;
  /** The autopay that has not ended, if any. */
  autopay: Pick<
    AdminAutopay,
    'state' | 'amountPaise' | 'nextDebitOn' | 'createdAt' | 'approvalExpiresAt'
  > | null;
  /** The clock, in milliseconds. */
  now: number;
}

/**
 * Whether the Setup card has a billing line to show yet: not while the owner is still
 * signing in and giving company and bill-to details (nothing to say about money), and
 * not for a closed lead that never got a bill. From the payment step on, or once a
 * bill exists, it does.
 */
export function showsBillingStatus(
  stage:
    | 'sign_in'
    | 'company'
    | 'billing'
    | 'payment'
    | 'logins'
    | 'setup'
    | 'watch'
    | 'live'
    | 'lost',
  paymentState: 'not_sent' | 'sent' | 'paid',
): boolean {
  if (paymentState !== 'not_sent') return true;
  return stage !== 'sign_in' && stage !== 'company' && stage !== 'billing' && stage !== 'lost';
}

/**
 * Where an outlet's billing stands, in one line the owner can read at a glance.
 * Whatever the data supports and nothing more:
 *
 *  - "Paid till 28 Nov. ₹3,540 will be taken by autopay on 29 Nov."
 *  - "Autopay approval sent 29 Oct; waiting for the owner. It runs out on 8 Nov."
 *  - "Bill MDG-2026-00012, ₹3,540, due 3 Dec."
 *  - "Bill MDG-2026-00012 is overdue; it was due on 3 Dec."
 *  - "Chasing held until 6 Dec." (added to the end while a hold is on)
 */
export function billingStatusLine(f: BillingStatusFacts): string {
  const day = (ymd: string | null | undefined) => shortDay(ymd ?? null, f.today);
  const paidTill = f.paidThrough ? `Paid till ${day(f.paidThrough)}.` : '';
  const parts: string[] = [];

  if (f.billingHold) {
    parts.push(`Services paused for non-payment since ${day(ymdOfIso(f.billingHold.at))}.`);
  } else if (f.autopay?.state === 'setting_up') {
    // The first-month approval (or a later one) is out and the owner has not approved it.
    const sent = ymdOfIso(f.autopay.createdAt);
    parts.push(
      `Autopay approval sent${sent ? ` ${day(sent)}` : ''}; waiting for the owner.${expiryWords(f.autopay.approvalExpiresAt, f.now)}`,
    );
  } else {
    const bill =
      f.open ??
      (f.first.state === 'sent'
        ? {
            number: f.first.number ?? 'The first bill',
            amountPaise: f.first.amountPaise ?? 0,
            dueDate: f.first.dueOn,
            autopayOn: null,
            waitingForAutopayApproval: false,
            chaseHeldUntil: null,
          }
        : null);
    if (bill) {
      parts.push(billWords(bill, f, paidTill));
    } else if (f.first.state === 'not_sent') {
      parts.push('Bill not sent yet.');
    } else {
      // Paid, and nothing open: how far it is paid and what comes next.
      if (paidTill) parts.push(paidTill);
      if (f.overdue) parts.push('A bill is past its due day.');
      else if (f.autopay && f.autopay.state !== 'off' && f.autopay.nextDebitOn) {
        parts.push(
          `${formatPaise(f.autopay.amountPaise)} will be taken by autopay on ${day(f.autopay.nextDebitOn)}.`,
        );
      } else if (f.nextBillOn) {
        parts.push(`The next bill is raised on ${day(f.nextBillOn)}.`);
      } else if (!paidTill) {
        parts.push(f.first.number ? `Bill ${f.first.number} is paid.` : 'The first bill is paid.');
      }
    }
  }

  if (f.autopay?.state === 'failing') {
    parts.push('The last autopay debit failed; Razorpay is trying again.');
  }
  const held = f.open?.chaseHeldUntil ?? null;
  if (holdIsOn(held, f.today)) parts.push(`Chasing held until ${day(held)}.`);
  return parts.join(' ');
}

function expiryWords(expiresAt: string | null, now: number): string {
  const ymd = ymdOfIso(expiresAt);
  if (!ymd || !expiresAt) return '';
  const today = todayOf(now);
  return Date.parse(expiresAt) < now
    ? ` It ran out on ${shortDay(ymd, today)}.`
    : ` It runs out on ${shortDay(ymd, today)}.`;
}

function billWords(
  bill: NonNullable<BillingStatusFacts['open']>,
  f: BillingStatusFacts,
  paidTill: string,
): string {
  const day = (ymd: string | null | undefined) => shortDay(ymd ?? null, f.today);
  // Autopay is lined up to take it: nothing for the owner to do, so no "due" and no "overdue".
  if (bill.autopayOn) {
    return `${paidTill ? `${paidTill} ` : ''}${formatPaise(bill.amountPaise)} will be taken by autopay on ${day(bill.autopayOn)}.`;
  }
  if (bill.dueDate && bill.dueDate < f.today) {
    return `Bill ${bill.number} is overdue; it was due on ${day(bill.dueDate)}.`;
  }
  return bill.dueDate
    ? `Bill ${bill.number}, ${formatPaise(bill.amountPaise)}, due ${day(bill.dueDate)}.`
    : `Bill ${bill.number}, ${formatPaise(bill.amountPaise)}.`;
}

// ── The autopay approval, and the owner's ask for the first month back ──────

/**
 * When the approval link stops working, as words: "on 8 Nov at 23:59", and whether
 * that has already passed. `null` when it is not known.
 */
export function approvalExpiry(
  expiresAt: string | null | undefined,
  now: number,
): { when: string; past: boolean } | null {
  const ymd = ymdOfIso(expiresAt);
  if (!ymd || !expiresAt) return null;
  return {
    when: `on ${shortDay(ymd, todayOf(now))} at ${clockOfIso(expiresAt)}`,
    past: Date.parse(expiresAt) < now,
  };
}

/**
 * While an approval waits: "The approval link runs out on 8 Nov at 23:59.", or "The
 * approval link has run out." once that has passed; `null` when not known.
 */
export function approvalExpiryLine(
  expiresAt: string | null | undefined,
  now: number,
): string | null {
  const e = approvalExpiry(expiresAt, now);
  if (!e) return null;
  return e.past ? 'The approval link has run out.' : `The approval link runs out ${e.when}.`;
}

/** The newest time an owner asked for the first month back, across the running autopay and the ended ones. */
export function refundAskedAt(
  o: Pick<AdminAutopayOverview, 'current' | 'history'> | null | undefined,
): string | null {
  if (!o) return null;
  const asks = [o.current, ...o.history]
    .map((a) => a?.refundAskedAt ?? null)
    .filter((v): v is string => !!v);
  if (asks.length === 0) return null;
  return asks.reduce((a, b) => (Date.parse(b) >= Date.parse(a) ? b : a));
}

/** "The owner asked for the first month back on 3 Nov." */
export function refundAskedLine(askedAt: string, today: string): string {
  return `The owner asked for the first month back on ${shortDay(ymdOfIso(askedAt), today)}.`;
}

// ── "What the dealer receives": the action each money window hands over ─────

/**
 * "Send bill". At the monthly price, with payments on, the server sends the AUTOPAY
 * APPROVAL instead of a payment link (the rule is the server's; this mirrors it so
 * the preview says the same). `resend` is an open bill with the same figures, or an
 * approval already out: nothing new is raised, it only goes again. `firstEver` is the
 * outlet's very first bill (the app's one "bill sent" chat line).
 */
export function sendBillAction(f: {
  paymentsOn: boolean;
  amountPaise: number | null;
  monthlyPricePaise: number | null;
  /** The open bill's figures, when one is out. */
  billedPaise: number | null;
  billedDueOn: string | null;
  dueOn: string;
  billOpen: boolean;
  approvalOut: boolean;
  firstEver: boolean;
  /** The server's `FIRST_BILL_AUTOPAY` switch (on unless switched off). */
  firstBillAutopay: boolean;
}): Extract<MoneyAction, { kind: 'send_bill' }> {
  const atPrice =
    f.monthlyPricePaise !== null && f.amountPaise !== null && f.amountPaise === f.monthlyPricePaise;
  const sameBill =
    f.billOpen &&
    f.billedPaise !== null &&
    f.amountPaise === f.billedPaise &&
    f.billedDueOn === f.dueOn;
  return {
    kind: 'send_bill',
    // An approval already out is sent again whatever the price is now (the server
    // checks for one before it looks at the amount).
    autopay: f.paymentsOn && f.firstBillAutopay && (f.approvalOut || atPrice),
    resend: sameBill || f.approvalOut,
    paymentsOn: f.paymentsOn,
    amountPaise: f.amountPaise ?? 0,
    firstEver: f.firstEver,
    approvalOut: f.approvalOut,
  };
}

/** "Request a payment": the WhatsApp reminders apply to a Subscription payment that has a due day. */
export function requestPaymentAction(f: {
  sendLink: boolean;
  amountPaise: number | null;
  purpose: string;
  dueDate: string;
}): Extract<MoneyAction, { kind: 'request_payment' }> {
  return {
    kind: 'request_payment',
    sendLink: f.sendLink,
    amountPaise: f.amountPaise ?? 0,
    remindersApply: f.purpose === 'subscription' && isDay(f.dueDate),
  };
}

/**
 * "Record payment received". `firstBill` is the outlet's first bill (the quiet thank-you
 * chat line, and the login box in the app when logins are missing); `loginsMissing`
 * is true while the outlet needs portal logins it has not finished giving.
 */
export function recordPaymentAction(f: {
  firstBill: boolean;
  loginsNeeded: number;
  loginsDoneAt: string | null;
  amountPaise: number | null;
}): Extract<MoneyAction, { kind: 'record_payment' }> {
  return {
    kind: 'record_payment',
    firstBill: f.firstBill,
    loginsMissing: f.loginsNeeded > 0 && !f.loginsDoneAt,
    amountPaise: f.amountPaise ?? 0,
  };
}

/**
 * "Set up autopay". With no paid month and the first bill unpaid, the approval takes
 * the first month at once. After a paid month the first debit is the day after it runs
 * out; once that day is behind us the debit is taken at approval.
 */
export function setUpAutopayAction(f: {
  paidThrough: string | null;
  firstBillUnpaid: boolean;
  amountPaise: number;
  today: string;
}): Extract<MoneyAction, { kind: 'set_up_autopay' }> {
  const firstMonth = !f.paidThrough && f.firstBillUnpaid;
  const firstDebitOn =
    !firstMonth && isDay(f.paidThrough) && f.paidThrough >= f.today
      ? addDays(f.paidThrough, 1)
      : null;
  return { kind: 'set_up_autopay', firstMonth, amountPaise: f.amountPaise, firstDebitOn };
}

/**
 * "Stop autopay" by an admin. `billWaiting` is a bill autopay was meant to take, which
 * then goes out as a link. `approved` is whether the owner had approved this autopay
 * (an approval nobody gave stops without a word to the owner). `billHeld` is whether
 * the waiting bill is on hold, so no link goes now.
 */
export function stopAutopayAction(f: {
  bill: Pick<AdminPayment, 'status' | 'autopayTakes' | 'chaseHeldUntil'> | null;
  firstBillWaiting: boolean;
  approved: boolean;
  today: string;
}): Extract<MoneyAction, { kind: 'stop_autopay_admin' }> {
  return {
    kind: 'stop_autopay_admin',
    billWaiting: f.firstBillWaiting || (f.bill !== null && autopayMeantToTake(f.bill)),
    approved: f.approved,
    billHeld: holdIsOn(f.bill?.chaseHeldUntil, f.today),
  };
}

/**
 * The sentence at the top of the "Stop autopay" window, matching what the preview
 * below it lists: an approved autopay tells the owner "Autopay stopped"; an approval
 * nobody gave tells them nothing about autopay and, with a bill waiting, sends that
 * bill as a one-time payment link.
 */
export function stopAutopayWords(f: {
  approved: boolean;
  billWaiting: boolean;
  billHeld: boolean;
}): string {
  const hold = f.billHeld ? ' That bill is on hold, so no link goes now.' : '';
  if (!f.approved) {
    return f.billWaiting
      ? `The approval link the owner was sent stops working. The owner never had autopay, so they are not told about it. The first bill goes to them at once as a one-time payment link.${hold}`
      : 'The approval link the owner was sent stops working. The owner never had autopay, so they are not told about it.';
  }
  const next = f.billWaiting
    ? f.billHeld
      ? 'The bill autopay was going to take is on hold, so no link goes now.'
      : 'The bill autopay was going to take goes to the owner as a link.'
    : 'The next bill goes to the owner as a link.';
  return `No more money is taken after this. The services do not stop. The month already paid runs out as usual. ${next} The owner gets an \u201cAutopay stopped\u201d notification in the app saying nothing more will be taken.`;
}

/**
 * "Give the first month back". What goes back is what came (less than the bill after
 * tax deducted at source). `autopayRunning` is an approved autopay that has not ended:
 * the owner then hears "Autopay stopped" before "Refund done".
 */
export function moneyBackAction(
  fm: {
    amountPaise: number;
    paidPaise: number;
    paidByHand: boolean;
  },
  autopayRunning: boolean,
): Extract<MoneyAction, { kind: 'money_back' }> {
  return {
    kind: 'money_back',
    amountPaise: fm.paidByHand ? fm.paidPaise : fm.amountPaise,
    byHand: fm.paidByHand,
    autopayRunning,
  };
}

/** The overview's current autopay is approved and not ended: debits are (or will be) taken. */
export function autopayIsRunning(
  current: Pick<AdminAutopay, 'approvedAt' | 'endedAt'> | null | undefined,
): boolean {
  return !!current && current.approvedAt !== null && current.endedAt === null;
}

/**
 * "Send a pay link instead": what its window needs, from the autopay that is out or,
 * for an approval that ran out unused, the newest ended one. `ranOut` is true when no
 * approval is live any more, so the window says nothing about stopping it. `null`
 * when there is no autopay at all to take the facts from.
 */
export function payLinkInsteadFacts(
  o: Pick<AdminAutopayOverview, 'current' | 'history' | 'firstMonth'>,
  now: number,
): { amountPaise: number; approvalExpiresAt: string | null; ranOut: boolean } | null {
  const source = o.current ?? o.history[0] ?? null;
  if (!source) return null;
  const expiry = approvalExpiry(source.approvalExpiresAt, now);
  return {
    amountPaise: o.firstMonth?.amountPaise ?? source.amountPaise,
    approvalExpiresAt: source.approvalExpiresAt,
    ranOut: o.current === null || source.endedAt !== null || !!expiry?.past,
  };
}

/** The one thing "Send a pay link instead" says. */
export function payLinkInsteadWords(ranOut: boolean, expiresAt: string | null, now: number): string {
  if (ranOut) return 'The first bill goes to the owner as a one-time payment link.';
  const e = approvalExpiry(expiresAt, now);
  return `The approval link stops working${e ? ` (it would have run out ${e.when})` : ''}, and the first bill goes to the owner as a one-time payment link.`;
}

/** "Cancel payment": a renewal bill knows the month it pays for from the day it is raised; the first bill does not. */
export function cancelPaymentAction(
  p: Pick<AdminPayment, 'purpose' | 'subscriptionPeriod'>,
): Extract<MoneyAction, { kind: 'cancel_payment' }> {
  return {
    kind: 'cancel_payment',
    renewal: p.purpose === 'subscription' && p.subscriptionPeriod !== null,
  };
}

/** "Send SMS and email" is one send of the bill's link; "Give more time" and "Hold chasing" carry their own facts. */
export function moreTimeAction(tellDealer: boolean, dueOn: string): MoneyAction {
  return { kind: 'more_time', tellDealer, dueOn };
}

export function holdChasingAction(until: string | null): MoneyAction {
  return { kind: 'hold_chasing', until };
}

/** The label on the drawer's button: it sends the link by SMS and by email, so it says both. */
export function sendSmsAndEmailLabel(p: Pick<AdminPayment, 'linkSentTo'>): string {
  return p.linkSentTo?.phone || p.linkSentTo?.email
    ? 'Send SMS and email again'
    : 'Send SMS and email';
}

/**
 * "Send SMS and email": `again` when the link was texted before, by an admin's press
 * (`linkSentTo`) or by the system's own send (a `link` entry in the send log).
 */
export function sendSmsAction(
  p: Pick<AdminPayment, 'linkSentTo' | 'sends'>,
): Extract<MoneyAction, { kind: 'send_sms' }> {
  return {
    kind: 'send_sms',
    again: (p.linkSentTo ?? null) !== null || (p.sends ?? []).some((s) => s.kind === 'link'),
  };
}
