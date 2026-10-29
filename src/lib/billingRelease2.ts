/**
 * The decisions behind billing release 2 (ADR 0022 §13.3), kept out of the
 * components as plain functions (this app has no test runner;
 * `scripts/billingRelease2.check.ts` runs these, `npm run check:billing-release2`):
 *
 *  - a first month BELOW the monthly price, taken by the autopay approval itself
 *    (Razorpay's "upfront amount"): when it applies, the day the monthly price
 *    starts, who may send it, and the words that say so;
 *  - the billing history of one outlet, in pages of twenty;
 *  - "Bill this outlet again" once billing ended after a first-month refund;
 *  - the page that lists every outlet's autopay.
 *
 * TYPES ONLY from `@dk/shared`, as `lib/autopay.ts` does: the check script runs this
 * file outside Vite, where `@dk/shared` resolves to the package's compiled `dist/`.
 * Words for each way an autopay ended live in `@dk/shared` and are looked up by the
 * component, not here.
 *
 * Nothing here decides what the server does. It mirrors the server's rule so the
 * words in the window say what Send bill will do; the server has the last word and
 * its own sentence is shown if it refuses.
 */
import type {
  AdminAutopayListRow,
  AutopayViewState,
  BillingActivityItem,
  BillingActivityKind,
  MoneyAction,
  OnboardingConfig,
  OutletSetupAdmin,
  SetupMessageLang,
} from '@dk/shared';

import { sendBillAction, ymdOfIso } from './billingRelease';
import { addDays, billBody, formatPaise, isDay, ymdLabel } from './onboarding';
import type { Intent } from './statusIntent';

// ── The day the monthly price starts ────────────────────────────────────────

/**
 * A day plus whole calendar months, clamped to the last day of a short month:
 * 31 Jan + 1 month is 28 Feb, never 3 March. The same sum the server uses
 * (`addIsoMonths` in `@dk/shared`), written out here because this file may not
 * import values from the package.
 */
export function addMonthsClamped(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d!, lastOfTarget));
  return target.toISOString().slice(0, 10);
}

/**
 * The last day of the calendar month that starts on `from`: 28 Oct is 27 Nov.
 * Mirrors `periodEnd` in the backend's `billingDates.ts`.
 */
export function periodEndDay(from: string): string {
  return addDays(addMonthsClamped(from, 1), -1);
}

/**
 * The day the monthly price starts when a first month is sent today: the day after
 * the first month ends. Send bill on 30 Oct gives 30 Nov; on 31 Jan gives 28 Feb.
 * Razorpay takes the first monthly debit at 10:00 India time on this day.
 */
export function firstDebitOnFor(today: string): string {
  return addDays(periodEndDay(today), 1);
}

// ── A first month below the monthly price ───────────────────────────────────

/** The reason's length, as `sendSetupBillRequestSchema` counts it (after trimming). */
export const LOWER_FIRST_MONTH_REASON_MIN = 3;
export const LOWER_FIRST_MONTH_REASON_MAX = 300;

/** Whether the typed amount is under the monthly price. Nothing is "below" an unknown price. */
export function isBelowMonthly(
  amountPaise: number | null,
  monthlyPricePaise: number | null | undefined,
): boolean {
  return (
    amountPaise !== null &&
    amountPaise > 0 &&
    typeof monthlyPricePaise === 'number' &&
    monthlyPricePaise > 0 &&
    amountPaise < monthlyPricePaise
  );
}

/**
 * Whether the upfront approval is switched on for this outlet: on for everybody, or
 * on for the outlets named for the live test. Reads the server's own settings.
 */
export function upfrontIsOn(
  config:
    | Pick<OnboardingConfig, 'firstMonthUpfront' | 'firstMonthUpfrontOutlets'>
    | null
    | undefined,
  outletCode: string,
): boolean {
  if (!config) return false;
  return (
    config.firstMonthUpfront === true ||
    (config.firstMonthUpfrontOutlets ?? []).includes(outletCode)
  );
}

/** What the approval takes later: the monthly price, from the day it starts. */
export interface UpfrontPlan {
  monthlyPaise: number;
  /** `YYYY-MM-DD`: the first monthly debit. */
  firstDebitOn: string;
}

/**
 * The upfront plan for what is typed, or `null` when the bill goes another way
 * (the plain autopay approval at the price, or a one-time payment link).
 * It applies when ALL hold: Razorpay is on, first bills may go by autopay at all,
 * the upfront switch is on for this outlet, the amount is below the monthly price,
 * and no approval is already out (an approval already out is only sent again).
 */
