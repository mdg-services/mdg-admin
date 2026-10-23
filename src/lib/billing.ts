/**
 * The rules behind the billing screens, kept out of the components as plain
 * decisions (this app has no test runner; `scripts/billing.check.ts` runs these,
 * `npm run check:billing`): what a short payment is, whether a typed amount may be
 * recorded against a bill, the words for "paid through", "next bill", "overdue"
 * and a pause, and how the answer to "Send bill" is laid out for a person.
 *
 * TYPES ONLY from `@dk/shared`, as `lib/onboarding.ts` does: the check script runs
 * this file outside Vite, where `@dk/shared` resolves to the package's compiled
 * `dist/`, which a pending shared change can leave behind the source. Money and
 * day helpers come from `lib/onboarding.ts` for the same reason.
 *
 * The words are the admin's, in English. Nothing here is shown to a dealer: the
 * dealer's app shows what is due, read-only, and never how to pay (ADR 0022 §1).
 */
import type { AdminPayment, SendSetupBillResult, SetupSubscriptionView } from '@dk/shared';

import {
  PAYMENT_MODES,
  PAYMENT_REFERENCE_MAX,
  amountProblem,
  formatPaise,
  isDay,
  parseRupees,
  ymdLabel,
} from './onboarding';

// ── Recording money that came by hand ───────────────────────────────────────

/** What the person types into "Record payment received". */
export interface ManualDraft {
  amountText: string;
  paidOn: string;
  mode: string;
  reference: string;
}

/** How much of the bill did not arrive: the bill minus what came, never below zero. */
export function shortfallPaise(billedPaise: number, receivedPaise: number): number {
  return Math.max(0, billedPaise - receivedPaise);
}

/**
 * Why a draft cannot be recorded against a bill of `billedPaise`, or `null` when
 * it can. The server's own rules, so a refusal never comes back as a surprise:
 * an amount that is an amount, not more than the bill (a short payment is fine —
 * tax deducted at source — more is not), a real day that is not in the future,
 * one of the known modes, and a reference that is not a paragraph.
 */
export function manualProblem(
  v: ManualDraft,
  billedPaise: number | null,
  today: string,
): string | null {
  const amount = amountProblem(v.amountText);
  if (amount) return amount;
  const paise = parseRupees(v.amountText) ?? 0;
  if (billedPaise !== null && paise > billedPaise) {
    return `The bill is ${formatPaise(billedPaise)}. Record at most that; if more came, tell the owner.`;
  }
  if (!isDay(v.paidOn)) return 'Pick the day the money came.';
  if (v.paidOn > today) return 'The day cannot be in the future.';
  if (!(PAYMENT_MODES as string[]).includes(v.mode)) return 'Pick how it was paid.';
  if (v.reference.trim().length > PAYMENT_REFERENCE_MAX) {
    return `Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.`;
  }
  return null;
}

/**
 * The line under the amount box while it is short of the bill: what happens to
 * the difference, in words. `null` when it is the whole bill or not a usable amount.
 */
export function shortfallNote(billedPaise: number | null, amountText: string): string | null {
  if (billedPaise === null) return null;
  const paise = parseRupees(amountText);
  if (paise === null || paise <= 0 || paise >= billedPaise) return null;
  return `${formatPaise(shortfallPaise(billedPaise, paise))} short. It is recorded as paid for what came, with the shortfall shown; the GST invoice stays for the full ${formatPaise(billedPaise)}.`;
}

