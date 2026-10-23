/**
 * The rules behind "Log call…" and the follow-up lines on the Onboarding page
 * and the Setup card (docs/specs/onboarding-v2.md §4): what a call can be, what a
 * call form may send, and how a call, the reminders and a "NO" read in words.
 *
 * Pure, and kept out of the components so it reads as plain decisions; the app
 * has no test runner, so `scripts/onboardingCalls.check.ts` runs this file
 * (`npm run check:onboarding-calls`). It imports TYPES from `@dk/shared` and no
 * values, for the reason `lib/onboarding.ts` gives: the check runs outside Vite.
 *
 * The words are the admin's, in English. The dealer's Hindi lives in the app.
 */
import type {
  OutletSetupAdmin,
  SetupCall,
  SetupCallOutcome,
  SetupReminderState,
  SetupWaitingOn,
} from '@dk/shared';

/** Mirrors `logSetupCallSchema`. */
export const CALL_NOTE_MAX = 300;

export interface CallOutcomeSpec {
  value: SetupCallOutcome;
  label: string;
  /** One line under the choice: what it does to the reminders and alerts. */
  hint: string;
}

/** In the order a person scans them: the likely ones first. */
export const CALL_OUTCOMES: readonly CallOutcomeSpec[] = [
  {
    value: 'answered',
    label: 'Answered',
    hint: 'Clears the call alert. It comes back in two days if the dealer is still silent.',
  },
  {
    value: 'no_answer',
    label: 'No answer',
    hint: 'Clears the call alert. It comes back in two days if the dealer is still silent.',
  },
  {
    value: 'call_later',
    label: 'Call later',
    hint: 'Reminders and alerts stay quiet until the day you pick.',
  },
  {
    value: 'not_interested',
    label: 'Not interested',
    hint: 'The dealer is not chased any more. You can close the onboarding next.',
  },
];

export const CALL_OUTCOME_LABEL: Record<SetupCallOutcome, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  call_later: 'Call later',
  not_interested: 'Not interested',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** India time as the parts a person reads. Hoisted: a formatter built per call is slow. */
const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `2026-10-25T04:50:00Z` → `25 Oct 10:20` (India time), or an empty string when unreadable. */
export function istDayTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(IST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const month = MONTHS[Number(p.month) - 1];
  return month ? `${Number(p.day)} ${month} ${p.hour}:${p.minute}` : '';
}

/** `2026-11-02` → `2 Nov`; anything that is not a day comes back unchanged. */
export function callDay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd ?? '';
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

function realDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}

export interface CallForm {
  outcome: string;
  note: string;
  nextCallOn: string;
}

/** Why a call cannot be logged yet, or `null`. `today` is an India `YYYY-MM-DD`. */
export function callProblem(v: CallForm, today: string): string | null {
  if (!CALL_OUTCOMES.some((o) => o.value === v.outcome)) return 'Pick what came of the call.';
  if (v.note.trim().length > CALL_NOTE_MAX) {
    return `Keep the note under ${CALL_NOTE_MAX} characters. It is ${v.note.trim().length} now.`;
  }
  if (v.outcome === 'call_later') {
    if (!realDay(v.nextCallOn)) return 'Pick the day to call again.';
    if (v.nextCallOn <= today) return 'Pick a day after today.';
  }
  return null;
}

/** What `POST …/calls` takes. */
export interface CallBody {
  outcome: SetupCallOutcome;
  note?: string;
  nextCallOn?: string;
}

/** The body `POST …/calls` takes: the note and the date only when they mean something. */
export function callBody(v: CallForm): CallBody {
  const note = v.note.trim();
  return {
    outcome: v.outcome as SetupCallOutcome,
    ...(note ? { note } : {}),
    ...(v.outcome === 'call_later' && v.nextCallOn ? { nextCallOn: v.nextCallOn } : {}),
  };
}

/** After this outcome the form offers to close the onboarding. */
export function offersClose(outcome: SetupCallOutcome): boolean {
  return outcome === 'not_interested';
}

/** One call in one line: "Answered · Anjali · 25 Oct 10:20 · call again 2 Nov". The note is shown on its own. */
export function callLine(c: SetupCall): string {
  return [
    CALL_OUTCOME_LABEL[c.outcome],
    c.byName,
    istDayTime(c.at),
    c.nextCallOn ? `call again ${callDay(c.nextCallOn)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The board's "last call" line: "Last call: no answer, 25 Oct 10:20". Empty when there has been none. */
export function lastCallLine(c: SetupCall | null | undefined): string {
  if (!c) return '';
  const when = istDayTime(c.at);
  const base = `Last call: ${CALL_OUTCOME_LABEL[c.outcome].toLowerCase()}${when ? `, ${when}` : ''}`;
  return c.outcome === 'call_later' && c.nextCallOn
    ? `${base}, again ${callDay(c.nextCallOn)}`
    : base;
}

/**
 * "Reminded 2× · next 25 Oct 10:00". Only for an outlet whose move is the
 * dealer's: for MDG's turn the reminders are not the point and the line is empty.
 */
export function reminderLine(
  r: Pick<SetupReminderState, 'sent' | 'nextAt'>,
  waitingOn: SetupWaitingOn,
): string {
  if (waitingOn !== 'dealer') return '';
  const next = istDayTime(r.nextAt);
  if (r.sent === 0) return next ? `No reminder yet · first one ${next}` : '';
  const said = `Reminded ${r.sent}×`;
  if (next) return `${said} · next ${next}`;
  return r.sent >= 3 ? `${said} · no more to send` : said;
}

/** The line on a card that says somebody disowned the registration. Empty when nobody did. */
export function notMeLine(o: Pick<OutletSetupAdmin, 'notMe'>): string {
  return o.notMe
    ? `Somebody replied NO to the welcome on ${istDayTime(o.notMe.at)}. The owner's sign-in is switched off until a super-admin clears it.`
    : '';
}