export function upfrontPlan(f: {
  paymentsOn: boolean;
  firstBillAutopay: boolean;
  switchedOn: boolean;
  amountPaise: number | null;
  monthlyPricePaise: number | null;
  approvalOut: boolean;
  today: string;
}): UpfrontPlan | null {
  if (!f.paymentsOn || !f.firstBillAutopay || !f.switchedOn || f.approvalOut) return null;
  if (!isBelowMonthly(f.amountPaise, f.monthlyPricePaise)) return null;
  return { monthlyPaise: f.monthlyPricePaise!, firstDebitOn: firstDebitOnFor(f.today) };
}

/**
 * The money action "What the dealer receives" is drawn from: the usual Send bill
 * action, plus the upfront plan when one applies. With an upfront plan the bill is
 * an autopay approval even though the amount is not the monthly price.
 */
export function sendBillActionWithUpfront(
  f: Parameters<typeof sendBillAction>[0] & { upfront: UpfrontPlan | null },
): Extract<MoneyAction, { kind: 'send_bill' }> {
  const { upfront, ...rest } = f;
  const base = sendBillAction(rest);
  if (!upfront) return base;
  return { ...base, autopay: true, upfront };
}

/**
 * Whether Send bill must have a super-admin and a written reason. The rule is the
 * server's, in one place:
 *  - YES when the typed amount is below the monthly price AND it is a new bill or a
 *    change of amount (anything other than the open bill's own amount), or Send bill
 *    is about to START an upfront approval (even for a bill that is already out);
 *  - NO for sending the open bill again unchanged, or moving only its due day, while
 *    no new upfront approval would start;
 *  - NO at or above the price, and NO while the price is not known.
 */
export function lowerFirstMonthNeeded(f: {
  amountPaise: number | null;
  monthlyPricePaise: number | null | undefined;
  /** The open bill's amount, when a bill is out. */
  billedPaise: number | null;
  billOpen: boolean;
  /** Pressing Send bill now would start an upfront approval (`upfrontPlan` is not null). */
  upfrontStarts: boolean;
}): boolean {
  if (!isBelowMonthly(f.amountPaise, f.monthlyPricePaise)) return false;
  const sameAmountAsOpenBill =
    f.billOpen && f.billedPaise !== null && f.amountPaise === f.billedPaise;
  return !sameAmountAsOpenBill || f.upfrontStarts;
}

/** Why Send is blocked for a first month that needs a super-admin, or `null`. Said before the person touches anything. */
export function lowerFirstMonthBlock(f: {
  needed: boolean;
  monthlyPricePaise: number | null;
  isSuperAdmin: boolean;
}): string | null {
  if (!f.needed) return null;
  if (f.isSuperAdmin) return null;
  return `Only a super-admin can send a first month below ${formatPaise(f.monthlyPricePaise)}.`;
}

/** Why the reason box cannot be sent, or `null`. Only asked while a reason is needed. */
export function lowerFirstMonthReasonProblem(f: { needed: boolean; reason: string }): string | null {
  if (!f.needed) return null;
  const n = f.reason.trim().length;
  if (n === 0) return 'Say why this first month is lower.';
  if (n < LOWER_FIRST_MONTH_REASON_MIN)
    return `Say a little more: at least ${LOWER_FIRST_MONTH_REASON_MIN} characters.`;
  if (n > LOWER_FIRST_MONTH_REASON_MAX)
    return `That is ${n} characters. Keep it to ${LOWER_FIRST_MONTH_REASON_MAX}.`;
  return null;
}

/**
 * The body of Send bill: the usual one, plus `reason` when one is needed. Left out
 * otherwise (at or above the price, or the open bill sent again), as the server
 * ignores it there and an empty one would only be refused.
 */
export function sendBillBody(v: {
  amountText: string;
  dueOn: string;
  messageLang?: SetupMessageLang;
  reason: string;
  reasonNeeded: boolean;
}): ReturnType<typeof billBody> & { reason?: string } {
  const body = billBody({
    amountText: v.amountText,
    dueOn: v.dueOn,
    ...(v.messageLang ? { messageLang: v.messageLang } : {}),
  });
  return v.reasonNeeded ? { ...body, reason: v.reason.trim() } : body;
}

/** An approval already out that took (or will take) a special first month: what the words name. */
export interface ApprovalOutUpfront {
  upfrontPaise: number;
  monthlyPaise: number;
  /** `YYYY-MM-DD`; null when not known. */
  firstDebitOn: string | null;
}

/**
 * The upfront figures of the approval that is out, or `null` when there is none or
 * it is a plain one (no special first month).
 */
