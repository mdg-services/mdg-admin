/**
 * The Onboarding page's rules, kept out of the components so they read as plain
 * decisions. This app has no test runner, so the less logic a `.tsx` carries the
 * less of it can go wrong unseen: everything here is pure, and
 * `scripts/onboarding.check.ts` runs it (`npm run check:onboarding`).
 *
 * It imports TYPES from `@dk/shared` and no values: the check script runs this
 * file outside Vite, where `@dk/shared` resolves to the package's compiled
 * `dist/`, which a pending shared change can leave behind the source. Service
 * names are passed in by the caller for the same reason.
 *
 * The words are the admin's, in English (the dealer's Hindi lives in the app).
 * "Waiting on" always means whose move the outlet is stuck on: the dealer's, or
 * MDG's own, which is the one an admin can act on.
 */
import type {
  OnboardingBoardRow,
  OnboardingBoard,
  OutletSetupAdmin,
  SetupBilling,
  SetupMessageLang,
  SetupMilestones,
  SetupPaymentMode,
  SetupSource,
  SetupStage,
  SetupWaitingOn,
} from '@dk/shared';

import type { Intent } from './statusIntent';
import { watchNeedsDecision } from './watchHold';

// ── Defaults the dialogs start from ─────────────────────────────────────────

/** The Terms say a bill is due 10 days after it is sent. */
export const DEFAULT_DUE_DAYS = 10;
/** Watch a new outlet for two days after its services start (plan §5). */
export const DEFAULT_WATCH_DAYS = 2;
/** The most the API takes for a watch, or an extension of one. */
export const MAX_WATCH_DAYS = 7;
/** Mirrors `sendSetupBillSchema` / `recordSetupPaymentSchema`: ₹10,00,000, in paise. */
export const MAX_AMOUNT_PAISE = 100_000_000;
/** Mirrors `closeSetupSchema`. */
export const CLOSE_REASON_MIN = 3;
export const CLOSE_REASON_MAX = 500;
/** Mirrors `recordSetupPaymentSchema`. */
export const PAYMENT_REFERENCE_MAX = 120;
/** Mirrors `startSetupServicesSchema`. */
export const OVERRIDE_REASON_MAX = 500;

// ── Stage words ─────────────────────────────────────────────────────────────

type StageFacts = Pick<OutletSetupAdmin, 'stage' | 'payment'> & {
  /** Only the hold matters here: pausing and resuming depend on whether there is one. */
  subscription?: Pick<OutletSetupAdmin['subscription'], 'billingHold'>;
};

/**
 * What the outlet is doing now, in a phrase that fits after "Onboarding ·" and
 * as a row's stage label. Sentence case; the chip lower-cases the first letter.
 *
 * `payment` is three different situations for the admin, and only the first is
 * theirs to act on, so it is the one the words tell apart: the bill is waiting
 * to be sent (MDG), or it was sent and the money has not come (the dealer).
 */
export function stageLabel(o: StageFacts): string {
  switch (o.stage) {
    case 'sign_in':
      return 'Waiting for first sign-in';
    case 'services':
      return 'Waiting for services';
    case 'billing':
      return 'Waiting for billing details';
    case 'payment':
      return o.payment.state === 'not_sent' ? 'Bill to send' : 'Waiting for payment';
    case 'logins':
      return 'Waiting for portal logins';
    case 'setup':
      return 'Ready to set up';
    case 'watch':
      return 'Watching';
    case 'live':
      return 'Live';
    case 'lost':
      return 'Closed';
  }
}

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** "Waiting on the dealer" / "Waiting on MDG" / empty when nobody is. */
export function waitingLabel(w: SetupWaitingOn): string {
  if (w === 'dealer') return 'Waiting on the dealer';
  if (w === 'mdg') return 'Waiting on MDG';
  return '';
}

/**
 * The colour of a stage. Amber when the move is MDG's (that is what an admin
 * scans the page for), blue when it is the dealer's, green once live.
 */
