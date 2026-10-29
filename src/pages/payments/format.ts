/**
 * The Payments page's decisions, kept out of the components so they read as
 * plain rules (this app has no test runner; `scripts/payments.check.ts` checks
 * these). Amounts are whole paise everywhere in here; `formatPaise` and
 * `parseRupeesToPaise` from `@dk/shared` are the only two things that turn them
 * into rupees and back, so a payment never reads two ways.
 *
 * Nothing in here decides whether a payment IS paid, cancelled or refundable —
 * the server does, and says so in `status`. What lives here is which buttons
 * that answer allows, so a button is never offered that the server would
 * refuse.
 */
import { refundDayProblem } from '@/lib/autopay';
import { formatYmd, isYmd } from '@/lib/format';
import { istStamp, phoneLabel } from '@/lib/intake';
import { PAYMENT_MODE_LABEL, PAYMENT_REFERENCE_MAX } from '@/lib/onboarding';
import type { Intent } from '@/lib/statusIntent';
import {
  GST_RATE_PERCENT,
  GST_STATES,
  PAYMENT_MAX_PAISE,
  PAYMENT_MIN_PAISE,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  SETTLED_STATUSES,
  SUPPLIER_STATE_CODE,
  cleanGstin,
  dealerCodeLabel,
  formatPaise,
  isGstin,
  parseRupeesToPaise,
  splitGstInclusive,
} from '@dk/shared';
import type {
  AdminAutopayOverview,
  AdminPayment,
  GstDocumentSummary,
  InvoiceBlocker,
  ManualPaymentMode,
  PaymentAttempt,
  PaymentBillTo,
  PaymentChannel,
  PaymentExtraCapture,
  PaymentPurpose,
  PaymentRefund,
  PaymentStatus,
  RefundStatus,
} from '@dk/shared';
import { billToSchema, createPaymentSchema } from '@dk/shared/schemas';
import type { BillToInput, CreatePaymentInput, RecordManualRefundInput } from '@dk/shared/schemas';

/**
 * How long the free text may be. Mirror `createPaymentSchema` and
 * `cancelPaymentSchema` / `refundPaymentSchema` in `@dk/shared`;
 * `scripts/payments.check.ts` fails if they ever disagree.
 */
export const PAYMENT_TITLE_MIN = 3;
export const PAYMENT_TITLE_MAX = 120;
export const PAYMENT_NOTE_MAX = 500;
export const PAYMENT_REASON_MIN = 3;
export const PAYMENT_REASON_MAX = 300;

// ---------------------------------------------------------------- list ----

/** The chip's colour for each status. */
export function statusTone(status: PaymentStatus): Intent {
  switch (status) {
    case 'due':
      // Waiting on the outlet: the one state somebody may need to chase.
      return 'warning';
    case 'processing':
      return 'info';
    case 'paid':
      return 'success';
    case 'partially_refunded':
      return 'info';
    case 'cancelled':
    case 'refunded':
      return 'neutral';
  }
}

/** Something a person must look at and nobody has said they have. */
export function hasOpenProblem(p: Pick<AdminPayment, 'problem'>): boolean {
  return !!p.problem && !p.problem.checkedAt;
}

/** Past its due date and still unpaid. `today` is an IST `YYYY-MM-DD`. */
export function isPastDue(p: Pick<AdminPayment, 'status' | 'dueDate'>, today: string): boolean {
  return p.status === 'due' && !!p.dueDate && p.dueDate < today;
}

/** The filters live in the URL, so each is read back defensively: a mangled link shows everything rather than nothing. */
export function statusFromParam(v: string | null): PaymentStatus | undefined {
  return (PAYMENT_STATUSES as readonly string[]).includes(v ?? '')
    ? (v as PaymentStatus)
    : undefined;
}

