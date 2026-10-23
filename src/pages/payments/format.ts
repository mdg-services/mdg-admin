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
import { formatYmd, isYmd } from '@/lib/format';
import { istStamp, phoneLabel } from '@/lib/intake';
import type { Intent } from '@/lib/statusIntent';
import {
  PAYMENT_MAX_PAISE,
  PAYMENT_MIN_PAISE,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  dealerCodeLabel,
  formatPaise,
  parseRupeesToPaise,
} from '@dk/shared';
import type {
  AdminPayment,
  PaymentAttempt,
  PaymentChannel,
  PaymentExtraCapture,
  PaymentPurpose,
  PaymentRefund,
  PaymentStatus,
  RefundStatus,
} from '@dk/shared';
import { createPaymentSchema } from '@dk/shared/schemas';
import type { CreatePaymentInput } from '@dk/shared/schemas';

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

export interface PaymentActions {
  /** Get a link to paste into WhatsApp. */
  copyLink: boolean;
  /** Have Razorpay send the link by SMS (and email) to the outlet. */
  sendSms: boolean;
  /** Look the payment up at Razorpay now. */
  check: boolean;
  /** Withdraw it. */
  cancel: boolean;
  /** Give money back. */
  refund: boolean;
  /** Say a person has looked at what went wrong. */
  markChecked: boolean;
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
 *  - refunding is a super-admin's alone, and only of what is still unreturned.
 */
export function allowedActions(p: AdminPayment, isSuperAdmin: boolean): PaymentActions {
  const due = p.status === 'due';
  return {
    copyLink: due,
    sendSms: due && !!p.linkUrl,
    check: Boolean(p.razorpayOrderId || p.razorpayLinkId || p.razorpayPaymentId),
    cancel: due,
    refund: isSuperAdmin && refundable(p) > 0,
    markChecked: hasOpenProblem(p),
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
      return isPastDue(p, today)
        ? `Not paid yet. It was due on ${formatYmd(p.dueDate)}.`
        : 'Waiting for the outlet to pay.';
    case 'processing':
      return 'Razorpay has the payment but has not confirmed it yet. It settles by itself; Check with Razorpay looks it up now.';
    case 'paid':
      return 'Paid in full.';
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
};

/** Razorpay's method word as an admin reads it; one this app has not seen is shown as sent. */
export function methodLabel(method: string | null): string {
  if (!method) return '—';
  return METHOD_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  link: 'Payment link',
  checkout: 'On the website',
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
  return [formatPaise(r.amountPaise), r.reason, byAt(r.byName, r.createdAt)].join(' · ');
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
export type RazorpayThing = 'payment' | 'order' | 'link';

const DASHBOARD_PATH: Record<RazorpayThing, string> = {
  payment: 'payments',
  order: 'orders',
  link: 'paymentlinks',
};

const ID_SHAPE: Record<RazorpayThing, RegExp> = {
  payment: /^pay_[A-Za-z0-9]+$/,
  order: /^order_[A-Za-z0-9]+$/,
  link: /^plink_[A-Za-z0-9]+$/,
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

/** What cancelling does, in words, with this payment's figures. */
export function cancelSentence(
  p: Pick<AdminPayment, 'number' | 'dealerCode' | 'amountPaise'>,
): string {
  return `This withdraws payment ${p.number}: ${formatPaise(p.amountPaise)} asked from outlet ${dealerCodeLabel(p.dealerCode)}. Its payment link stops working. If they still pay, the money is given back automatically and you get an alert.`;
}

// ------------------------------------------------------ the request form ----

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
}

export type RequestField =
  | 'dealerId'
  | 'title'
  | 'amount'
  | 'dueDate'
  | 'note'
  | 'phone'
  | 'email'
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
  });
  if (!parsed.success) {
    return {
      input: null,
      problems: { form: 'Something in the form is not right. Check each field.' },
    };
  }
  return { input: parsed.data, problems };
}