/** The lines the drawer adds for a payment recorded by hand: what came, what was short. */
export function manualDrawerLines(
  m: NonNullable<AdminPayment['manual']>,
  modeLabel: string,
): Array<{ key: string; label: string; value: string }> {
  return [
    {
      key: 'manual',
      label: 'Recorded by hand',
      value: [
        `${formatPaise(m.amountPaise)} by ${modeLabel}`,
        m.reference ? `ref ${m.reference}` : '',
        `on ${ymdLabel(m.paidOn)}`,
        `by ${m.recordedByName}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...(m.shortfallPaise > 0
      ? [
          {
            key: 'shortfall',
            label: 'Short by',
            value: `${formatPaise(m.shortfallPaise)} (tax deducted at source, or a part payment)`,
          },
        ]
      : []),
  ];
}

// ── The subscription line on the Setup card ─────────────────────────────────

/**
 * What the Setup card says about the paid month after the first bill, one plain
 * line each: how far it is paid, when the next bill is raised, whether a bill is
 * past its day, and whether the services are paused. Empty while nothing has been
 * paid yet. `today` is an IST `YYYY-MM-DD`, passed in so this stays pure.
 */
export function subscriptionLines(
  s: SetupSubscriptionView,
  today: string,
): Array<{ key: string; label: string; value: string; tone: 'normal' | 'warning' | 'danger' }> {
  const out: Array<{
    key: string;
    label: string;
    value: string;
    tone: 'normal' | 'warning' | 'danger';
  }> = [];
  if (s.paidThrough) {
    const over = s.paidThrough < today;
    out.push({
      key: 'paidThrough',
      label: 'Paid through',
      value: over ? `${ymdLabel(s.paidThrough)} — that day has passed` : ymdLabel(s.paidThrough),
      tone: over ? 'warning' : 'normal',
    });
  }
  if (s.nextBillOn && !s.billingHold) {
    out.push({
      key: 'nextBill',
      label: 'Next bill',
      value:
        s.nextBillOn <= today
          ? 'Raised by the next morning pass'
          : `Raised on ${ymdLabel(s.nextBillOn)}`,
      tone: 'normal',
    });
  }
  if (s.overdue) {
    out.push({
      key: 'overdue',
      label: 'Overdue',
      value: 'A bill is past its due day. The team has been alerted.',
      tone: 'danger',
    });
  }
  if (s.billingHold) {
    const paidUp = !!s.paidThrough && s.paidThrough >= today && !s.overdue;
    out.push({
      key: 'hold',
      label: 'Paused for non-payment',
      value: [
        `since ${ymdFromIso(s.billingHold.at)}`,
        s.billingHold.byName ? `by ${s.billingHold.byName}` : '',
        s.billingHold.reason,
        paidUp ? 'Paid up since — the services can be resumed.' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'warning',
    });
  }
  return out;
}

/** `2026-10-24T05:41:00.000Z` → `24 Oct 2026`, in India's calendar. */
export function ymdFromIso(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  // IST is +05:30 with no daylight saving: shift, then read the UTC parts.
  return ymdLabel(new Date(t.getTime() + 330 * 60_000).toISOString().slice(0, 10));
}

// ── The answer to "Send bill" ───────────────────────────────────────────────

/** What the result panel shows after a bill is sent: the pieces, in the order a person acts on them. */
export interface BillOutcome {
  /** "MDG-2026-00012 raised." or, when nothing new was raised, "MDG-2026-00012 is already out." */
  headline: string;
  /** Razorpay's SMS: where it went, or the plain reason it could not. */
  sms: { state: 'sent' | 'not_sent' | 'off'; text: string };
  /** The WhatsApp: sent by template, or the words for the team to send by hand. */
  whatsapp:
    | { state: 'sent'; text: string }
    | { state: 'by_hand'; text: string; message: string; waLink: string };
  /** The payment link to copy, when there is one. */
  link: string | null;
}

export function billOutcome(r: SendSetupBillResult): BillOutcome {
  const number = r.payment.number;
  const headline = r.created
    ? `${number} raised.`
    : `${number} is already out; nothing new was raised.`;

  let sms: BillOutcome['sms'];
  if (!r.link) {
    sms = r.linkError
      ? { state: 'not_sent', text: `No link: ${r.linkError}` }
      : { state: 'off', text: 'Razorpay is not switched on, so there is no payment link or SMS.' };
  } else {
    const to = [r.link.sentTo.phone, r.link.sentTo.email].filter(Boolean);
    sms =
      to.length > 0
        ? { state: 'sent', text: `Razorpay sent the link to ${to.join(' and ')}.` }
        : { state: 'not_sent', text: r.linkError ?? 'The link was made but not sent to anyone.' };
  }

  const w = r.whatsapp;
  const whatsapp: BillOutcome['whatsapp'] = w.sent
    ? { state: 'sent', text: 'The bill went to the owner on WhatsApp.' }
    : { state: 'by_hand', text: w.reason, message: w.text, waLink: w.waLink };

  return { headline, sms, whatsapp, link: r.link?.url ?? null };
}

/**
 * The same wa.me link with other words in it: the team may add their UPI or bank
 * details to the message before sending, and the link must carry what is typed,
 * not what the server drafted. A link that is not in the server's shape is
 * returned as it came.
 */
export function waLinkWithText(waLink: string, text: string): string {
  const at = waLink.indexOf('?text=');
  return at < 0 ? waLink : `${waLink.slice(0, at)}?text=${encodeURIComponent(text)}`;
}
