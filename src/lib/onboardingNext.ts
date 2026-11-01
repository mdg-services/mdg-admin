/**
 * The Dealers page's Onboarding view: for every outlet still being set up, the
 * ONE thing to do next — or, when nothing is MDG's to do, what happens next by
 * itself and when the team will be needed. The rows MDG must act on come first.
 *
 * WHY ONE LINE. The Onboarding page shows every fact about an outlet (stage, whose
 * move, reminders, calls, the checklist) and leaves the reader to put them
 * together. This view puts them together: "Call Ramesh — stuck on the bill
 * details for 3 days, reminded twice", "Send the bill", "Nothing to do; call on
 * Wed if they are still stuck".
 *
 * ONE CLOCK. When a call falls due is the server's (`reminders.callDueAt`, from the
 * same ladder that raises the "call them" alert and sends the reminders), so this
 * view, the phone alert and the Today board cannot disagree about it. Everything
 * else here is read off facts the board already carries.
 *
 * Pure, and kept out of the components for the reason `lib/onboarding.ts` gives:
 * `scripts/onboardingNext.check.ts` runs it (`npm run check:onboarding-next`). It
 * imports TYPES from `@dk/shared` and no values.
 */
import type { OnboardingBoardRow, OutletSetupAdmin, SetupCall, SetupStage } from '@dk/shared';

import { PORTAL_LABEL, formatPaise, stageLabel } from './onboarding';
import { watchNeedsDecision } from './watchHold';

// ── What the view says about a row ──────────────────────────────────────────

/** `now`: somebody at MDG should act today. `wait`: nothing is MDG's; the dealer or the clock moves next. */
export type NextUrgency = 'now' | 'wait';

export type NextKind =
  | 'approve'
  | 'not_me'
  | 'watch_decide'
  | 'held_messages'
  | 'send_bill'
  | 'start_services'
  | 'chase_payment'
  | 'send_welcome'
  | 'not_interested'
  | 'call'
  | 'other'
  | 'wait_dealer'
  | 'watching';

export interface NextStep {
  urgency: NextUrgency;
  kind: NextKind;
  /** What to do, said as an order for `now` ("Send the bill"); what is happening for `wait`. */
  title: string;
  /** One or two plain sentences: why, and what happens next. */
  why: string;
  /** Since when it has been MDG's to do (ms), so the longest-waiting comes first. */
  since: number;
  /** When MDG is next needed (ms) on a `wait` row: a call falls due, the watch ends. Null when nothing is set. */
  checkAt: number | null;
}

/**
 * Which `now` rows come first: the ones where the dealer is waiting on US (a
 * registration, a bill, a start, a decision), then the ones where we are chasing
 * the dealer. Inside a rank, the longest-waiting first.
 */
const KIND_RANK: Record<NextKind, number> = {
  not_me: 0,
  approve: 1,
  watch_decide: 1,
  held_messages: 1,
  send_bill: 1,
  start_services: 1,
  send_welcome: 1,
  chase_payment: 2,
  call: 2,
  not_interested: 3,
  other: 3,
  wait_dealer: 4,
  watching: 5,
};

// ── Time, in India ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Hoisted: a formatter built per call is slow. */
const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface IstParts {
  ymd: string;
  day: number;
  month: number;
  hhmm: string;
  weekday: number;
}