export function pageFromParam(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** `?payment=` and `?dealer=` end up in a request, so only something shaped like an id is let through. */
export function idFromParam(v: string | null): string | null {
  return v && /^[a-f0-9]{24}$/i.test(v) ? v : null;
}

// ------------------------------------------------------------- actions ----

/** The money that can still be given back: all of it until a refund, then what is left. Zero for anything not paid. */
export function refundable(
  p: Pick<AdminPayment, 'status' | 'amountPaise' | 'refundedPaise'>,
): number {
  if (p.status !== 'paid' && p.status !== 'partially_refunded') return 0;
  return Math.max(0, p.amountPaise - p.refundedPaise);
}

/**
 * The most that can be written down as given back by hand: what actually came in
 * by hand (a short payment, tax deducted at source, came short of the bill) less
 * what has been given back already. Zero for anything that did not come by hand.
 */
export function manualRefundable(
  p: Pick<AdminPayment, 'status' | 'amountPaise' | 'refundedPaise' | 'manual'>,
): number {
  if (!p.manual) return 0;
  const came = Math.min(p.amountPaise, p.manual.amountPaise);
  return Math.min(refundable(p), Math.max(0, came - p.refundedPaise));
}

export interface PaymentActions {
  /** Get a link to paste into WhatsApp. */
  copyLink: boolean;
  /** Have Razorpay send the link by SMS (and email) to the outlet. */
  sendSms: boolean;
  /** Look the payment up at Razorpay now. */
  check: boolean;
  /** Withdraw it. */
  cancel: boolean;
  /** Give money back through Razorpay. Never for money that came by hand. */
  refund: boolean;
  /** Write down money that was given back by hand (bank, UPI, cash), for a payment that came by hand. */
  recordManualRefund: boolean;
  /** Say a person has looked at what went wrong. */
  markChecked: boolean;
  /** Money came outside Razorpay: record it by hand. */
  recordPayment: boolean;
}

/**
 * Which buttons a payment's drawer shows, for this person.
 *
 * Every rule here is the server's own, written down so the button is not
 * offered just to be refused:
 *  - a link, an SMS and a cancel only make sense while the payment is `due`
 *    (a `processing` one has money in flight, and cancelling it is refused);
 *  - an SMS needs a link that can still be paid (`linkUrl` is empty once a
 *    link has expired or been cancelled), so it waits for one — Copy link makes
 *    a fresh one;
 *  - looking a payment up needs something to look up at Razorpay — a cancelled
 *    one still counts, because it may have been paid after it was withdrawn;
 *  - refunding is a super-admin's alone (money going back is not onboarding), and
 *    only of what is still unreturned. Money that came by hand cannot go back
 *    through Razorpay (the server refuses it), so it is never offered the
 *    Razorpay Refund; it is offered "Record a refund made by hand" instead;
 *  - recording money that came outside Razorpay is any admin's, and only while the
 *    payment is `due` (one Razorpay is confirming is left to settle).
 */
export function allowedActions(p: AdminPayment, isSuperAdmin: boolean): PaymentActions {
  const due = p.status === 'due';
  return {
    // While a first-month autopay approval is out, the server refuses a link or an SMS
    // (409 WAITING_FOR_AUTOPAY): approving pays the bill, and a link too would be paying twice.
    copyLink: due && !p.waitingForAutopayApproval,
    sendSms: due && !!p.linkUrl && !p.waitingForAutopayApproval,
    check: Boolean(p.razorpayOrderId || p.razorpayLinkId || p.razorpayPaymentId),
    cancel: due,
    refund: isSuperAdmin && refundable(p) > 0 && !p.manual,
    recordManualRefund: isSuperAdmin && manualRefundable(p) > 0,
    markChecked: hasOpenProblem(p),
    recordPayment: due,
  };
}

/** Somebody else's words as a finished sentence: Razorpay's reasons do not always end with a full stop. */
export function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** "Send SMS again" only once an SMS has gone; before that it is the first one. */
export function sendSmsLabel(p: Pick<AdminPayment, 'linkSentTo'>): string {
  return p.linkSentTo?.phone || p.linkSentTo?.email ? 'Send SMS again' : 'Send link by SMS';
}

/** What the toast says after "Check with Razorpay": whether it found anything new. */
export function checkOutcome(before: PaymentStatus | undefined, after: PaymentStatus): string {
  return before !== undefined && before !== after
    ? `Razorpay says it is now ${PAYMENT_STATUS_LABELS[after].toLowerCase()}.`
    : `Nothing new from Razorpay. It is still ${PAYMENT_STATUS_LABELS[after].toLowerCase()}.`;
}

// --------------------------------------------------------------- words ----

/** One plain sentence under the status chip: what the state means and what happens next. */
export function statusHint(p: AdminPayment, today: string): string {
  switch (p.status) {
    case 'due':
      if (p.waitingForAutopayApproval) {
        return 'Waiting for the owner to approve autopay. Approving pays this bill. The link and SMS are off until then.';
      }
      // Autopay is lined up to take it: nobody needs to chase the owner for it.
      if (p.autopayOn) return `Autopay will take this on ${formatYmd(p.autopayOn)}.`;
      return isPastDue(p, today)
        ? `Not paid yet. It was due on ${formatYmd(p.dueDate)}.`
        : 'Waiting for the outlet to pay.';
    case 'processing':
      return 'Razorpay has the payment but has not confirmed it yet. It settles by itself; Check with Razorpay looks it up now.';
    case 'paid':
      // Money recorded by hand may have come short (tax deducted at source).
      return p.manual && p.manual.shortfallPaise > 0
        ? `Paid by hand for ${formatPaise(p.manual.amountPaise)}. ${formatPaise(p.manual.shortfallPaise)} is short of the bill; the invoice is still for the whole of it.`
        : 'Paid in full.';
    case 'cancelled':
      return 'Withdrawn before anything was paid.';
    case 'partially_refunded':
      return `Paid, and ${formatPaise(p.refundedPaise)} of ${formatPaise(p.amountPaise)} has been given back.`;
    case 'refunded':
      return 'Paid, then given back in full.';
  }
}

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  paylater: 'Pay later',
  // Money recorded by hand (`paidVia: 'manual'`): the receipt's method words.
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
};