export function approvalOutUpfront(
  current:
    | { upfrontPaise: number | null; amountPaise: number; firstDebitOn: string | null }
    | null
    | undefined,
): ApprovalOutUpfront | null {
  if (!current || current.upfrontPaise === null || current.upfrontPaise === undefined) return null;
  return {
    upfrontPaise: current.upfrontPaise,
    monthlyPaise: current.amountPaise,
    firstDebitOn: isDay(current.firstDebitOn) ? current.firstDebitOn : null,
  };
}

/**
 * The words under the Send bill form: what pressing it will do. Same rule as the
 * server, so the sentence and the preview below it agree.
 */
export function sendBillWords(f: {
  paymentsOn: boolean;
  monthlyPricePaise: number | null;
  amountPaise: number | null;
  upfront: UpfrontPlan | null;
  /** An autopay approval is already with the owner (it is only sent again, never replaced). */
  approvalOut: boolean;
  /** When that approval took a special first month: named in the words. */
  approvalOutUpfront?: ApprovalOutUpfront | null;
}): string {
  const price = f.monthlyPricePaise;
  const small = ' In the dealer’s app they see only the amount and the due date, never how to pay.';
  if (!f.paymentsOn) {
    return `Razorpay is not switched on, so there is no payment link. This raises the bill as a payment and gives you the WhatsApp message to send: add your UPI or bank details to it before you do.${small}`;
  }
  // An approval already out goes again whatever is typed now, so this comes before any word about the price.
  if (f.approvalOut) {
    const u = f.approvalOutUpfront;
    const which = u
      ? ` It takes ${formatPaise(u.upfrontPaise)} for the first month, then ${formatPaise(u.monthlyPaise)}${u.firstDebitOn ? ` from ${ymdLabel(u.firstDebitOn)}` : ' a month'}.`
      : '';
    return `The approval is already with the owner. Razorpay does not text it again; you get the WhatsApp words to send.${which}`;
  }
  if (f.upfront && f.amountPaise !== null) {
    return `The owner approves autopay once: ${formatPaise(f.amountPaise)} is taken now for the first month, then ${formatPaise(f.upfront.monthlyPaise)} from ${ymdLabel(f.upfront.firstDebitOn)} every month. There is no separate payment link, so they cannot pay twice. You then get the WhatsApp message to send (or it goes by itself once the template is approved).${small}`;
  }
  if (price && f.amountPaise !== null && f.amountPaise !== price) {
    return `${formatPaise(f.amountPaise)} is not the monthly price (${formatPaise(price)}), and autopay only takes the monthly price, so this bill goes as a one-time payment link. Razorpay texts the owner the link; set up autopay once it is paid. You then get the WhatsApp message to send (or it goes by itself once the template is approved).${small}`;
  }
  return `This asks the owner to approve autopay: approving it pays this ${price ? formatPaise(price) : 'bill'} now and then takes the same every month. There is no separate payment link, so they cannot pay twice. You then get the WhatsApp message to send (or it goes by itself once the template is approved).${small}`;
}

/**
 * The line on the Autopay panel for an autopay that took a special first month:
 * "₹1 first month, then ₹3,540 from 30 Nov". `null` when the autopay has none.
 * `today` is an IST `YYYY-MM-DD`; the year is left out while it is this year.
 */
export function upfrontLine(
  a: { upfrontPaise: number | null; amountPaise: number; firstDebitOn: string | null },
  today: string,
): string | null {
  if (a.upfrontPaise === null || a.upfrontPaise === undefined) return null;
  const first = `${formatPaise(a.upfrontPaise)} first month`;
  if (!isDay(a.firstDebitOn)) return `${first}, then ${formatPaise(a.amountPaise)} a month`;
  const full = ymdLabel(a.firstDebitOn);
  const day = a.firstDebitOn.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
  return `${first}, then ${formatPaise(a.amountPaise)} from ${day}`;
}

// ── Billing history ─────────────────────────────────────────────────────────

/** Lines shown at a time, and added by each "Show more". */
export const ACTIVITY_PAGE = 20;

/** The small label in front of each line. */
export const ACTIVITY_KIND_LABEL: Record<BillingActivityKind, string> = {
  bill: 'Bill',
  sent: 'Sent',
  paid: 'Money in',
  more_time: 'More time',
  hold: 'Hold',
  autopay: 'Autopay',
  refund: 'Refund',
  billing: 'Billing',
};