export function stageIntent(o: Pick<OutletSetupAdmin, 'stage' | 'waitingOn'>): Intent {
  if (o.stage === 'live') return 'success';
  if (o.stage === 'lost') return 'neutral';
  if (o.stage === 'watch') return 'info';
  return o.waitingOn === 'mdg' ? 'warning' : 'info';
}

/** True while the outlet is still on its way: not live, not closed. */
export function isOpenStage(stage: SetupStage): boolean {
  return stage !== 'live' && stage !== 'lost';
}

// ── Time ────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Hoisted: a formatter built per call is ~40x slower. */
const IST_DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});

/** "25 Oct" in India time, or an empty string for a missing or unreadable time. */
export function istDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : IST_DAY.format(d);
}

/** Whole days since `since`; never negative, 0 for a missing or unreadable time. */
export function daysInStage(since: string | null | undefined, now: number): number {
  if (!since) return 0;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** "today", "1 day", "3 days". */
export function daysLabel(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A business day for a person: `2026-11-02` → `2 Nov 2026`. Read off the string,
 * so no timezone and no locale can move it a day, and the same words come out in
 * the check script as on screen.
 */
export function ymdLabel(ymd: string | null | undefined): string {
  if (!ymd || !isDay(ymd)) return ymd ?? '-';
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

/** A `YYYY-MM-DD` plus whole days, as `YYYY-MM-DD`, on the calendar (no timezone to drag it across a day). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * The due date a bill starts with: `days` after `today` (an IST `YYYY-MM-DD`) —
 * ten, as the Terms say, unless the server's setting says otherwise.
 */
export function defaultDueOn(today: string, days: number = DEFAULT_DUE_DAYS): string {
  return addDays(today, days);
}

/** A real calendar day as the API wants it: `YYYY-MM-DD`, and one that exists. */
export function isDay(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return addDays(v, 0) === v;
}

// ── The chip on the dealer's header ─────────────────────────────────────────

/**
 * What the dealer page's header says about an outlet that is not yet live:
 *
 *   "Onboarding · waiting for payment · 2 days"
 *   "Watching · ends 25 Oct"
 *   nothing once it is live
 *
 * `null` means draw no chip.
 */
export function setupChip(
  o: Pick<OutletSetupAdmin, 'stage' | 'payment' | 'waitingOn' | 'stageSince' | 'milestones'>,
  now: number,
): { text: string; intent: Intent } | null {
  if (o.stage === 'live') return null;
  const intent = stageIntent(o);
  if (o.stage === 'lost') return { text: 'Onboarding · closed', intent };
  if (o.stage === 'watch') {
    // ── watch hold ── the days ran out but a message was dropped: a person decides.
    if (watchNeedsDecision(o, now)) return { text: 'Watch over · end or extend', intent: 'warning' };
    const ends = istDay(o.milestones.watchUntil);
    return { text: ends ? `Watching · ends ${ends}` : 'Watching', intent };
  }
  const days = daysLabel(daysInStage(o.stageSince, now));
  return { text: `Onboarding · ${lowerFirst(stageLabel(o))} · ${days}`, intent };
}

// ── What an admin can do at each stage ──────────────────────────────────────

export type StageActionId =
  | 'send_bill'
  | 'record_payment'
  | 'start_services'
  | 'start_anyway'
  | 'end_watch'
  | 'extend_watch'
  | 'pause_billing'
  | 'resume_billing'
  | 'close';

export interface StageActionSpec {
  id: StageActionId;
  /** Ends in an ellipsis when it opens a form, as the plan words it. */
  label: string;
  /** The one button an admin is meant to press at this stage. */
  primary: boolean;
}

/**
 * The buttons an outlet's row offers, primary first.
 *
 * Every button is any admin's (owner's decision of 24 Oct); only refunds, which are
 * not onboarding, stay a super-admin's, and they are on the Payments page.
 *
 * - bill not sent: "Send bill…" raises it as a payment and sends it (outside the app)
 * - bill sent: "Record payment…", and "Send bill again…" to resend it or replace it
 *   with another amount
 * - watching or live: "Pause for non-payment…" / "Resume services"
 * - ready to set up: "Start services…"
 * - watching: "End watch" or "Extend…"
 * - any open stage before services start: "Close…"
 *
 * "Start anyway…" is the API's override (a reason is required): starting from
 * the bill or logins stage is allowed, and the reason is kept. It is never the
 * primary button, so nobody starts services early by habit.
 */
export function stageActions(o: StageFacts): StageActionSpec[] {
  const out: StageActionSpec[] = [];
  const add = (id: StageActionId, label: string, primary: boolean) => out.push({ id, label, primary });
  switch (o.stage) {
    case 'payment':
      if (o.payment.state === 'not_sent') add('send_bill', 'Send bill…', true);
      else {
        add('record_payment', 'Record payment…', true);
        add('send_bill', 'Send bill again…', false);
      }
      add('start_anyway', 'Start anyway…', false);
      break;
    case 'logins':
      add('start_anyway', 'Start anyway…', false);
      break;
    case 'setup':
      add('start_services', 'Start services…', true);
      break;
    case 'watch':
      add('end_watch', 'End watch', true);
      add('extend_watch', 'Extend…', false);
      break;
    default:
      break;
  }
  // Billing's own lever (phase 9): stopping the services of an outlet that has
  // started and is not paying, and giving them back. Never the primary button.
  if (o.stage === 'watch' || o.stage === 'live') {
    if (o.subscription?.billingHold) add('resume_billing', 'Resume services', false);
    else add('pause_billing', 'Pause for non-payment…', false);
  }
  // Not once services have started: that outlet is a client, and ending it is an
  // archive from the dealer page (the server refuses "lost" there too).
  if (isOpenStage(o.stage) && o.stage !== 'watch') add('close', 'Close…', false);
  return out;
}

// ── Money ───────────────────────────────────────────────────────────────────

const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** `354000` → `"₹3,540"`, `354050` → `"₹3,540.5"`. Whole rupees print without decimals. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return '-';
  return `₹${RUPEES.format(paise / 100)}`;
}

/** What goes in an amount box: `354000` → `"3540"`, `354050` → `"3540.50"`. Empty when unknown. */
export function paiseToRupeesText(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isInteger(paise) || paise < 0) return '';
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

/**
 * Rupees as typed → paise, or `null` when it is not an amount.
 *
 * Accepts what a person types: "3540", "3,540", "₹ 3,540.50", "3540.5". Never
 * goes through a float, so ₹3,540.10 is 354010 paise and not 354009.999.
 */
export function parseRupees(raw: string): number | null {
  const text = raw.replace(/[₹,\s]/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

/** Why an amount box cannot be saved, or `null` when it can. */
export function amountProblem(raw: string): string | null {
  if (raw.trim() === '') return 'Enter the amount in rupees.';
  const paise = parseRupees(raw);
  if (paise === null) return 'Use rupees with at most two decimals, for example 3540 or 3540.50.';
  if (paise <= 0) return 'The amount must be more than zero.';
  if (paise > MAX_AMOUNT_PAISE) return `That is more than ${formatPaise(MAX_AMOUNT_PAISE)}.`;
  return null;
}

// ── The four forms: what is wrong, and what is sent ─────────────────────────

/** `today` is an IST `YYYY-MM-DD`, passed in so these stay pure. */
export function billProblem(
  v: { amountText: string; dueOn: string },
  today: string,
): string | null {
  const amount = amountProblem(v.amountText);
  if (amount) return amount;
  if (!isDay(v.dueOn)) return 'Pick the due date.';
  if (v.dueOn < today) return 'The due date is in the past.';
  return null;
}

export function billBody(v: { amountText: string; dueOn: string; messageLang?: SetupMessageLang }): {
  amountPaise: number;
  dueOn: string;
  messageLang?: SetupMessageLang;
} {
  return {
    amountPaise: parseRupees(v.amountText) ?? 0,
    dueOn: v.dueOn,
    ...(v.messageLang ? { messageLang: v.messageLang } : {}),
  };
}

// ── The language of a WhatsApp message ──────────────────────────────────────

/**
 * What the "Message language" choice calls each language a WhatsApp message can be
 * in: Hindi written in English letters, or English. One language per message, never
 * both. `hi` is the template language code Meta is given for Hinglish. The app's
 * own screens are not part of this: they stay in Devanagari Hindi and English.
 */
export const MESSAGE_LANG_LABEL: Record<SetupMessageLang, string> = {
  hi: 'Hinglish',
  en: 'English',
};

/** Both, in the order the choice shows them. */
export const MESSAGE_LANGS = Object.keys(MESSAGE_LANG_LABEL) as SetupMessageLang[];

/** The choice's label for a language, or the plain code for one this build does not know. */
export function messageLangLabel(lang: SetupMessageLang | null | undefined): string {
  return lang ? (MESSAGE_LANG_LABEL[lang] ?? lang) : MESSAGE_LANG_LABEL.hi;
}

/**
 * The language the dialog sends in: what the person picked, else the default the
 * server worked out for this outlet or registration. Always one of the two, so the
 * message goes out in the language that was on screen when the button was pressed.
 */
export function chosenMessageLang(
  picked: SetupMessageLang | null,
  fallback: SetupMessageLang | null | undefined,
): SetupMessageLang {
  return picked ?? fallback ?? 'hi';
}

export const PAYMENT_MODE_LABEL: Record<SetupPaymentMode, string> = {
  upi: 'UPI',
  bank: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
};

export const PAYMENT_MODES = Object.keys(PAYMENT_MODE_LABEL) as SetupPaymentMode[];

export function paymentProblem(
  v: { amountText: string; paidOn: string; mode: string; reference: string },
  today: string,
): string | null {
  const amount = amountProblem(v.amountText);
  if (amount) return amount;
  if (!isDay(v.paidOn)) return 'Pick the day the money came.';
  if (v.paidOn > today) return 'The day cannot be in the future.';
  if (!(PAYMENT_MODES as string[]).includes(v.mode)) return 'Pick how it was paid.';
  if (v.reference.trim().length > PAYMENT_REFERENCE_MAX) {
    return `Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.`;
  }
  return null;
}

export function paymentBody(v: {
  amountText: string;
  paidOn: string;
  mode: SetupPaymentMode;
  reference: string;
}): {
  amountPaise: number;
  paidOn: string;
  mode: SetupPaymentMode;
  reference?: string;
} {
  const reference = v.reference.trim();
  return {
    amountPaise: parseRupees(v.amountText) ?? 0,
    paidOn: v.paidOn,
    mode: v.mode,
    ...(reference ? { reference } : {}),
  };
}

/**
 * Starting services. `needsReason` is true when the outlet is not yet at "ready
 * to set up" (bill or logins stage): the API then wants the reason, and so does
 * this form, so a refusal never comes back as a surprise.
 */
export function startProblem(v: {
  watchDays: string;
  reason: string;
  needsReason: boolean;
}): string | null {
  const days = Number(v.watchDays);
  if (v.watchDays.trim() === '' || !Number.isInteger(days) || days < 0 || days > MAX_WATCH_DAYS) {
    return `Watch for a whole number of days, 0 to ${MAX_WATCH_DAYS}.`;
  }
  const reason = v.reason.trim();
  if (v.needsReason && reason.length < CLOSE_REASON_MIN)
    return 'Say why you are starting before the setup is complete.';
  if (reason.length > OVERRIDE_REASON_MAX)
    return `Keep the reason under ${OVERRIDE_REASON_MAX} characters.`;
  return null;
}

export function startBody(v: { watchDays: string; reason: string; needsReason: boolean }): {
  watchDays: number;
  overrideReason?: string;
} {
  const reason = v.reason.trim();
  return {
    watchDays: Number(v.watchDays),
    ...(v.needsReason && reason ? { overrideReason: reason } : {}),
  };
}

/** Extending a watch: whole days, 1 to the most the API takes. */
export function extendProblem(days: string): string | null {
  const n = Number(days);
  if (days.trim() === '' || !Number.isInteger(n) || n < 1 || n > MAX_WATCH_DAYS) {
    return `Extend by a whole number of days, 1 to ${MAX_WATCH_DAYS}.`;
  }
  return null;
}

export function watchBody(
  v: { action: 'end' } | { action: 'extend'; days: string },
): { action: 'end' } | { action: 'extend'; days: number } {
  return v.action === 'end' ? { action: 'end' } : { action: 'extend', days: Number(v.days) };
}

/** Why a close reason cannot be sent, or `null`. Judged on the trimmed text, as the server does. */
export function closeProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n < CLOSE_REASON_MIN) return `Say why, in at least ${CLOSE_REASON_MIN} characters.`;
  if (n > CLOSE_REASON_MAX) return `Keep it under ${CLOSE_REASON_MAX} characters. It is ${n} now.`;
  return null;
}

export function closeBody(reason: string): { reason: string } {
  return { reason: reason.trim() };
}

// ── The page's rows ─────────────────────────────────────────────────────────

export type RegistrationRow = Extract<OnboardingBoardRow, { kind: 'registration' }> & {
  /**
   * The row type in `@dk/shared` does not carry these yet; they are read when
   * the API sends them. See the report for the Onboarding wave.
   */
  siteType?: string | null;
  pumpName?: string | null;
};

export function boardRowKey(row: OnboardingBoardRow): string {
  return row.kind === 'registration' ? `r:${row.registrationId}` : `o:${row.outlet.dealerId}`;
}

/** True when the next move is MDG's. A registration always waits on us. */
export function isMdgTurn(row: OnboardingBoardRow): boolean {
  return row.kind === 'registration' || row.outlet.waitingOn === 'mdg';
}

function turnRank(row: OnboardingBoardRow): number {
  if (row.kind === 'registration') return 0;
  return row.outlet.waitingOn === 'mdg' ? 1 : row.outlet.waitingOn === 'dealer' ? 2 : 3;
}

/**
 * The page's order: registrations first (somebody is waiting for a yes), then
 * outlets whose move is MDG's, then the dealer's, then nobody's; and inside each
 * group the one that has waited longest. Deterministic, so a row does not jump
 * when the list refreshes.
 */
export function sortBoardRows(rows: readonly OnboardingBoardRow[]): OnboardingBoardRow[] {
  const since = (r: OnboardingBoardRow) =>
    Date.parse(r.kind === 'registration' ? r.submittedAt : r.outlet.stageSince) || 0;
  return [...rows].sort(
    (a, b) =>
      turnRank(a) - turnRank(b) ||
      since(a) - since(b) ||
      boardRowKey(a).localeCompare(boardRowKey(b)),
  );
}

/** How many rows are MDG's to act on, for the tab's count. */
export function mdgTurnCount(rows: readonly OnboardingBoardRow[]): number {
  return rows.filter(isMdgTurn).length;
}

// ── The funnel ──────────────────────────────────────────────────────────────

export const FUNNEL_STEPS = [
  { key: 'registered', label: 'Registered' },
  { key: 'approved', label: 'Approved' },
  { key: 'signedIn', label: 'Signed in' },
  { key: 'paid', label: 'Paid' },
  { key: 'live', label: 'Live' },
] as const;

export interface FunnelTile {
  key: (typeof FUNNEL_STEPS)[number]['key'];
  label: string;
  count: number;
  /** Whole percent of the step before, or `null` for the first step or when the one before is zero. */
  ofPrevious: number | null;
}

export function funnelTiles(f: OnboardingBoard['funnel']): FunnelTile[] {
  return FUNNEL_STEPS.map((s, i) => {
    const count = f[s.key];
    const prev = i === 0 ? null : f[FUNNEL_STEPS[i - 1]!.key];
    return {
      key: s.key,
      label: s.label,
      count,
      ofPrevious: prev && prev > 0 ? Math.round((count / prev) * 100) : null,
    };
  });
}

// ── The Setup card on the dealer's Info tab ─────────────────────────────────

const MILESTONE_LABEL: Record<keyof SetupMilestones, string> = {
  approvedAt: 'Approved',
  firstSignInAt: 'First sign-in',
  servicesChosenAt: 'Services chosen',
  billingSavedAt: 'Billing details saved',
  billSentAt: 'Bill sent',
  paidAt: 'Payment received',
  loginsDoneAt: 'Portal logins saved',
  servicesStartedAt: 'Services started',
  watchUntil: 'Watch ends',
  liveAt: 'Live',
};

/**
 * The milestones in the order they happen, each with its time or `null` when it
 * has not. `done` is false for one that has a time still ahead: the end of a
 * watch is on the list from the day it starts, and is not done until it passes.
 */
export function milestoneRows(
  m: SetupMilestones,
  now: number,
): Array<{ key: keyof SetupMilestones; label: string; at: string | null; done: boolean }> {
  return (Object.keys(MILESTONE_LABEL) as Array<keyof SetupMilestones>).map((key) => {
    const at = m[key] ?? null;
    const t = at ? Date.parse(at) : NaN;
    return {
      key,
      label: MILESTONE_LABEL[key],
      at,
      done: at !== null && !(Number.isFinite(t) && t > now),
    };
  });
}

/** Where the registration came from, in the admin's words. */
export const SOURCE_LABEL: Record<SetupSource, string> = {
  website: 'Registered on the website',
  app: 'Registered in the app',
  admin: 'Added by hand',
  'campaign-auto': 'Approved automatically (a number our campaign messaged)',
};

/** How a Razorpay payment came in, for the bill line. */
const PAID_VIA_LABEL = {
  link: 'Razorpay link',
  checkout: 'Razorpay on the website',
  manual: 'hand',
} as const satisfies Record<NonNullable<OutletSetupAdmin['payment']['paidVia']>, string>;

/** The bill in one line: what stage of its life it is in, with the figures that stage has. */
export function paymentLine(p: OutletSetupAdmin['payment']): string {
  if (p.state === 'not_sent') return 'Bill not sent yet';
  const amount = formatPaise(p.amountPaise);
  // The bill's own number, once it is a payment row (the receipt and the Payments page use it).
  const number = p.paymentNumber ? `${p.paymentNumber} · ` : '';
  if (p.state === 'sent')
    return `${number}${amount} billed${p.dueOn ? `, due ${ymdLabel(p.dueOn)}` : ''}`;
  // How it came: money recorded by hand names its mode and reference and who
  // recorded it; a Razorpay payment names the road (the link, or the website).
  const how = [p.mode ? PAYMENT_MODE_LABEL[p.mode] : '', p.reference ?? '']
    .filter(Boolean)
    .join(', ');
  const road = !how && p.paidVia ? `by ${PAID_VIA_LABEL[p.paidVia]}` : how ? `by ${how}` : '';
  return [
    `${number}${amount} paid${p.paidOn ? ` on ${ymdLabel(p.paidOn)}` : ''}`,
    road,
    p.recordedByName ? `recorded by ${p.recordedByName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The bill-to details as the invoice will carry them; `stateName` is the state's name for its code. */
export function billingLine(b: SetupBilling | null, stateName: string | undefined): string {
  if (!b) return 'Not given yet';
  return [
    b.name,
    b.address,
    stateName ?? `State ${b.stateCode}`,
    b.gstin ? `GSTIN ${b.gstin}` : 'No GSTIN',
  ].join(' · ');
}

/** "DSR, Credit & DOD" for the services an outlet chose; `labelOf` gives each one's name. */
export function servicesLine(ids: readonly string[], labelOf: (id: string) => string): string {
  return ids.length === 0 ? 'None chosen yet' : ids.map(labelOf).join(', ');
}

// ── Members' sign-in name ───────────────────────────────────────────────────

/**
 * What a dealer's member signs in with. Owners who registered on the website
 * have no email (their mobile is the sign-in), so the email column alone would
 * print a blank where the admin has to read something out.
 */
export function memberLogin(u: { email?: string | null; phone?: string | null }): string {
  return u.email?.trim() || u.phone?.trim() || '';
}