/** Razorpay's method word as an admin reads it; one this app has not seen is shown as sent. */
export function methodLabel(method: string | null): string {
  if (!method) return '—';
  return METHOD_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  link: 'Payment link',
  checkout: 'On the website',
  manual: 'Recorded by hand',
  autopay: 'Autopay',
};

export function channelLabel(channel: PaymentChannel | null): string {
  return channel ? CHANNEL_LABELS[channel] : '—';
}

/** "Asha · 12 Oct, 14:05". Either half is left out when it is not known. */
export function byAt(name: string | null | undefined, iso: string | null | undefined): string {
  const when = istStamp(iso);
  if (name && when) return `${name} · ${when}`;
  return name || when || '—';
}

/** "+91 98765 43210 and asha@example.com", or `null` when the link was sent nowhere. */
export function linkSentLine(p: Pick<AdminPayment, 'linkSentTo'>): string | null {
  const to = p.linkSentTo;
  if (!to) return null;
  const parts = [to.phone ? phoneLabel(to.phone) : null, to.email].filter((v): v is string => !!v);
  return parts.length ? parts.join(' and ') : null;
}

export const ATTEMPT_LABELS: Record<PaymentAttempt['status'], string> = {
  failed: 'Failed',
  authorized: 'Held by the bank',
  captured: 'Received',
};

export function attemptTone(status: PaymentAttempt['status']): Intent {
  switch (status) {
    case 'failed':
      return 'danger';
    case 'authorized':
      return 'info';
    case 'captured':
      return 'success';
  }
}

export const REFUND_LABELS: Record<RefundStatus, string> = {
  pending: 'On its way back',
  processed: 'Given back',
  failed: 'Failed',
};

export function refundTone(status: RefundStatus): Intent {
  switch (status) {
    case 'pending':
      return 'info';
    case 'processed':
      return 'success';
    case 'failed':
      return 'danger';
  }
}

/** "₹500 · Customer asked for it · Asha · 12 Oct, 14:05" */
export function refundLine(r: PaymentRefund): string {
  if (r.manual) return manualRefundLine(r);
  return [formatPaise(r.amountPaise), r.reason, byAt(r.byName, r.createdAt)].join(' · ');
}

/** A refund made by hand, in words: how it went back, the reference, the day, why, who wrote it down. */
export function manualRefundLine(r: PaymentRefund): string {
  const m = r.manual;
  const how = m
    ? `Given back by ${PAYMENT_MODE_LABEL[m.mode]}${m.reference ? ` (${m.reference})` : ''} on ${formatYmd(m.refundedOn)}`
    : 'Given back by hand';
  return [formatPaise(r.amountPaise), how, r.reason, byAt(r.byName, r.createdAt)].join(' · ');
}

/** A second capture, in words: what happened to the extra money. */
export function extraCaptureLine(c: PaymentExtraCapture): string {
  const paid = `${formatPaise(c.amountPaise)} was paid a second time (${istStamp(c.at) || 'time unknown'}).`;
  return c.razorpayRefundId
    ? `${paid} It was given back automatically.`
    : `${paid} The automatic refund is not confirmed — check it in Razorpay.`;
}

/** Newest first, for the history lists in the drawer. ISO instants sort as text. */
export function newestFirst<T>(items: readonly T[], at: (item: T) => string): T[] {
  return [...items].sort((a, b) => at(b).localeCompare(at(a)));
}

// ------------------------------------------------------ razorpay links ----

/** The pieces of Razorpay's dashboard an id can open. */
export type RazorpayThing = 'payment' | 'order' | 'link' | 'subscription';

const DASHBOARD_PATH: Record<RazorpayThing, string> = {
  payment: 'payments',
  order: 'orders',
  link: 'paymentlinks',
  subscription: 'subscriptions',
};

const ID_SHAPE: Record<RazorpayThing, RegExp> = {
  payment: /^pay_[A-Za-z0-9]+$/,
  order: /^order_[A-Za-z0-9]+$/,
  link: /^plink_[A-Za-z0-9]+$/,
  subscription: /^sub_[A-Za-z0-9]+$/,
};

/**
 * Where Razorpay's dashboard shows this id, or `null` when it is not an id of
 * that kind — the id came off the server, but it ends up in a link, so only
 * the shape Razorpay itself issues is let through. The dashboard opens in
 * whichever mode (test or live) the person last used there.
 */
export function dashboardUrl(kind: RazorpayThing, id: string | null | undefined): string | null {
  if (!id || !ID_SHAPE[kind].test(id)) return null;
  return `https://dashboard.razorpay.com/app/${DASHBOARD_PATH[kind]}/${id}`;
}

// -------------------------------------------------------------- amounts ----

/**
 * An amount as something to put in a rupee box: `499900` → `4999`, `499950` →
 * `4999.50`. No grouping commas and no ₹, so it is exactly what a person would
 * type and `parseRupeesToPaise` reads it back to the same paise.
 */
export function rupeesText(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}