/** Its colour: money in is green, money out and a change to billing itself stand out, the rest are quiet. */
export const ACTIVITY_KIND_INTENT: Record<BillingActivityKind, Intent> = {
  bill: 'neutral',
  sent: 'neutral',
  paid: 'success',
  more_time: 'neutral',
  hold: 'warning',
  autopay: 'info',
  refund: 'warning',
  billing: 'warning',
};

/** Newest first, whatever order they came in. Equal times keep the server's order. */
export function newestActivityFirst(items: readonly BillingActivityItem[]): BillingActivityItem[] {
  return items
    .map((item, i) => ({ item, i, t: Date.parse(item.at) }))
    .sort((a, b) => {
      const ta = Number.isNaN(a.t) ? -Infinity : a.t;
      const tb = Number.isNaN(b.t) ? -Infinity : b.t;
      return tb - ta || a.i - b.i;
    })
    .map((x) => x.item);
}

/** The first `shown` lines, and how many are left behind "Show more". */
export function activityPage(
  items: readonly BillingActivityItem[],
  shown: number,
): { lines: BillingActivityItem[]; left: number; next: number } {
  const lines = items.slice(0, Math.max(0, shown));
  const left = Math.max(0, items.length - lines.length);
  return { lines, left, next: Math.min(ACTIVITY_PAGE, left) };
}

/** Who did it: the admin's name, or a plain "the owner or the system" when nobody on the team did. */
export function activityWho(byName: string | null | undefined): string {
  return byName && byName.trim() ? byName.trim() : 'Owner or automatic';
}

/** The label on "Show more": how many more it brings. */
export function showMoreLabel(left: number): string {
  const n = Math.min(ACTIVITY_PAGE, left);
  return `Show ${n} more`;
}

// ── Bill this outlet again ──────────────────────────────────────────────────

/**
 * Whether billing ended for this outlet: its first month was given back and nobody
 * has billed it again. Reads the server's own flag (`subscription.billingEnded`) and
 * nothing else. A closed outlet is not "ended", it is closed.
 */
export function billingHasEnded(
  setup: Pick<OutletSetupAdmin, 'lost'> & {
    subscription: Pick<OutletSetupAdmin['subscription'], 'billingEnded'>;
  },
): boolean {
  if (setup.lost) return false;
  return !!setup.subscription.billingEnded;
}

/**
 * The plain sentence every admin sees on an outlet whose billing ended:
 * "Billing ended when the first month was given back on 30 Oct." `null` otherwise.
 * `today` is an IST `YYYY-MM-DD`; the year is left out while it is this year.
 */
export function billingEndedLine(
  setup: Parameters<typeof billingHasEnded>[0],
  today: string,
): string | null {
  if (!billingHasEnded(setup)) return null;
  const day = dayShort(ymdOfIso(setup.subscription.billingEnded?.at ?? null), today);
  return `Billing ended when the first month was given back${day ? ` on ${day}` : ''}.`;
}

/** The button shows for a super-admin on an outlet whose billing ended. */
export function canBillAgain(
  setup: Parameters<typeof billingHasEnded>[0],
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin && billingHasEnded(setup);
}

export const RESTART_REASON_MIN = 3;
export const RESTART_REASON_MAX = 300;

/** Why the restart's reason cannot be sent, or `null`. Counted after trimming, as the server counts. */
export function restartReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return 'Say why billing starts again.';
  if (n < RESTART_REASON_MIN)
    return `Say a little more: at least ${RESTART_REASON_MIN} characters.`;
  if (n > RESTART_REASON_MAX) return `That is ${n} characters. Keep it to ${RESTART_REASON_MAX}.`;
  return null;
}

/** The body of the restart call. */
export function restartBillingBody(reason: string): { reason: string } {
  return { reason: reason.trim() };
}

/**
 * What the "Bill this outlet again" window says: the new month starts today, with
 * the real date. `today` is an IST `YYYY-MM-DD`.
 */
export function restartWords(today: string): string {
  return `Billing for this outlet ended when its first month was given back. This starts it again, with the month that starts today (${dayShort(today, today) ?? today}).`;
}

/**
 * "What the dealer receives" for the restart: nothing now, a bill at the monthly price on
 * the next daily run. Only drawn once the price is known, so it takes a real price and
 * never makes up a "₹0".
 */
export function restartBillingAction(monthlyPricePaise: number): MoneyAction {
  return { kind: 'restart_billing', amountPaise: monthlyPricePaise };
}

// ── Every outlet's autopay ──────────────────────────────────────────────────

export const AUTOPAY_LIST_STATES: readonly AutopayViewState[] = [
  'failing',
  'setting_up',
  'on',
  'off',
];