function istParts(ms: number): IstParts {
  const p = Object.fromEntries(IST_PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  return {
    ymd: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    day: d,
    month: m,
    hhmm: `${p.hour}:${p.minute}`,
    weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
  };
}

/** Today in India as `YYYY-MM-DD`. */
export function istYmd(now: number): string {
  return istParts(now).ymd;
}

/**
 * A moment as a person plans around it: "today 14:00", "tomorrow 09:00",
 * "Wed 5 Nov". A moment already past reads "now".
 */
export function whenLabel(ms: number, now: number): string {
  if (ms <= now) return 'now';
  const at = istParts(ms);
  const today = istParts(now);
  if (at.ymd === today.ymd) return `today ${at.hhmm}`;
  if (at.ymd === istParts(now + DAY_MS).ymd) return `tomorrow ${at.hhmm}`;
  return `${WEEKDAYS[at.weekday]} ${at.day} ${MONTHS[at.month - 1]}`;
}

/** The team's working hours, India time: the server's reminder window (`waiting.ts`). */
const WORK_FROM_HOUR = 9;
const WORK_TO_HOUR = 20;

/**
 * The first moment at or after `ms` inside the team's working hours. A call that
 * falls due at 02:14 is a call to make at 09:00; saying "call at 02:14" asks for
 * something nobody will do.
 */
export function workingMoment(ms: number): number {
  const hour = Number(istParts(ms).hhmm.slice(0, 2));
  if (hour >= WORK_FROM_HOUR && hour < WORK_TO_HOUR) return ms;
  const day = hour < WORK_FROM_HOUR ? istParts(ms).ymd : istParts(ms + DAY_MS).ymd;
  return Date.parse(`${day}T${String(WORK_FROM_HOUR).padStart(2, '0')}:00:00+05:30`);
}

/** "31 Oct" for a moment, in India time. */
function dayLabel(ms: number): string {
  const p = istParts(ms);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** `2026-10-30` → "30 Oct". */
function ymdShort(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

/** Whole days since `fromMs`, never negative. */
function wholeDays(fromMs: number, now: number): number {
  return Math.max(0, Math.floor((now - fromMs) / DAY_MS));
}

/** "today", "1 day ago", "3 days ago". */
function agoPhrase(fromMs: number, now: number): string {
  const days = wholeDays(fromMs, now);
  if (days === 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** "since today", "for 1 day", "for 3 days". */
function forPhrase(fromMs: number, now: number): string {
  const days = wholeDays(fromMs, now);
  if (days === 0) return 'since today';
  return days === 1 ? 'for 1 day' : `for ${days} days`;
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

// ── The words for a step the dealer owes ────────────────────────────────────

/** "Stuck on …" — what the dealer has not done yet. */
const OWED: Partial<Record<SetupStage, string>> = {
  sign_in: 'the first sign-in',
  company: "the pump's oil company",
  billing: 'the bill details',
  payment: 'payment',
  logins: 'the portal logins',
};

/** The title of a row that waits on the dealer. */
function waitingTitle(o: OutletSetupAdmin): string {
  switch (o.stage) {
    case 'sign_in':
      return 'Waiting for the owner to sign in';
    case 'company':
      return 'Waiting for the owner to pick the oil company';
    case 'billing':
      return 'Waiting for the owner to fill in the bill details';
    case 'payment': {
      const amount = o.payment.amountPaise ? ` ${formatPaise(o.payment.amountPaise)}` : '';
      const due = o.payment.dueOn ? ` (due ${ymdShort(o.payment.dueOn)})` : '';
      return `Waiting for the owner to pay${amount}${due}`;
    }
    case 'logins':
      return 'Waiting for the owner to type the portal logins';
    default:
      return stageLabel(o);
  }
}

/** The newest call made since the stage opened. Calls arrive newest first. */
export function lastCallInStage(o: Pick<OutletSetupAdmin, 'calls' | 'stageSince'>): SetupCall | null {
  const since = time(o.stageSince) ?? 0;
  let best: SetupCall | null = null;
  for (const c of o.calls) {
    const at = time(c.at);
    if (at === null || at < since) continue;
    if (!best || at > (time(best.at) ?? 0)) best = c;
  }
  return best;
}

/** "Reminded twice." / "No reminder sent yet." / "" when this step sends none. */
function remindedPhrase(o: OutletSetupAdmin): string {
  const n = o.reminders.sent;
  if (n === 1) return 'Reminded once.';
  if (n === 2) return 'Reminded twice.';
  if (n > 2) return `Reminded ${n} times.`;
  return '';
}

const CALL_WORDS: Record<SetupCall['outcome'], string> = {
  answered: 'answered',
  no_answer: 'no answer',
  call_later: 'asked to call later',
  not_interested: 'not interested',
};

/** "Last call: no answer, 31 Oct." */
function lastCallPhrase(c: SetupCall | null): string {
  if (!c) return '';
  const at = time(c.at);
  return `Last call: ${CALL_WORDS[c.outcome]}${at ? `, ${dayLabel(at)}` : ''}.`;
}

/** "SDMS refused the login they saved; they have been asked again." */
function refusedPhrase(o: OutletSetupAdmin): string {
  const refused = o.loginChecks
    .filter((c) => c.result === 'refused' && o.loginsNeeded.includes(c.portal))
    .map((c) => PORTAL_LABEL[c.portal] ?? c.portal);
  if (refused.length === 0) return '';
  return `${refused.join(' and ')} refused the login they saved; the app has asked them again.`;
}

const joinWords = (...parts: string[]): string => parts.filter(Boolean).join(' ');

// ── The rules ───────────────────────────────────────────────────────────────

/**
 * The one thing to do next for an outlet on its way, first match wins:
 *
 *  1. somebody replied NO to the welcome — nothing else matters until that is checked
 *  2. the watch is over but something was dropped — end it or extend it
 *  3. messages held during the watch — send or drop them
 *  4. the bill is MDG's to send
 *  5. the services are MDG's to start
 *  6. a bill is past its due date — the app never nudges about money, so ring
 *  7. the welcome WhatsApp never reached a new owner — send it by hand
 *  8. the last call said "not interested" — close it, or call again
 *  9. the call has fallen due (the server's clock)
 * 10. otherwise: whose move it is, what goes out by itself, and when MDG is next needed
 */
export function outletNextStep(o: OutletSetupAdmin, now: number): NextStep {
  const stageSince = time(o.stageSince) ?? now;
  const name = o.ownerName?.trim();
  /** The owner inside a sentence, and at its start. */
  const owner = name || 'the owner';
  const Owner = name || 'The owner';
  const step = (
    urgency: NextUrgency,
    kind: NextKind,
    title: string,
    why: string,
    since: number = stageSince,
    checkAt: number | null = null,
  ): NextStep => ({ urgency, kind, title, why, since, checkAt });

  if (o.notMe) {
    const at = time(o.notMe.at) ?? stageSince;
    return step(
      'now',
      'not_me',
      'Check who registered',
      `Somebody replied NO to the welcome message on ${dayLabel(at)}. The owner cannot sign in until you call the registered number and clear it.`,
      at,
    );
  }

  if (o.stage === 'watch') {
    const until = time(o.milestones.watchUntil);
    if (watchNeedsDecision(o, now)) {
      return step(
        'now',
        'watch_decide',
        'End or extend the watch',
        `The watch ended${until ? ` on ${dayLabel(until)}` : ''}, but a message was dropped during it, so the outlet will not go live by itself.`,
        until ?? stageSince,
      );
    }
    if (o.heldCount > 0) {
      const n = o.heldCount;
      return step(
        'now',
        'held_messages',
        `Check ${n} held ${n === 1 ? 'message' : 'messages'}`,
        'While a new outlet is watched, messages to it wait for a person. Send or drop each one; an unsent one expires after a day.',
      );
    }
  }

  if (o.stage === 'payment' && o.payment.state === 'not_sent') {
    return step(
      'now',
      'send_bill',
      'Send the bill',
      `${Owner} saved the bill details ${agoPhrase(stageSince, now)}. Nothing moves until the bill goes.`,
    );
  }

  if (o.stage === 'setup') {
    // The first open item in the checklist's own words, and how many more: the whole
    // list is on the outlet's Setup card, and four portal messages in a row are a wall.
    const missing = o.checklist.filter((c) => c.state === 'missing');
    const first = missing[0];
    const more = missing.length - 1;
    const why = first
      ? `Everything the owner had to do is in. Still to check: ${(first.detail ?? first.key).replace(/\.$/, '')}${
          more > 0 ? `, and ${more} more` : ''
        }.`
      : 'Everything the owner had to do is in, and the checklist is clear.';
    return step('now', 'start_services', 'Start the services', why);
  }

  const today = istYmd(now);
  const billLate =
    o.stage === 'payment' &&
    o.payment.state === 'sent' &&
    !!o.payment.dueOn &&
    o.payment.dueOn < today;
  if (billLate || o.subscription.overdue) {
    const amount = o.payment.amountPaise ? formatPaise(o.payment.amountPaise) : 'The bill';
    const due = o.payment.dueOn;
    return step(
      'now',
      'chase_payment',
      `Call ${owner} about the unpaid bill`,
      `${amount} was due${due ? ` on ${ymdShort(due)}` : ''} and is not paid. The app never reminds anyone about money, so a call is the only nudge.`,
      due ? (time(`${due}T00:00:00+05:30`) ?? stageSince) : stageSince,
    );
  }

  if (o.stage === 'sign_in' && (o.welcome.state === 'not_sent' || o.welcome.state === 'failed')) {
    return step(
      'now',
      'send_welcome',
      'Send the welcome by hand',
      o.welcome.state === 'failed'
        ? 'The "your account is ready" WhatsApp did not arrive. The owner may not know the account exists.'
        : 'The "your account is ready" WhatsApp could not be sent. The owner may not know the account exists.',
      time(o.welcome.at) ?? stageSince,
    );
  }

  if (o.waitingOn === 'dealer' && OWED[o.stage]) {
    const last = lastCallInStage(o);
    const stuck = `Stuck on ${OWED[o.stage]} ${forPhrase(stageSince, now)}.`;
    if (last?.outcome === 'not_interested') {
      const at = time(last.at) ?? stageSince;
      return step(
        'now',
        'not_interested',
        'Close it, or call again',
        `On ${dayLabel(at)} ${owner} said they are not interested. Close the onboarding, or log a new call if that has changed.`,
        at,
      );
    }
    const dueAt = time(o.reminders.callDueAt);
    if (dueAt !== null && dueAt <= now) {
      return step(
        'now',
        'call',
        `Call ${owner}`,
        joinWords(stuck, remindedPhrase(o), lastCallPhrase(last), refusedPhrase(o)),
        dueAt,
      );
    }
    // Nothing is ours yet: say what goes out by itself, and when we are next needed.
    const nextReminder = time(o.reminders.nextAt);
    const asked =
      last?.outcome === 'call_later' && last.nextCallOn
        ? `${Owner} asked for a call on ${ymdShort(last.nextCallOn)}.`
        : '';
    const reminder = nextReminder ? `The app reminds them ${whenLabel(nextReminder, now)}.` : '';
    // A "call later" already says the day; the call falls due that morning.
    const callNote =
      dueAt !== null && !asked
        ? `If nothing moves, call ${whenLabel(workingMoment(dueAt), now)}.`
        : '';
    return step(
      'wait',
      'wait_dealer',
      waitingTitle(o),
      joinWords(refusedPhrase(o), asked, reminder, callNote) || `Nothing to do yet. ${stuck}`,
      stageSince,
      dueAt,
    );
  }

  if (o.stage === 'watch') {
    const until = time(o.milestones.watchUntil);
    const started = time(o.milestones.servicesStartedAt);
    return step(
      'wait',
      'watching',
      'Watching the first days',
      joinWords(
        started ? `Services started on ${dayLabel(started)}.` : 'Services have started.',
        until ? `It goes live by itself on ${dayLabel(until)} if nothing goes wrong.` : '',
      ),
      stageSince,
      until,
    );
  }

  // A move of MDG's the rules above do not name, or nobody's: say the stage plainly.
  return o.waitingOn === 'mdg'
    ? step('now', 'other', stageLabel(o), 'The next move is MDG’s. Open the outlet to see it.')
    : step('wait', 'wait_dealer', stageLabel(o), 'Nothing to do yet.', stageSince, null);
}

/** A registration that was not approved by itself: somebody has to look at it. */
export function registrationNextStep(
  r: Extract<OnboardingBoardRow, { kind: 'registration' }>,
  now: number,
): NextStep {
  const since = time(r.submittedAt) ?? now;
  if (r.alreadyClient) {
    return {
      urgency: 'now',
      kind: 'approve',
      title: 'Add as another outlet, or close',
      why: `This phone or SAP code is already a client (${r.alreadyClient.code}). Registered ${agoPhrase(since, now)}.`,
      since,
      checkAt: null,
    };
  }
  return {
    urgency: 'now',
    kind: 'approve',
    title: 'Approve the registration',
    why: `Waiting for a yes since ${dayLabel(since)}. Approving makes the outlet and sends the owner the welcome.`,
    since,
    checkAt: null,
  };
}

export function nextStepOf(row: OnboardingBoardRow, now: number): NextStep {
  return row.kind === 'registration'
    ? registrationNextStep(row, now)
    : outletNextStep(row.outlet, now);
}

// ── The order, and the counts ───────────────────────────────────────────────

export interface RosterRow {
  row: OnboardingBoardRow;
  next: NextStep;
}

const rowId = (r: OnboardingBoardRow): string =>
  r.kind === 'registration' ? `r:${r.registrationId}` : `o:${r.outlet.dealerId}`;

/**
 * The view's order. Everything MDG must do first — the dealer waiting on us before
 * us chasing the dealer, the longest-waiting first. Then the rest by when the team
 * will next be needed, soonest first; a row with no such moment last.
 * Deterministic, so a row does not jump on a refresh.
 */
export function rosterRows(rows: readonly OnboardingBoardRow[], now: number): RosterRow[] {
  const out = rows.map((row) => ({ row, next: nextStepOf(row, now) }));
  const FAR = Number.MAX_SAFE_INTEGER;
  return out.sort((a, b) => {
    const ua = a.next.urgency === 'now' ? 0 : 1;
    const ub = b.next.urgency === 'now' ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (ua === 0) {
      return (
        KIND_RANK[a.next.kind] - KIND_RANK[b.next.kind] ||
        a.next.since - b.next.since ||
        rowId(a.row).localeCompare(rowId(b.row))
      );
    }
    return (
      (a.next.checkAt ?? FAR) - (b.next.checkAt ?? FAR) ||
      a.next.since - b.next.since ||
      rowId(a.row).localeCompare(rowId(b.row))
    );
  });
}

export interface RosterCounts {
  /** Rows somebody at MDG should act on today. */
  now: number;
  /** Waiting on the dealer. */
  dealer: number;
  /** Services started, first days being watched. */
  watching: number;
}

export function rosterCounts(rows: readonly RosterRow[]): RosterCounts {
  let now = 0;
  let dealer = 0;
  let watching = 0;
  for (const r of rows) {
    if (r.next.urgency === 'now') now += 1;
    else if (r.next.kind === 'watching') watching += 1;
    else dealer += 1;
  }
  return { now, dealer, watching };
}

/** Does the search box's text match this row? Code, owner, phone, registration name or SAP code. */
export function rosterMatches(row: OnboardingBoardRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const hay =
    row.kind === 'registration'
      ? [row.name, row.pumpName ?? '', row.sapCode, row.mobile]
      : [row.outlet.code, row.outlet.ownerName ?? '', row.outlet.mobile ?? ''];
  return hay.some((h) => {
    const v = h.toLowerCase();
    return v.includes(q) || (digits.length >= 3 && v.replace(/\D/g, '').includes(digits));
  });
}

// ── The step track ──────────────────────────────────────────────────────────

/** The steps from a registration to live, as the track on each row draws them, each named as the task it is. */
export const TRACK_STEPS = [
  { key: 'approve', label: 'Approve' },
  { key: 'sign_in', label: 'First sign-in' },
  { key: 'company', label: 'Oil company' },
  { key: 'billing', label: 'Bill details' },
  { key: 'bill', label: 'Send bill' },
  { key: 'paid', label: 'Payment' },
  { key: 'logins', label: 'Portal logins' },
  { key: 'start', label: 'Start services' },
] as const;
export type TrackKey = (typeof TRACK_STEPS)[number]['key'];
export type TrackState = 'done' | 'current' | 'todo' | 'skipped';

/**
 * Each step's state for one row. "Done" is read off the milestones, never off the
 * position: an outlet started early ("Start anyway") shows the steps it skipped
 * as skipped, not done.
 */
export function trackOf(row: OnboardingBoardRow): Array<{ key: TrackKey; label: string; state: TrackState }> {
  if (row.kind === 'registration') {
    return TRACK_STEPS.map((s, i) => ({ ...s, state: i === 0 ? 'current' : 'todo' }));
  }
  const o = row.outlet;
  const m = o.milestones;
  const done: Record<TrackKey, boolean> = {
    approve: true,
    sign_in: !!m.firstSignInAt,
    // An outlet that saved its bill details before the company step existed chose Indian Oil.
    company: !!m.companySavedAt || !!m.billingSavedAt,
    billing: !!m.billingSavedAt,
    bill: !!m.billSentAt,
    paid: !!m.paidAt,
    logins: !!m.loginsDoneAt,
    start: !!m.servicesStartedAt,
  };
  const current: TrackKey | null =
    o.stage === 'sign_in'
      ? 'sign_in'
      : o.stage === 'company'
        ? 'company'
        : o.stage === 'billing'
          ? 'billing'
          : o.stage === 'payment'
            ? o.payment.state === 'not_sent'
              ? 'bill'
              : 'paid'
            : o.stage === 'logins'
              ? 'logins'
              : o.stage === 'setup'
                ? 'start'
                : null;
  const currentIndex = current ? TRACK_STEPS.findIndex((s) => s.key === current) : TRACK_STEPS.length;
  return TRACK_STEPS.map((s, i) => ({
    ...s,
    state:
      s.key === current
        ? 'current'
        : done[s.key]
          ? 'done'
          : i < currentIndex
            ? 'skipped'
            : 'todo',
  }));
}

/** "Step 5 of 8" for the row the track belongs to (the watch counts as the last). */
export function trackPosition(row: OnboardingBoardRow): { step: number; of: number } {
  const of = TRACK_STEPS.length;
  if (row.kind === 'registration') return { step: 1, of };
  const i = trackOf(row).findIndex((s) => s.state === 'current');
  return { step: i === -1 ? of : i + 1, of };
}

// ── Their WhatsApp chat ─────────────────────────────────────────────────────

/**
 * Our WhatsApp inbox at this person's chat, or null for a number WhatsApp could
 * not have (the server's `toWaId` rule: an Indian mobile, ten digits starting 6–9,
 * behind an optional 0 / 00 / +91).
 *
 * No `line=`, on purpose: the inbox then opens the one of our two numbers they
 * have the most unread on, else their newest chat there, else the inbox the admin
 * was last in (`useInboxLine`). An owner being set up may have written to either.
 */
export function inboxChatHref(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  let digits = mobile.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 13 && digits.startsWith('910')) digits = `91${digits.slice(3)}`;
  if (digits.length === 10) digits = `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits) ? `/whatsapp?chat=${digits}` : null;
}

// ── The view a person opens first ───────────────────────────────────────────

export type DealersView = 'services' | 'onboarding';

/** Where this browser keeps the view a person chose to open first. */
export const DEALERS_VIEW_STORAGE_KEY = 'dk.dealers.defaultView';

/** A stored or URL value as a view, or null for anything else. */
export function parseDealersView(v: string | null | undefined): DealersView | null {
  return v === 'services' || v === 'onboarding' ? v : null;
}