/** Why a typed rupee amount is not one, or `null`. The paise it means are `parseRupeesToPaise`'s answer. */
export function amountProblem(raw: string): string | null {
  if (!raw.trim()) return 'Enter the amount in rupees.';
  const paise = parseRupeesToPaise(raw);
  if (paise === null) return 'That is not an amount. Use rupees, for example 4999 or 4,999.50.';
  if (paise < PAYMENT_MIN_PAISE)
    return `The smallest payment is ${formatPaise(PAYMENT_MIN_PAISE)}.`;
  if (paise > PAYMENT_MAX_PAISE) return `The largest payment is ${formatPaise(PAYMENT_MAX_PAISE)}.`;
  return null;
}

/**
 * The amount to refund, from what was typed — or why it cannot be. It may not
 * be more than what is still unreturned; the server checks the same, and this
 * says it in rupees before a request is made.
 */
export function refundAmount(
  raw: string,
  p: Pick<AdminPayment, 'status' | 'amountPaise' | 'refundedPaise'>,
): { ok: true; paise: number } | { ok: false; problem: string } {
  if (!raw.trim()) return { ok: false, problem: 'Enter the amount to give back, in rupees.' };
  const paise = parseRupeesToPaise(raw);
  if (paise === null) {
    return { ok: false, problem: 'That is not an amount. Use rupees, for example 500 or 499.50.' };
  }
  if (paise < PAYMENT_MIN_PAISE) {
    return { ok: false, problem: `The smallest refund is ${formatPaise(PAYMENT_MIN_PAISE)}.` };
  }
  const most = refundable(p);
  if (paise > most) {
    return {
      ok: false,
      problem:
        most === 0
          ? 'Nothing is left to give back.'
          : `At most ${formatPaise(most)} can be given back.`,
    };
  }
  return { ok: true, paise };
}

/** Why the reason cannot be saved, or `null`. Judged trimmed, as the server does. */
export function reasonProblem(raw: string): string | null {
  const length = raw.trim().length;
  if (length < PAYMENT_REASON_MIN)
    return 'Say why, in a few words. The reason is kept with the payment.';
  if (length > PAYMENT_REASON_MAX) {
    return `Keep it under ${PAYMENT_REASON_MAX} characters. It is ${length.toLocaleString('en-IN')} now.`;
  }
  return null;
}

/** The sentence a refund's last step reads out, with the figures it is about to act on. */
export function refundSentence(
  p: Pick<AdminPayment, 'number' | 'dealerCode'>,
  paise: number,
): string {
  return `You are giving ${formatPaise(paise)} back to outlet ${dealerCodeLabel(p.dealerCode)} for payment ${p.number}. The money returns to the card, bank account or UPI app it was paid from. This cannot be undone.`;
}

/** True when autopay took this payment: refunding it does not stop that autopay. */
export function takenByAutopay(
  p: Pick<AdminPayment, 'paidVia' | 'razorpaySubscriptionId'>,
): boolean {
  return p.paidVia === 'autopay' || !!p.razorpaySubscriptionId;
}

/** What the outlet's autopay overview says that a refund warning needs. */
export type RefundWarningOverview = Pick<AdminAutopayOverview, 'current' | 'firstMonth'>;

/**
 * Said in both refund dialogs. What a refund does to autopay depends on which
 * payment it is:
 *
 *  - the outlet's FIRST bill, inside its first month: a FULL refund also stops
 *    autopay and ends billing, as "Give the first month back" does; a part refund
 *    does not;
 *  - any other payment of an outlet whose autopay is still on: the refund gives
 *    money back and nothing else, so autopay takes the next month. (With the
 *    overview not yet loaded, a payment autopay took is warned the same way.)
 *
 * `null` when there is nothing to say. `overview` is `undefined` while it loads.
 */
export function refundAutopayWarning(
  p: Pick<AdminPayment, 'id' | 'paidVia' | 'razorpaySubscriptionId'>,
  overview: RefundWarningOverview | undefined,
  today: string,
): string | null {
  const first = overview?.firstMonth;
  const inFirstMonth = !first?.refundableUntil || today <= first.refundableUntil;
  if (first && first.paymentId === p.id && inFirstMonth) {
    return 'A full refund of the first month also stops autopay and ends billing for this outlet, the same as "Give the first month back" on its page. A part refund does not.';
  }
  const autopayOn = overview ? overview.current !== null : takenByAutopay(p);
  if (!autopayOn) return null;
  return 'Refunding this payment does not stop autopay, so the owner is charged again next month. To stop it, use "Stop autopay" on the outlet\'s page, in its Setup card.';
}

/** The "Record a refund made by hand" form as typed: everything is still text. */
export interface ManualRefundDraft {
  /** Rupees, as typed. */
  amountText: string;
  /** `YYYY-MM-DD`: the day the money went back. */
  refundedOn: string;
  mode: ManualPaymentMode;
  reference: string;
  reason: string;
}