/** The state filter's words. `''` is every state. */
export const AUTOPAY_LIST_FILTER_LABEL: Record<AutopayViewState, string> = {
  failing: 'Debit failing',
  setting_up: 'Waiting for approval',
  on: 'On',
  off: 'Off',
};

/** A `?state=` value read back: a known state, or `null` for anything else. */
export function listStateFromParam(raw: string | null | undefined): AutopayViewState | null {
  return AUTOPAY_LIST_STATES.find((s) => s === raw) ?? null;
}

/**
 * Rows for one state, or all of them for `null`. The server's order is kept: it already
 * puts a failing debit first, then an owner who needs a call, then approvals still
 * waiting. Nothing here re-sorts, so the page and the server never disagree.
 */
export function filterAutopayRows(
  rows: readonly AdminAutopayListRow[],
  state: AutopayViewState | null,
): AdminAutopayListRow[] {
  return state ? rows.filter((r) => r.state === state) : rows.slice();
}

/** How many rows are in each state, for the filter's labels. */
export function autopayStateCounts(
  rows: readonly AdminAutopayListRow[],
): Record<AutopayViewState, number> {
  const out: Record<AutopayViewState, number> = { failing: 0, setting_up: 0, on: 0, off: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}

/** "28 Oct" while it is this year, "9 Jan 2027" after. `today` is an IST `YYYY-MM-DD`. */
function dayShort(ymd: string | null, today: string): string | null {
  if (!isDay(ymd)) return null;
  const full = ymdLabel(ymd);
  return ymd.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
}

/** What one row says in each column, as plain text. A column with nothing to say is `null`. */
export interface AutopayRowFacts {
  /** "₹3,540 a month", or "₹1 now, then ₹3,540 a month" when it took a special first month. */
  amount: string | null;
  nextDebit: string | null;
  paidTill: string | null;
  /** While an approval waits: "Sent 28 Oct, runs out 4 Nov". */
  waiting: string | null;
  /** "Asked 29 Oct", only while the owner still needs a call. */
  refundAsked: string | null;
  /** The day it ended; the component adds how, from the shared words. */
  endedDay: string | null;
  /**
   * The same facts for the phone card, which has no column headers: each says what it
   * is in its own words. A fact with nothing to say is `null`, and the card prints nothing for it.
   */
  phone: {
    nextDebit: string | null;
    paidTill: string | null;
    waiting: string | null;
    refundAsked: string | null;
  };
}

/** The words of one row. `today` is an IST `YYYY-MM-DD`. */
export function autopayRowFacts(r: AdminAutopayListRow, today: string): AutopayRowFacts {
  const sent = dayShort(ymdOfIso(r.approvalSentAt), today);
  const runsOut = dayShort(ymdOfIso(r.approvalExpiresAt), today);
  const waiting =
    r.state === 'setting_up' && (sent || runsOut)
      ? [sent ? `Sent ${sent}` : null, runsOut ? `runs out ${runsOut}` : null]
          .filter(Boolean)
          .join(', ')
      : null;
  const waitingPhone =
    r.state === 'setting_up' && (sent || runsOut)
      ? [sent ? `Waiting since ${sent}` : null, runsOut ? `runs out ${runsOut}` : null]
          .filter(Boolean)
          .join(', ')
      : null;
  // The badge is for a call still to make. Once it is logged, refunded or billing ended, the ask is history.
  const asked = r.needsCall ? dayShort(ymdOfIso(r.refundAskedAt), today) : null;
  const next = dayShort(r.nextDebitOn, today);
  const paid = dayShort(r.paidThrough, today);
  const monthly = r.amountPaise === null ? null : `${formatPaise(r.amountPaise)} a month`;
  const hasUpfront = r.upfrontPaise !== null && r.upfrontPaise !== undefined;
  return {
    amount:
      monthly === null
        ? null
        : hasUpfront
          ? `${formatPaise(r.upfrontPaise)} now, then ${monthly}`
          : monthly,
    nextDebit: next,
    paidTill: paid,
    waiting,
    refundAsked: asked ? `Asked ${asked}` : null,
    endedDay: dayShort(ymdOfIso(r.endedAt), today),
    phone: {
      nextDebit: next ? `Next debit ${next}` : null,
      paidTill: paid ? `Paid till ${paid}` : null,
      waiting: waitingPhone,
      refundAsked: asked ? `Refund asked ${asked}` : null,
    },
  };
}

/** Where a row leads: the outlet's Info tab. */
export function autopayRowHref(dealerId: string): string {
  return `/dealers/${dealerId}?tab=info`;
}