/** Why the hand refund cannot be saved, or `null`. Mirrors `recordManualRefundSchema` and the amount left. */
export function manualRefundProblem(
  d: ManualRefundDraft,
  p: Pick<AdminPayment, 'status' | 'amountPaise' | 'refundedPaise' | 'manual'>,
  today: string,
): string | null {
  const paise = parseRupeesToPaise(d.amountText);
  if (!d.amountText.trim()) return 'Enter the amount you gave back, in rupees.';
  if (paise === null) {
    return 'That is not an amount. Use rupees, for example 500 or 499.50.';
  }
  if (paise < PAYMENT_MIN_PAISE) return `The smallest refund is ${formatPaise(PAYMENT_MIN_PAISE)}.`;
  const most = manualRefundable(p);
  if (paise > most) {
    return most === 0
      ? 'Nothing is left to record.'
      : `At most ${formatPaise(most)} can be recorded.`;
  }
  // Not in the future, and not before the day the money came: the server refuses both.
  const dayIssue = refundDayProblem(d.refundedOn, p.manual?.paidOn, today);
  if (dayIssue) return dayIssue;
  if (d.reference.trim().length > PAYMENT_REFERENCE_MAX) {
    return `Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.`;
  }
  return reasonProblem(d.reason);
}

/**
 * The body for `POST /admin/payments/:id/manual-refund`; only call it once
 * `manualRefundProblem` is `null`. `scripts/payments.check.ts` checks it against
 * `recordManualRefundSchema`.
 */
export function manualRefundBody(d: ManualRefundDraft): RecordManualRefundInput {
  const reference = d.reference.trim();
  return {
    amountPaise: parseRupeesToPaise(d.amountText) ?? 0,
    refundedOn: d.refundedOn,
    mode: d.mode,
    ...(reference ? { reference } : {}),
    reason: d.reason.trim(),
  };
}

/** What recording a hand refund does, in words, with the figures. */
export function manualRefundSentence(
  p: Pick<AdminPayment, 'number' | 'dealerCode'>,
  paise: number,
): string {
  return `This writes down that ${formatPaise(paise)} was already given back to outlet ${dealerCodeLabel(p.dealerCode)} for payment ${p.number}. No money is sent from here. The payment then counts as refunded by that much, and the GST credit note follows.`;
}

/** What cancelling does, in words, with this payment's figures. */
export function cancelSentence(
  p: Pick<AdminPayment, 'number' | 'dealerCode' | 'amountPaise'>,
): string {
  return `This withdraws payment ${p.number}: ${formatPaise(p.amountPaise)} asked from outlet ${dealerCodeLabel(p.dealerCode)}. Its payment link stops working. If they still pay, the money is given back automatically and you get an alert.`;
}

// ------------------------------------------------------- GST invoices ----

/**
 * How long the "Bill to" text may be. Mirror `billToSchema` in `@dk/shared`;
 * `scripts/payments.check.ts` fails if they ever disagree.
 */
export const BILL_TO_NAME_MIN = 2;
export const BILL_TO_NAME_MAX = 160;
export const BILL_TO_ADDRESS_MIN = 5;
export const BILL_TO_ADDRESS_MAX = 300;

/**
 * Who the invoice is made out to, as typed: everything is still text, and the
 * state may be empty. A dealer has no stored name or address (a dealer is its
 * code), so an admin types them; only the GSTIN can come from the outlet.
 */
export interface BillToDraft {
  name: string;
  /** As typed; `cleanGstin` tidies it. Empty for a buyer not registered for GST. */
  gstin: string;
  address: string;
  /** A two-digit GST state code, or empty. */
  stateCode: string;
}

export const EMPTY_BILL_TO: BillToDraft = { name: '', gstin: '', address: '', stateCode: '' };

export type BillToField = 'name' | 'gstin' | 'address' | 'stateCode';
export type BillToProblems = Partial<Record<BillToField | 'form', string>>;

/** Every state a GSTIN can name, in code order, for the state box. */
export const GST_STATE_OPTIONS: readonly { code: string; label: string }[] = Object.entries(
  GST_STATES,
)
  .map(([code, name]) => ({ code, label: `${name} (${code})` }))
  .sort((a, b) => a.code.localeCompare(b.code));

function isStateCode(code: string): boolean {
  return Object.hasOwn(GST_STATES, code);
}

/** "Haryana (06)", or the code as it came when it is not one we know. */
export function stateLabel(code: string): string {
  const name = isStateCode(code) ? GST_STATES[code] : undefined;
  return name ? `${name} (${code})` : code || '—';
}

/** Where the company is registered: a buyer here pays CGST + SGST, anywhere else IGST. */
export const SUPPLIER_STATE_LABEL = stateLabel(SUPPLIER_STATE_CODE);

/** The state a GSTIN names, from its first two digits; `null` while they are not (yet) a state. */
export function stateForGstin(raw: string): string | null {
  const code = cleanGstin(raw).slice(0, 2);
  return isStateCode(code) ? code : null;
}

/**
 * The state the invoice is made out for. A GSTIN's own state always wins over
 * a state picked earlier: the first two digits of a GSTIN ARE the place of
 * supply, and the shared schema refuses a pair that disagree.
 */
export function billToState(d: Pick<BillToDraft, 'gstin' | 'stateCode'>): string {
  return stateForGstin(d.gstin) ?? d.stateCode;
}

/**
 * What typing in the GSTIN box does to the whole bill-to: the text is tidied
 * (upper case, no spaces, at most 15 characters) and the state follows it.
 * Clearing the box leaves the state where it was, so it can be picked by hand.
 */
export function withGstin(d: BillToDraft, raw: string): BillToDraft {
  const gstin = cleanGstin(raw).slice(0, 15);
  return { ...d, gstin, stateCode: stateForGstin(gstin) ?? d.stateCode };
}

/** A saved bill-to, as a draft to edit. */
export function billToDraftFrom(b: PaymentBillTo | null | undefined): BillToDraft {
  return b
    ? { name: b.name, gstin: b.gstin ?? '', address: b.address, stateCode: b.stateCode }
    : EMPTY_BILL_TO;
}

/**
 * The bill-to once an outlet is picked: the outlet's own GSTIN goes in the box,
 * and the state with it. The name and address are not kept on an outlet, so they
 * start empty — and moving to a DIFFERENT outlet empties them again, so one
 * outlet's name is never left sitting on another's invoice. A GSTIN the admin
 * has already typed is kept until the outlet changes.
 */
export function billToForOutlet(
  current: BillToDraft,
  outletGst: string | null | undefined,
  switched: boolean,
): BillToDraft {
  const base = switched ? EMPTY_BILL_TO : current;
  return withGstin(base, base.gstin.trim() === '' ? (outletGst ?? '') : base.gstin);
}

/**
 * No one has been named to bill: no name and no address. The outlet's GSTIN,
 * filled in for the admin, is not an answer — a payment raised like this has no
 * bill-to, the server fills what it can from the outlet, and the invoice waits.
 */
export function isBlankBillTo(d: BillToDraft): boolean {
  return d.name.trim() === '' && d.address.trim() === '';
}

export type BillToCheck =
  | { kind: 'blank' }
  | { kind: 'ok'; billTo: BillToInput }
  | { kind: 'bad'; problems: BillToProblems };

/**
 * The bill-to form's answer: what to send, that nothing was given, or what is
 * wrong with which box. With `required` off (raising a payment) an empty form
 * is fine; with it on (adding who to bill afterwards) it is not.
 *
 * Each box gets its own plain sentence, and the shared schema has the last word,
 * so a rule added there that this does not know about still stops the request.
 */
export function checkBillTo(d: BillToDraft, required: boolean): BillToCheck {
  if (!required && isBlankBillTo(d)) return { kind: 'blank' };
  const problems: BillToProblems = {};

  const name = d.name.trim();
  if (name.length < BILL_TO_NAME_MIN) {
    problems.name = 'Enter the name to print on the invoice.';
  } else if (name.length > BILL_TO_NAME_MAX) {
    problems.name = `Keep it under ${BILL_TO_NAME_MAX} characters. It is ${name.length} now.`;
  }

  const address = d.address.trim();
  if (address.length < BILL_TO_ADDRESS_MIN) {
    problems.address = 'Enter the address to print on the invoice.';
  } else if (address.length > BILL_TO_ADDRESS_MAX) {
    problems.address = `Keep it under ${BILL_TO_ADDRESS_MAX} characters. It is ${address.length} now.`;
  }

  const gstin = cleanGstin(d.gstin);
  if (gstin && !isGstin(gstin)) {
    problems.gstin =
      'That is not a valid GSTIN. Check it letter by letter against the outlet’s GST certificate.';
  }

  const stateCode = billToState(d);
  if (!isStateCode(stateCode)) problems.stateCode = 'Pick the state the outlet is in.';

  if (Object.keys(problems).length > 0) return { kind: 'bad', problems };

  const parsed = billToSchema.safeParse({ name, gstin: gstin || null, address, stateCode });
  if (!parsed.success) {
    return {
      kind: 'bad',
      problems: { form: 'Something in who to bill is not right. Check each box.' },
    };
  }
  return { kind: 'ok', billTo: parsed.data };
}

/** What the figures of a split are called; a stored invoice and a live split both have them. */
export interface SplitFigures {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/**
 * A split in one line: `₹3,540 = ₹3,000 + CGST ₹270 + SGST ₹270`, or
 * `… + IGST ₹540` for a buyer in another state, with a `+ round off ₹0.01`
 * (or `−`) when the rounding left a paisa over. Written from the figures it is
 * given, so a stored invoice reads exactly as it was issued.
 */
export function splitText(s: SplitFigures): string {
  const parts = [formatPaise(s.taxablePaise)];
  if (s.igstPaise > 0) parts.push(`IGST ${formatPaise(s.igstPaise)}`);
  else if (s.cgstPaise > 0 || s.sgstPaise > 0) {
    parts.push(`CGST ${formatPaise(s.cgstPaise)}`, `SGST ${formatPaise(s.sgstPaise)}`);
  }
  let line = `${formatPaise(s.totalPaise)} = ${parts.join(' + ')}`;
  if (s.roundOffPaise !== 0) {
    line += ` ${s.roundOffPaise < 0 ? '−' : '+'} round off ${formatPaise(Math.abs(s.roundOffPaise))}`;
  }
  return line;
}

/**
 * The line under the amount while a payment is being raised: the GST inside it,
 * split the way the invoice will split it. The place of supply is the state, so
 * with none known yet it says what is missing rather than guessing.
 */
export function taxSplitHint(paise: number, stateCode: string): string {
  if (!isStateCode(stateCode)) {
    return `Includes ${GST_RATE_PERCENT}% GST. Pick the state under Bill to to see how it splits.`;
  }
  return `Includes ${GST_RATE_PERCENT}% GST: ${splitText(splitGstInclusive(paise, stateCode))}.`;
}

/** The saved bill-to as the four lines the drawer prints. */
export function billToFacts(b: PaymentBillTo): {
  name: string;
  gstin: string;
  address: string;
  state: string;
} {
  return {
    name: b.name,
    gstin: b.gstin ?? 'Not registered for GST',
    address: b.address,
    state: stateLabel(b.stateCode),
  };
}

/** A payment that has been paid at some point, even if some or all of it was given back. */
export function wasPaid(status: PaymentStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Who to bill can be set or corrected until the invoice is issued, never after
 * (the figures and the name on it are the legal record). A withdrawn payment
 * is never invoiced, so there is nothing to bill for.
 */
export function canEditBillTo(p: Pick<AdminPayment, 'status' | 'invoice'>): boolean {
  return !p.invoice && p.status !== 'cancelled';
}

/** The sentence under "Bill to": what it is for, and whether it can still change. */
export function billToHint(p: Pick<AdminPayment, 'status' | 'invoice'>): string {
  if (p.invoice) return 'Printed on the GST invoice, which is issued. It can no longer be changed.';
  return wasPaid(p.status)
    ? 'Printed on the GST invoice. You can correct it until the invoice is issued.'
    : 'Printed on the GST invoice, which is made as soon as the payment is paid.';
}

/** Why an invoice has not been issued, in a sentence an admin can act on (or pass on). */
export function invoiceBlockerSentence(blocker: InvoiceBlocker): string {
  switch (blocker) {
    case 'no_bill_to':
      return 'Add who to bill, then issue the invoice.';
    case 'gst_not_configured':
      return 'The company’s GST details are not set on the server yet. The invoice is issued once they are.';
  }
}

/**
 * Where a payment's invoice stands: `issued`; `blocked` (the server says why);
 * `pending` (paid, nothing in the way, not issued yet — the server's retry or
 * the button will do it); or `none` (not paid, so none to make).
 */
export type InvoiceState = 'issued' | 'blocked' | 'pending' | 'none';

export function invoiceState(
  p: Pick<AdminPayment, 'status' | 'invoice' | 'invoiceBlocker'>,
): InvoiceState {
  if (p.invoice) return 'issued';
  if (p.invoiceBlocker) return 'blocked';
  return wasPaid(p.status) ? 'pending' : 'none';
}

/**
 * The one sentence the Invoice section opens with while a paid payment has no
 * invoice; `null` when it has one, or when nothing is paid and there is nothing
 * to say (the Bill to card already says the invoice follows the payment).
 */
export function invoiceSentence(
  p: Pick<AdminPayment, 'status' | 'invoice' | 'invoiceBlocker'>,
): string | null {
  switch (invoiceState(p)) {
    case 'blocked':
      return p.invoiceBlocker ? invoiceBlockerSentence(p.invoiceBlocker) : null;
    case 'pending':
      return 'The invoice has not been issued yet. Press Issue invoice to make it now.';
    case 'issued':
    case 'none':
      return null;
  }
}

/**
 * Whether Issue invoice is worth pressing: a blocked or waiting invoice. With
 * nobody named to bill it is not — the server would refuse, so the button waits
 * for the Bill to card to be filled in.
 */
export function canIssueInvoice(
  p: Pick<AdminPayment, 'status' | 'invoice' | 'invoiceBlocker' | 'billTo'>,
): boolean {
  switch (invoiceState(p)) {
    case 'blocked':
      return p.invoiceBlocker === 'no_bill_to' ? p.billTo !== null : true;
    case 'pending':
      return true;
    default:
      return false;
  }
}

/** What the toast says after Issue invoice: the number, when the server sent the payment back with one. */
export function issuedMessage(after: Pick<AdminPayment, 'invoice'> | null | undefined): string {
  return after?.invoice
    ? `Invoice ${after.invoice.number} issued.`
    : 'Asked the server to issue the invoice.';
}

/** A credit note in a line: what it gives back, and the invoice it reduces. */
export function creditNoteLine(doc: GstDocumentSummary): string {
  return `${formatPaise(doc.totalPaise)} · against ${doc.againstNumber ?? 'the invoice'}`;
}

// ------------------------------------------------------ the request form ----

/**
 * The kind a new "Request a payment" starts on. NOT "subscription": a payment
 * raised here is not tied to the outlet's setup, so it does not start the
 * outlet's services or move its paid-through day. The monthly bill is sent from
 * the outlet's Setup card.
 */
export const DEFAULT_REQUEST_PURPOSE: PaymentPurpose = 'service';

/** Said when "Subscription" is picked on the request form. `null` for the other kinds. */
export function subscriptionKindWarning(purpose: PaymentPurpose): string | null {
  return purpose === 'subscription'
    ? "For an outlet's monthly bill, use Send bill on the outlet's Setup card instead. A payment raised here is not tied to the outlet's setup, so paying it does not start the services or move the paid-until day."
    : null;
}

/** The "Request a payment" form as typed: everything is still text. */
export interface RequestDraft {
  dealerId: string;
  title: string;
  purpose: PaymentPurpose;
  /** Rupees, as typed. */
  amount: string;
  /** `YYYY-MM-DD`, or empty. */
  dueDate: string;
  note: string;
  sendLink: boolean;
  phone: string;
  email: string;
  /** Who the GST invoice is made out to. Left empty, the invoice waits. */
  billTo: BillToDraft;
}

export type RequestField =
  | 'dealerId'
  | 'title'
  | 'amount'
  | 'dueDate'
  | 'note'
  | 'phone'
  | 'email'
  | 'billToName'
  | 'billToGstin'
  | 'billToAddress'
  | 'billToState'
  | 'form';
export type RequestProblems = Partial<Record<RequestField, string>>;

/** A 10-digit Indian mobile, with or without +91. Mirrors `createPaymentSchema`. */
const MOBILE = /^(\+?91)?[6-9]\d{9}$/;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Spaces and dashes are how people write a number; the server wants it bare. */
export function tidyPhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * The form's answer: the body to send, or what is wrong with which field.
 *
 * Each field gets its own plain sentence, and the shared schema has the last
 * word — so a rule added there that this list does not know about still stops
 * the request (under `form`) and never reaches the server half-checked. The
 * phone and email are only read while "Send the link by SMS" is on: with it off
 * they are hidden, and a stale typo in a hidden box must not block the save.
 */
export function validateRequest(d: RequestDraft): {
  input: CreatePaymentInput | null;
  problems: RequestProblems;
} {
  const problems: RequestProblems = {};

  if (!d.dealerId) problems.dealerId = 'Pick the outlet.';

  const title = d.title.trim();
  if (title.length < PAYMENT_TITLE_MIN) {
    problems.title = 'Say what it is for, in a few words. The outlet sees this.';
  } else if (title.length > PAYMENT_TITLE_MAX) {
    problems.title = `Keep it under ${PAYMENT_TITLE_MAX} characters. It is ${title.length} now.`;
  }

  const amountIssue = amountProblem(d.amount);
  if (amountIssue) problems.amount = amountIssue;

  if (d.dueDate && !isYmd(d.dueDate)) problems.dueDate = 'That is not a real date.';

  const note = d.note.trim();
  if (note.length > PAYMENT_NOTE_MAX) {
    problems.note = `Keep it under ${PAYMENT_NOTE_MAX} characters. It is ${note.length.toLocaleString('en-IN')} now.`;
  }

  const phone = tidyPhone(d.phone);
  const email = d.email.trim();
  if (d.sendLink) {
    if (phone && !MOBILE.test(phone)) {
      problems.phone = 'Use a 10-digit mobile number, for example 98765 43210.';
    }
    if (email && !LOOKS_LIKE_EMAIL.test(email)) problems.email = 'That email does not look right.';
  }

  // Who to bill is optional here: empty, the payment is raised anyway and the
  // invoice waits for it. Half-filled is a mistake worth stopping.
  const billTo = checkBillTo(d.billTo, false);
  if (billTo.kind === 'bad') {
    const bad = billTo.problems;
    if (bad.name) problems.billToName = bad.name;
    if (bad.gstin) problems.billToGstin = bad.gstin;
    if (bad.address) problems.billToAddress = bad.address;
    if (bad.stateCode) problems.billToState = bad.stateCode;
    if (bad.form) problems.form = bad.form;
  }

  if (Object.keys(problems).length > 0) return { input: null, problems };

  const contact =
    d.sendLink && (phone || email)
      ? { ...(phone ? { phone } : {}), ...(email ? { email } : {}) }
      : undefined;
  const parsed = createPaymentSchema.safeParse({
    dealerId: d.dealerId,
    title,
    purpose: d.purpose,
    amountPaise: parseRupeesToPaise(d.amount),
    ...(d.dueDate ? { dueDate: d.dueDate } : {}),
    ...(note ? { note } : {}),
    sendLink: d.sendLink,
    ...(contact ? { contact } : {}),
    ...(billTo.kind === 'ok' ? { billTo: billTo.billTo } : {}),
  });
  if (!parsed.success) {
    return {
      input: null,
      problems: { form: 'Something in the form is not right. Check each field.' },
    };
  }
  return { input: parsed.data, problems };
}
