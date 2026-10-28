/**
 * The Leads page's rules (docs/specs/leads.md §8), kept out of the components so
 * they read as plain decisions. This app has no test runner, so everything here
 * is pure and `scripts/leads.check.ts` runs it (`npm run check:leads`).
 *
 * What lives here: the words (labels, the due line, the watch line, who last
 * did what), the follow-up suggestion a contact form pre-fills, the working
 * window that suggestion lives in, what each form may send, and why a form is
 * not ready yet. The drawer's own rules have a section: who did each thing on
 * the timeline, the days it is grouped into, and which colour the "do this now"
 * panel and the film bar take. The call-recording rules sit at the end: which
 * file may be picked, what a failed recording says, and how a summary is cut
 * down to what a glance can take in.
 *
 * What does NOT live here: whether a lead is due, cold or closed. The server's
 * clock decides that and says so in `LeadRow`; this file only turns the answer
 * into words and colours. The one exception is the suggestion, which repeats the
 * server's table (§3 rule 5) so the form can show "next follow-up" before the
 * contact is saved, and the check script pins it edge by edge.
 *
 * Values come from `shared/src/types/lead` by relative path, as `watchHold.ts`
 * does for the same reason: the check scripts run outside Vite, where
 * `@dk/shared` resolves to a compiled `dist/` that a pending shared change can
 * leave behind the source.
 */
import type { CreateLeadInput } from '../../shared/src/schemas/lead';
import {
  LEAD_ADMIN_CLOSE_REASONS,
  LEAD_CALL_INTEREST_LABELS,
  LEAD_CLOSED_STATUSES,
  LEAD_CLOSING_OUTCOMES,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_CONTACT_OUTCOME_LABELS,
  LEAD_ORIGIN_LABELS,
  LEAD_RECORDING_MAX_BYTES,
  LEAD_RECORDING_TYPES,
  LEAD_SIGN_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TIMELINE_ACTORS,
  LEAD_VIEWS,
  type LeadAdminCloseReason,
  type LeadCallInterest,
  type LeadCallSummary,
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadContactSummary,
  type LeadCounts,
  type LeadDueReason,
  type LeadFunnel,
  type LeadInvite,
  type LeadLastCall,
  type LeadLookup,
  type LeadNote,
  type LeadOrigin,
  type LeadRecording,
  type LeadRecordingFailure,
  type LeadRecordingStatus,
  type LeadRow,
  type LeadSign,
  type LeadSignKind,
  type LeadSigns,
  type LeadStatus,
  type LeadTimelineActor,
  type LeadTimelineItem,
  type LeadTimelineKind,
  type LeadView,
  type LeadVisit,
  type LeadWatch,
} from '../../shared/src/types/lead';

import { istStamp, phoneLabel } from './intake';
import type { Intent } from './statusIntent';

// ── Limits the forms mirror ─────────────────────────────────────────────────

/** Mirrors `LEAD_NOTE_MAX` in the shared schemas; `scripts/leads.check.ts` fails if they disagree. */
export const NOTE_MAX = 500;
/** Mirrors `LEAD_FOLLOW_UP_MAX_DAYS`. */
export const FOLLOW_UP_MAX_DAYS = 90;
/** Mirrors `LEAD_NAME_MAX`: the longest name or place on a lead added by hand. */
export const NAME_MAX = 80;

// ── Words ───────────────────────────────────────────────────────────────────

/** The tabs. "Unknown viewers" are not leads: nobody there has a name or a number. */
export const LEAD_VIEW_LABELS: Record<LeadView, string> = {
  todo: 'To do',
  open: 'All open',
  mine: 'Mine',
  closed: 'Closed',
  viewers: 'Unknown viewers',
};

/** The tab's words, with the number the server counted where the tab has one. */
export function viewLabel(view: LeadView, counts: LeadCounts | undefined): string {
  const base = LEAD_VIEW_LABELS[view];
  if (!counts || view === 'closed') return base;
  return `${base} (${counts[view].toLocaleString('en-IN')})`;
}

/** Past the end of the list the page is not showing a tab it knows. */
export function viewFromParam(v: string | null): LeadView {
  return (LEAD_VIEWS as readonly string[]).includes(v ?? '') ? (v as LeadView) : 'todo';
}

/** A lead id out of the address, or `null` when it is not one. An id is a Mongo ObjectId. */
export function idFromParam(v: string | null): string | null {
  return v && /^[0-9a-f]{24}$/i.test(v) ? v : null;
}

/** Where an alert or a link opens one lead. */
export function leadHref(id: string): string {
  return `/leads?lead=${id}`;
}

/**
 * The WhatsApp inbox's address for their chat, or `null` when they have none to
 * open. A lead is a marketing chat, so it opens in the MDG Services inbox.
 */
export function chatHref(waId: string | null | undefined): string | null {
  return waId ? `/whatsapp?line=marketing&chat=${encodeURIComponent(waId)}` : null;
}

/** The badge's colour for each status: amber is "nobody has been in touch", green is "going ahead". */
export const STATUS_TONE: Record<LeadStatus, Intent> = {
  new: 'warning',
  trying: 'neutral',
  talking: 'info',
  interested: 'success',
  registered: 'info',
  client: 'success',
  not_interested: 'neutral',
  asked_to_stop: 'danger',
  wrong_number: 'neutral',
  not_a_lead: 'neutral',
};

export function statusLabel(status: LeadStatus): string {
  return LEAD_STATUS_LABELS[status];
}

export function isClosed(status: LeadStatus): boolean {
  return (LEAD_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Why the next follow-up is due, as the end of a line: "Next: Tue 11:00 · check in". */
export const DUE_REASON_LABELS: Record<LeadDueReason, string> = {
  first_contact: 'first call',
  they_came_back: 'they came back',
  no_answer_retry: 'no answer last time',
  after_message: 'no reply to the message',
  check_in: 'check in',
  scheduled: 'a time the team chose',
};

/** One line under the outcome picker: what choosing it does. */
export const OUTCOME_HINTS: Record<LeadContactOutcome, string> = {
  interested: 'You spoke and they want to go ahead. The next follow-up comes the next day.',
  thinking: 'You spoke and they are thinking it over. The next follow-up comes in two days.',
  no_answer: 'Nobody picked up, or the phone was busy or off. The system tries again soon.',
  message_sent: 'You sent a message and there is no conversation yet. The system asks again the next day.',
  not_interested: 'They said no. This closes the lead. It opens again by itself if they write, tap "Call me", ask for a call-back or register.',
  asked_to_stop: 'They asked us not to contact them again. This closes the lead and also puts them on the WhatsApp stop list, so no promotion reaches them.',
  wrong_number: 'The number is not theirs. This closes the lead.',
};

/** One line under the close picker. */
export const CLOSE_HINTS: Record<LeadAdminCloseReason, string> = {
  not_interested: 'They said no. It opens again by itself if they write, tap "Call me", ask for a call-back or register.',
  asked_to_stop: 'They asked us to stop. They also go on the WhatsApp stop list, so no promotion reaches them.',
  wrong_number: 'The number is not theirs.',
  not_a_lead: 'Our own team, a test, or the same person twice.',
};

/** The seven outcomes in the order a person scans them, split by whether they end the chase. */
export const OPEN_OUTCOMES = LEAD_CONTACT_OUTCOMES.filter((o) => !closesLead(o));
export const CLOSING_OUTCOMES = LEAD_CONTACT_OUTCOMES.filter((o) => closesLead(o));

export function closesLead(outcome: string): boolean {
  return (LEAD_CLOSING_OUTCOMES as readonly string[]).includes(outcome);
}

export function outcomeLabel(outcome: LeadContactOutcome): string {
  return LEAD_CONTACT_OUTCOME_LABELS[outcome];
}

/** The best name for a lead: theirs, else the number, else the reference. Never empty. */
export function leadName(row: Pick<LeadRow, 'name' | 'phone' | 'ref'>): string {
  const name = row.name?.trim();
  if (name) return name;
  return row.phone ? phoneLabel(row.phone) : row.ref;
}

/** "Share link “Ramesh ji”" and the like: where they came from, in a few words. */
export function originText(row: Pick<LeadRow, 'origin' | 'linkLabel'>): string {
  const base = LEAD_ORIGIN_LABELS[row.origin];
  return row.origin === 'share_link' && row.linkLabel ? `${base} “${row.linkLabel}”` : base;
}

// ── Time, in India ──────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** India has no daylight saving: always UTC+05:30. */
const IST_OFFSET = 330 * MINUTE;
// Round the clock (owner, 25 Oct 2026): the window is the whole day, as on the
// server (clock.ts). Two numbers bring quiet nights back, say 9 and 20.
const WINDOW_OPENS = 0;
const WINDOW_CLOSES = 24 * HOUR;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Milliseconds since India midnight of the day `ms` falls on. */
function istMsOfDay(ms: number): number {
  return (((ms + IST_OFFSET) % DAY) + DAY) % DAY;
}

function istMidnight(ms: number): number {
  return ms - istMsOfDay(ms);
}

/** 0 is Sunday, as `Date#getUTCDay`. */
function istWeekday(ms: number): number {
  return new Date(ms + IST_OFFSET).getUTCDay();
}

function istDayNumber(ms: number): number {
  return Math.floor((ms + IST_OFFSET) / DAY);
}

const two = (n: number) => String(n).padStart(2, '0');

/** "14:05" in India time. */
function istClock(ms: number): string {
  const day = istMsOfDay(ms);
  return `${two(Math.floor(day / HOUR))}:${two(Math.floor((day % HOUR) / MINUTE))}`;
}

/** "20:04" in India time, from a time as the server sends it. Empty for one that cannot be read. */
export function clockOf(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '' : istClock(ms);
}

/** A moment as the two boxes a form shows: a day (`2026-10-25`) and a time (`11:00`), both India. */
export interface WhenInput {
  date: string;
  time: string;
}

export function whenInput(ms: number): WhenInput {
  const d = new Date(ms + IST_OFFSET);
  return {
    date: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`,
    time: istClock(ms),
  };
}

/** What two form boxes mean as a moment in India, or `null` when either is missing or not real. */
export function parseWhen(w: WhenInput): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w.date);
  const t = /^(\d{2}):(\d{2})$/.exec(w.time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, da, h, mi) - IST_OFFSET;
  const back = whenInput(ms);
  // Date.UTC rolls 31 Feb to 3 Mar and 25:00 to 01:00 next day; a form box must not.
  return back.date === w.date && back.time === w.time ? ms : null;
}

// ── The working window ──────────────────────────────────────────────────────
// The hours the system raises a follow-up alert (§3): every hour, day and night,
// every day, by the owner's choice. With a narrower window, a follow-up chosen
// outside it is shown at the next opening, because that is when it would come.

/** Inside the working window. 20:00 itself is outside; 09:00 is inside. */
export function inWindow(ms: number): boolean {
  const day = istMsOfDay(ms);
  return day >= WINDOW_OPENS && day < WINDOW_CLOSES;
}

/** The next time the window opens, strictly after `ms`. */
export function nextWindowStart(ms: number): number {
  let open = istMidnight(ms) + WINDOW_OPENS;
  while (open <= ms) open += DAY;
  return open;
}

/** `ms` itself when it is inside the window, else the next time it opens. */
export function moveIntoWindow(ms: number): number {
  return inWindow(ms) ? ms : nextWindowStart(ms);
}

/**
 * `hours` of window time after `ms`: counting starts when the window is open and
 * skips the nights. May land on 20:00 sharp, the end of a window;
 * `moveIntoWindow` then carries it to the next morning.
 */
export function addWorkingHours(ms: number, hours: number): number {
  let at = moveIntoWindow(ms);
  let left = hours * HOUR;
  for (;;) {
    const room = istMidnight(at) + WINDOW_CLOSES - at;
    if (left <= room) return at + left;
    left -= room;
    at = nextWindowStart(at);
  }
}

// ── The suggested next follow-up ────────────────────────────────────────────

interface Step {
  /** This step covers every count of unanswered tries up to and including this one. */
  upTo: number;
  hours: number;
  /** Count only window time. */
  working?: boolean;
  /** For the "How follow-ups work" sentence. */
  words: string;
}

/** After a call that got no answer, by how many tries in a row have gone unanswered. */
const AFTER_NO_ANSWER: readonly Step[] = [
  { upTo: 1, hours: 4, working: true, words: '4 hours later' },
  { upTo: 2, hours: 24, words: 'the next day' },
  { upTo: 3, hours: 48, words: '2 days later' },
  { upTo: 6, hours: 72, words: '3 days later' },
  { upTo: Infinity, hours: 7 * 24, words: 'a week later' },
];

/** After a message with no reply. A message gets a full day before the first nudge. */
const AFTER_MESSAGE: readonly Step[] = [
  { upTo: 2, hours: 24, words: 'the next day' },
  { upTo: 3, hours: 48, words: '2 days later' },
  { upTo: 6, hours: 72, words: '3 days later' },
  { upTo: Infinity, hours: 7 * 24, words: 'a week later' },
];

const AFTER_SPOKE: Partial<Record<LeadContactOutcome, Step>> = {
  interested: { upTo: Infinity, hours: 24, words: 'the next day' },
  thinking: { upTo: Infinity, hours: 48, words: '2 days later' },
};

function stepFor(steps: readonly Step[], unanswered: number): Step {
  return steps.find((s) => unanswered <= s.upTo) ?? (steps[steps.length - 1] as Step);
}

function isAttempt(outcome: LeadContactOutcome): boolean {
  return outcome === 'no_answer' || outcome === 'message_sent';
}

/** Touches closer together than this count as one attempt (§3). */
const COLLAPSE_MS = 30 * MINUTE;

/**
 * How many tries in a row have got no answer once this one is logged: the ones
 * since they last engaged (`row.unanswered`) plus this one. A second try within
 * half an hour of the last one is the same attempt to the clock, so it adds
 * nothing.
 */
export function unansweredAfter(
  row: Pick<LeadRow, 'unanswered' | 'lastContact'>,
  outcome: LeadContactOutcome,
  now: number,
): number {
  if (!isAttempt(outcome)) return 0;
  const last = row.lastContact;
  const at = last ? Date.parse(last.at) : NaN;
  const sameAttempt = !!last && isAttempt(last.outcome) && now >= at && now - at < COLLAPSE_MS;
  return Math.max(1, row.unanswered + (sameAttempt ? 0 : 1));
}

/**
 * When the system would next chase them after this outcome: the table in
 * docs/specs/leads.md §3 rule 5, put through the working window (rule 6).
 * `null` for an outcome that closes the lead: nothing follows a close.
 * `unanswered` is the count after this contact (`unansweredAfter`).
 */
export function suggestNextAt(
  outcome: LeadContactOutcome,
  unanswered: number,
  now: number,
): number | null {
  if (closesLead(outcome)) return null;
  const step =
    AFTER_SPOKE[outcome] ??
    (outcome === 'no_answer' ? stepFor(AFTER_NO_ANSWER, unanswered) : stepFor(AFTER_MESSAGE, unanswered));
  const at = step.working ? addWorkingHours(now, step.hours) : now + step.hours * HOUR;
  return moveIntoWindow(at);
}

/** The rows of "How follow-ups work": what happened, and when the system chases next. Built from the same steps. */
export function followUpGuide(): { when: string; then: string }[] {
  const chain = (steps: readonly Step[]) => steps.map((s) => s.words).join(', then ');
  return [
    // The first call keeps to 11:00–19:00 on the server (owner, 26 Oct 2026): the invites go out
    // at about 19:00, and a lead who watches that night is called the next morning.
    { when: 'A new lead, and nobody has called', then: FIRST_CALL_WORDS },
    { when: 'You spoke and they are interested', then: (AFTER_SPOKE.interested as Step).words },
    { when: 'You spoke and they are thinking it over', then: (AFTER_SPOKE.thinking as Step).words },
    { when: 'Nobody answered your call', then: chain(AFTER_NO_ANSWER) },
    { when: 'You sent a message and heard nothing', then: chain(AFTER_MESSAGE) },
    {
      when: 'They did something: replied, tapped "Call me", asked for a call-back, watched again',
      then: 'Right away. Before anybody has called, between 11:00 and 19:00, like the first call',
    },
    { when: 'You chose a time yourself', then: 'That time' },
  ];
}

/** The working window in words, for the dialogs that explain it. */
export const WINDOW_WORDS = 'at any hour, day or night';

/** When a new lead's first call falls due, as "How follow-ups work" says it. */
export const FIRST_CALL_WORDS =
  '2 hours after we could first reach them, between 11:00 and 19:00. A lead from the evening invites is called at 11:00 the next morning';

// ── Due, last contact, signs ────────────────────────────────────────────────

/** "40 min", "5 h", "2 days". Never less than a minute: "0 min" reads as a bug. */
export function durationWords(ms: number): string {
  const min = Math.max(1, Math.floor(ms / MINUTE));
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** "just now", "20 min ago", "2 h ago", "3 days ago". Empty for a time that cannot be read. */
export function agoWords(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const diff = now - at;
  return diff < MINUTE ? 'just now' : `${durationWords(diff)} ago`;
}

/**
 * When a future moment is, the way a person says it in India: "Today 17:30",
 * "Tomorrow 11:00", "Tue 11:00" inside the week, "3 Nov 11:00" beyond it.
 * `lowerDay` for the middle of a sentence ("Due tomorrow 11:00") — but a weekday
 * keeps its capital.
 */
export function whenWords(ms: number, now: number, lowerDay = false): string {
  const diff = istDayNumber(ms) - istDayNumber(now);
  const d = new Date(ms + IST_OFFSET);
  let day: string;
  if (diff === 0) day = 'Today';
  else if (diff === 1) day = 'Tomorrow';
  else if (diff > 1 && diff < 7) day = WEEKDAYS[istWeekday(ms)] as string;
  else day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (lowerDay && (diff === 0 || diff === 1)) day = day.toLowerCase();
  return `${day} ${istClock(ms)}`;
}

/** A due time this close is worth an amber word. */
const SOON_MS = 2 * HOUR;

export type DueTone = 'danger' | 'warning' | 'neutral';

export interface DueLine {
  text: string;
  tone: DueTone;
}

/**
 * The next follow-up in one line, coloured by how close it is: red once it has
 * passed ("Overdue 5 h"), amber within two hours ("Due in 40 min"), plain after
 * that ("Tue 11:00"). The word is always there, so colour is never the only cue.
 * `null` for a lead that is not chased: closed ones, and registered ones still
 * waiting for Onboarding's first contact (no due time).
 */
export function dueLine(
  row: Pick<LeadRow, 'status' | 'nextDueAt'>,
  now: number,
): DueLine | null {
  if (isClosed(row.status)) return null;
  const due = row.nextDueAt ? Date.parse(row.nextDueAt) : NaN;
  if (row.status === 'registered' && Number.isNaN(due)) return null;
  if (Number.isNaN(due)) return { text: 'No follow-up set', tone: 'neutral' };
  if (now >= due) {
    return now - due < MINUTE
      ? { text: 'Due now', tone: 'danger' }
      : { text: `Overdue ${durationWords(now - due)}`, tone: 'danger' };
  }
  if (due - now <= SOON_MS) return { text: `Due in ${durationWords(due - now)}`, tone: 'warning' };
  return { text: whenWords(due, now), tone: 'neutral' };
}

/** The same, for the WhatsApp inbox's one-line lead note: "Due tomorrow 11:00". */
export function lookupLine(l: LeadLookup, now: number): string {
  const parts = [`Lead ${l.ref}`, LEAD_STATUS_LABELS[l.status]];
  const due = l.nextDueAt ? Date.parse(l.nextDueAt) : NaN;
  if (!isClosed(l.status) && !Number.isNaN(due)) {
    if (now >= due) {
      parts.push(now - due < MINUTE ? 'Due now' : `Overdue ${durationWords(now - due)}`);
    } else if (due - now <= SOON_MS) {
      parts.push(`Due in ${durationWords(due - now)}`);
    } else {
      parts.push(`Due ${whenWords(due, now, true)}`);
    }
  }
  return parts.join(' · ');
}

const CHANNEL_VERB: Record<LeadContactChannel, string> = {
  call: 'Called',
  whatsapp: 'Messaged',
  visit: 'Met',
};

/** What an outcome adds to the "last contact" line. A message needs no second "sent". */
const OUTCOME_SHORT: Record<LeadContactOutcome, string> = {
  interested: 'spoke, interested',
  thinking: 'spoke, thinking it over',
  no_answer: 'no answer',
  message_sent: '',
  not_interested: 'not interested',
  asked_to_stop: 'asked us to stop',
  wrong_number: 'wrong number',
};

/** "Called by Aryan · 2 h ago · no answer". `null` when nobody has been in touch. */
export function lastContactLine(c: LeadContactSummary | null, now: number): string | null {
  if (!c) return null;
  return [
    `${CHANNEL_VERB[c.channel]}${c.byName ? ` by ${c.byName}` : ''}`,
    agoWords(c.at, now),
    OUTCOME_SHORT[c.outcome],
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Tapped “Call me” · 20 min ago", but only while it is news: a sign from before
 * our last contact has been dealt with, and printing it again would say "they are
 * waiting" about somebody we already rang.
 */
export function signLine(
  sign: LeadSign | null,
  lastContact: LeadContactSummary | null,
  now: number,
): string | null {
  if (!sign) return null;
  const at = Date.parse(sign.at);
  if (Number.isNaN(at)) return null;
  if (lastContact && Date.parse(lastContact.at) >= at) return null;
  return `${LEAD_SIGN_LABELS[sign.kind]} · ${agoWords(sign.at, now)}`;
}

/**
 * "22 Oct" in India time, with the year added once it is not this year, so a list
 * that keeps every lead cannot leave "3 Mar" to be guessed at. Empty for a time
 * that cannot be read.
 */
export function dayWords(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const d = new Date(at + IST_OFFSET);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const year = d.getUTCFullYear();
  return year === new Date(now + IST_OFFSET).getUTCFullYear() ? day : `${day} ${year}`;
}

/** "Lead since 22 Oct": when they became a lead, as a day. `null` for a time that cannot be read. */
export function sinceLine(firstSeenAt: string | null | undefined, now: number): string | null {
  const day = dayWords(firstSeenAt, now);
  return day ? `Lead since ${day}` : null;
}

/** "2 tries without an answer": the calls and messages since they last engaged that nobody picked up. `null` for none. */
export function triesLine(unanswered: number): string | null {
  if (!(unanswered > 0)) return null;
  return `${unanswered} ${unanswered === 1 ? 'try' : 'tries'} without an answer`;
}

/** The newest note on a lead as the list shows it: the words in quotes, and who wrote them and when. */
export interface NoteLine {
  /** “The words”, on one line with the breaks taken out: the list clamps it to two lines. */
  quote: string;
  /** "Aryan, 2 h ago". Empty only when neither is known. */
  by: string;
}

/**
 * The latest note somebody wrote, so the list says what was agreed without
 * opening the lead. `null` when there is none, or when it is only blank space.
 */
export function noteLine(note: LeadNote | null, now: number): NoteLine | null {
  if (!note) return null;
  const text = note.text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const by = [note.byName?.trim(), agoWords(note.at, now)].filter(Boolean).join(', ');
  return { quote: `“${text}”`, by };
}

/** "Pawan · 2 h ago": who wrote the newest note and when, for under the note in the drawer. */
export function noteByLine(note: Pick<LeadNote, 'byName' | 'at'>, now: number): string {
  return [note.byName?.trim(), agoWords(note.at, now)].filter(Boolean).join(' · ');
}

export function ownerLine(owner: LeadRow['owner']): string {
  return owner ? `Owner: ${owner.name}` : 'Nobody owns it yet';
}

/** "Closed by Aryan · 24 Oct, 14:05", or "Closed automatically" for the system's own closes. */
export function closedLine(row: Pick<LeadRow, 'closedAt' | 'closedByName'>, now: number): string {
  const by =
    row.closedByName && row.closedByName !== 'Automatic'
      ? `Closed by ${row.closedByName}`
      : 'Closed automatically';
  const when = istStamp(row.closedAt, now);
  return when ? `${by} · ${when}` : by;
}

/** Whether a closed lead may be opened again by hand. A client never is: they are one of ours. */
export function canReopen(status: LeadStatus): boolean {
  return isClosed(status) && status !== 'client';
}

/** "Filled in the registration form" and so on, for a lead with one. */
export function registrationWords(state: NonNullable<LeadRow['registration']>['state']): string {
  switch (state) {
    case 'NEW':
      return 'Filled in "Register your pump". Nobody has been in touch about it yet';
    case 'CONTACTED':
      return 'Filled in "Register your pump". Onboarding is in touch and waiting for a yes';
    case 'APPROVED':
      return 'Registered and approved';
    case 'LOST':
      return 'Registered, then dropped out';
  }
}

// ── Watching ────────────────────────────────────────────────────────────────

/** `754` → `12:34`; an hour or more → `1:02:03`. */
export function clockWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = two(s % 60);
  return h > 0 ? `${h}:${two(m)}:${sec}` : `${m}:${sec}`;
}

/**
 * "Watched 12:30 of 26:29 · 2 visits · sound on": how far they got, and whether
 * they could hear it. `withVisits` false leaves the count out, for the Leads
 * table, whose next line ("2 visits · last watched 2 h ago") already says it.
 * `origin` tells a lead added by hand, who need never have seen the film, from
 * a call-back that was on the film page.
 */
export function watchLine(w: LeadWatch, withVisits = true, origin?: LeadOrigin): string {
  if (w.visits === 0 && origin === 'manual') return 'Has not watched the film';
  // A call-back from the film page with no link code: they were on the page, but
  // no visit can be tied to them, so there is nothing to measure.
  if (w.visits === 0) return 'Was on the film page; no visit we can tie to them';
  const length = w.durationSeconds > 0 ? ` of ${clockWords(w.durationSeconds)}` : '';
  const parts = [
    w.completed ? 'Watched to the end' : `Watched ${clockWords(w.bestSeconds)}${length}`,
    withVisits && w.visits > 1 ? `${w.visits} visits` : '',
    w.soundOn ? 'sound on' : 'sound off',
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * "4 visits · last watched 2 h ago", and "· 2 devices" when more than one browser
 * opened it. One visit leaves the count out ("Last watched 2 h ago"). `null`
 * when no visit is tied to them: a call-back from the film page has none, and
 * "0 visits" would read as a fact about them.
 */
export function visitsLine(
  w: Pick<LeadWatch, 'visits' | 'lastAt' | 'devices'>,
  now: number,
): string | null {
  if (w.visits < 1) return null;
  const ago = agoWords(w.lastAt, now);
  const line = [
    w.visits > 1 ? `${w.visits} visits` : '',
    ago ? `last watched ${ago}` : '',
    w.devices > 1 ? `${w.devices} devices` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : null;
}

/** Why an invite did not arrive, as the end of "Invite not delivered — …". */
const INVITE_FAILURE_WORDS: Record<NonNullable<LeadInvite['failure']>, string> = {
  held_back: 'held back by WhatsApp',
  not_on_whatsapp: 'not on WhatsApp',
  other: '',
};

/**
 * How the WhatsApp film invite fared, in one line: "Invite read 22 Oct · no
 * reply yet", "Invite sent 22 Oct", "Invite not delivered — not on WhatsApp".
 * `null` for a lead that was never sent one (a call-back from the film page).
 * The day is the day the invite went: the list is not told when it was read.
 *
 * "Not opened yet" is only said while nothing says otherwise. WhatsApp reports
 * no read tick when the person has read receipts off, so a lead can sit on
 * "delivered" for good while watching the film from their own link; then the
 * line says "delivered" and no more, instead of contradicting the visits line
 * under it. "No reply yet" counts a written reply or a tap on "Call me".
 */
export function inviteLine(
  row: Pick<LeadRow, 'invite' | 'signs' | 'watch'>,
  now: number,
): string | null {
  const { invite, signs, watch } = row;
  if (!invite) return null;
  const day = dayWords(invite.at, now);
  const say = (head: string, tail = '') => [head, day].filter(Boolean).join(' ') + tail;
  const wrote = signs.replied !== null || signs.callMe !== null;
  switch (invite.delivery) {
    case 'read':
      return say('Invite read', wrote ? '' : ' · no reply yet');
    case 'delivered':
      return wrote || watch.visits > 0
        ? say('Invite delivered')
        : 'Invite delivered, not opened yet';
    case 'sent':
      return say('Invite sent');
    case 'failed': {
      const why = invite.failure ? INVITE_FAILURE_WORDS[invite.failure] : '';
      return why ? `Invite not delivered — ${why}` : 'Invite not delivered';
    }
  }
}

/**
 * What they did to get in touch, newest first, that the chip beside the invite
 * line says. Watching is left out (the visits line has it) and so is
 * registering (a registered lead's row says Onboarding has them).
 */
// The more specific first: a "Call me" tap is also an incoming message, so it
// lands as a reply at the same moment, and a tie goes to the first in this list.
// The same order as the server's (services/leads/clock.ts SIGN_ORDER).
const REACHED_OUT: readonly (readonly [keyof LeadSigns, LeadSign['kind']])[] = [
  ['callMe', 'call_me'],
  ['callback', 'callback'],
  ['assistant', 'assistant'],
  ['replied', 'replied'],
];

/** The newest of the ways they reached out, or `null` when they have not. */
export function newestReachOut(signs: LeadSigns | null | undefined): LeadSign | null {
  // A server older than this page sends no signs: say nothing rather than crash.
  if (!signs) return null;
  let best: LeadSign | null = null;
  for (const [key, kind] of REACHED_OUT) {
    const at = signs[key];
    const ms = at ? Date.parse(at) : NaN;
    if (at && !Number.isNaN(ms) && (!best || ms > Date.parse(best.at))) best = { at, kind };
  }
  return best;
}

/**
 * The chip in the "Their interest" column: "Tapped “Call me” · 1 h ago". It is
 * worked from every kind of sign and not from `lastSign`, which is only the
 * newest: a lead who replied at ten and watched again at eleven has "watched"
 * as their last sign, and the reply would never show. The same rule as
 * `signLine` applies: once we have been in touch since, it is not news.
 */
export function reachOutLine(
  row: Pick<LeadRow, 'signs' | 'lastContact'>,
  now: number,
): string | null {
  return signLine(newestReachOut(row.signs), row.lastContact, now);
}

/** How much of the film the best visit covered, as a whole 0 to 100 for the bar. */
export function watchPercent(w: Pick<LeadWatch, 'bestSeconds' | 'durationSeconds' | 'completed'>): number {
  if (w.completed) return 100;
  if (w.durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((w.bestSeconds / w.durationSeconds) * 100)));
}

/** More than one browser usually means the link was forwarded or opened twice. */
export function devicesNote(devices: number): string | null {
  return devices > 1
    ? `Opened on ${devices} devices. The link was probably forwarded or opened twice.`
    : null;
}

// ── The page's numbers ──────────────────────────────────────────────────────

/** Leads we have spoken to and that have not decided: "In talks". */
export function inTalksCount(items: readonly Pick<LeadRow, 'status'>[]): number {
  return items.filter((r) => r.status === 'talking' || r.status === 'interested').length;
}

export interface FunnelStep {
  key: keyof Omit<LeadFunnel, 'days'>;
  label: string;
  count: number;
}

/** Watched, contacted, spoke, registered, became clients: each counts leads that got at least that far. */
export function funnelSteps(f: LeadFunnel): FunnelStep[] {
  return [
    { key: 'watched', label: 'Watched', count: f.watched },
    { key: 'contacted', label: 'Contacted', count: f.contacted },
    { key: 'spoke', label: 'Spoke', count: f.spoke },
    { key: 'registered', label: 'Registered', count: f.registered },
    { key: 'clients', label: 'Became clients', count: f.clients },
  ];
}

/** How many the tab holds in all, to say when the list is cut short. */
export function viewTotal(view: LeadView, counts: LeadCounts): number {
  return counts[view];
}

// ── One film visit ─────────────────────────────────────────────────────────

/** One film visit in a line: "Watched 12:30 (47%) · sound on". */
export function visitLine(v: { seconds: number; percent: number; completed: boolean; soundOn: boolean }): string {
  return [
    v.completed ? 'Watched to the end' : `Watched ${clockWords(v.seconds)} (${Math.round(v.percent)}%)`,
    v.soundOn ? 'sound on' : 'sound off',
  ].join(' · ');
}

// ── The drawer: where it stands, and the story in days ──────────────────────
// What the drawer decides on its own, so the component only draws it: which
// colour the "do this now" panel takes, how full the film bar looks, who did
// each thing on the timeline, which asks are still waiting for us, and how the
// timeline is cut into days with the delivery ticks folded into one line.

/** The header's second line: "L-0012 · Dhanbad · Lead since 25 Oct". What is not known is left out. */
export function drawerSubtitle(
  row: Pick<LeadRow, 'ref' | 'place' | 'firstSeenAt'>,
  now: number,
): string {
  return [row.ref, row.place?.trim(), sinceLine(row.firstSeenAt, now)].filter(Boolean).join(' · ');
}

export type DoNowTone = 'danger' | 'warning' | 'brand' | 'quiet';

/**
 * The colour of the panel that says what to do now. Red when it has gone cold or
 * is overdue; amber when somebody is waiting on us (nobody has been in touch,
 * the follow-up is within two hours, or they reached out after our last
 * contact); blue otherwise. Grey when there is nothing to do: the lead is
 * closed, or Onboarding has it and no follow-up is set. The order matters: a
 * closed lead is never red, however late its old due time was.
 */
export function doNowTone(
  row: Pick<LeadRow, 'status' | 'cold' | 'nextDueAt' | 'lastContact' | 'signs'>,
  now: number,
): DoNowTone {
  if (isClosed(row.status)) return 'quiet';
  if (row.status === 'registered' && !row.nextDueAt) return 'quiet';
  const due = dueLine(row, now);
  if (row.cold || due?.tone === 'danger') return 'danger';
  if (due?.tone === 'warning' || row.lastContact === null || reachOutLine(row, now) !== null) {
    return 'warning';
  }
  return 'brand';
}

/**
 * The second line of that panel: when the next follow-up is, who closed it and
 * when, or "Onboarding has them". `null` when there is nothing to add.
 *
 * The follow-up's time is labelled "Next follow-up:" only when it is a plain day
 * and time. "Overdue 5 h" and "Due in 40 min" already say what they are about,
 * and a label in front of them reads as a stutter. The reason is the server's
 * sentence above the line already: "a time the team chose" would only repeat its
 * "follow up as planned", so a scheduled follow-up leaves the reason out.
 */
export function nextFollowUpLine(
  row: Pick<LeadRow, 'status' | 'nextDueAt' | 'dueReason' | 'closedAt' | 'closedByName'>,
  now: number,
): string | null {
  if (isClosed(row.status)) return closedLine(row, now);
  if (row.status === 'registered' && !row.nextDueAt) return 'Onboarding has them';
  const due = dueLine(row, now);
  if (!due) return null;
  if (!row.nextDueAt) return due.text;
  const when = due.tone === 'neutral' ? `Next follow-up: ${due.text}` : due.text;
  const why =
    row.dueReason && row.dueReason !== 'scheduled' ? ` · ${DUE_REASON_LABELS[row.dueReason]}` : '';
  return `${when}${why}`;
}

/**
 * What goes under the do-now sentence: `nextFollowUpLine`, unless the sentence
 * already says it. The server words the sentence ("Registered: Onboarding has
 * them."), and a second line that is a part of it would only say it twice.
 */
export function doNowDetail(
  row: Pick<LeadRow, 'status' | 'nextDueAt' | 'dueReason' | 'closedAt' | 'closedByName'>,
  nextStep: string,
  now: number,
): string | null {
  const line = nextFollowUpLine(row, now);
  if (!line) return null;
  return nextStep.toLowerCase().includes(line.toLowerCase()) ? null : line;
}

/** What they did to reach us that is still news, and which sign it was (for its icon). */
export interface TheyDid {
  text: string;
  kind: LeadSignKind;
  /**
   * `warning` when they reached out and nobody has answered: that is a lead
   * waiting on us, the same amber as the panel above it. `info` for the rest
   * (watching again, registering): something they did, nobody waiting.
   */
  tone: 'warning' | 'info';
}

/**
 * "Tapped “Call me” · 1 h ago": the newest way they reached out, or failing
 * that the newest sign of any kind (watching again, registering), as the old
 * "They did" row said. `null` once we have been in touch since: that is dealt
 * with, and the line would say "they are waiting" about somebody we already rang.
 */
export function theyDid(
  row: Pick<LeadRow, 'signs' | 'lastSign' | 'lastContact'>,
  now: number,
): TheyDid | null {
  const reach = newestReachOut(row.signs);
  const reachText = signLine(reach, row.lastContact, now);
  if (reach && reachText) return { text: reachText, kind: reach.kind, tone: 'warning' };
  const last = row.lastSign;
  const lastText = signLine(last, row.lastContact, now);
  if (!last || !lastText) return null;
  const asked = REACHED_OUT.some(([, kind]) => kind === last.kind);
  return { text: lastText, kind: last.kind, tone: asked ? 'warning' : 'info' };
}

/** "Last watched 25 Oct, 20:02 · Dhanbad". `null` when no visit is tied to them. */
export function lastWatchedLine(w: Pick<LeadWatch, 'lastAt' | 'city'>, now: number): string | null {
  const when = istStamp(w.lastAt, now);
  if (!when) return null;
  return [`Last watched ${when}`, w.city?.trim()].filter(Boolean).join(' · ');
}

/** From this far the bar is green: they watched most of it. */
const WATCHED_WELL = 75;

/** A bar's colour from how much was watched: green once it is three quarters or to the end, else blue. */
export function fillOf(percent: number, completed: boolean): 'success' | 'brand' {
  return completed || percent >= WATCHED_WELL ? 'success' : 'brand';
}

/** The film bar's colour for a lead: green at 75% or more, or watched to the end. */
export function watchFill(
  w: Pick<LeadWatch, 'bestSeconds' | 'durationSeconds' | 'completed'>,
): 'success' | 'brand' {
  return fillOf(watchPercent(w), w.completed);
}

// ── The timeline: who did it ────────────────────────────────────────────────

/**
 * Who did each kind of thing, for a server that does not say (before 26 Oct 2026).
 * It is a guess by kind and no more: a call-back and a WhatsApp message each
 * come from more than one of them, which is why the server sends `actor`. A
 * title is never read.
 */
const ACTOR_OF_KIND: Record<LeadTimelineKind, LeadTimelineActor> = {
  film_visit: 'lead',
  whatsapp_in: 'lead',
  call_me: 'lead',
  callback: 'lead',
  assistant: 'lead',
  registration: 'lead',
  opted_out: 'lead',
  activity: 'team',
  call_recording: 'team',
  registration_call: 'team',
  campaign_sent: 'system',
  whatsapp_out: 'system',
  client: 'system',
};

/** Who acted: what the server said, else the kind's usual one, else the system. */
export function timelineActor(item: Pick<LeadTimelineItem, 'kind' | 'actor'>): LeadTimelineActor {
  const said = item.actor;
  if (said && (LEAD_TIMELINE_ACTORS as readonly string[]).includes(said)) return said;
  return ACTOR_OF_KIND[item.kind] ?? 'system';
}

/** The kinds of thing a person does that wait for an answer from us. */
const ASKS: readonly LeadTimelineKind[] = ['call_me', 'callback', 'whatsapp_in', 'assistant'];

/**
 * Whether this is something they asked or wrote that nobody has answered: their
 * doing, one of the ways of asking, and later than our last contact (or we have
 * never been in touch). The same rule as `signLine`, so the timeline and the
 * "They" line cannot disagree.
 */
export function isWaitingForUs(
  item: Pick<LeadTimelineItem, 'kind' | 'actor' | 'at'>,
  lastContact: Pick<LeadContactSummary, 'at'> | null,
): boolean {
  if (timelineActor(item) !== 'lead' || !ASKS.includes(item.kind)) return false;
  const at = Date.parse(item.at);
  if (Number.isNaN(at)) return false;
  return !lastContact || !(Date.parse(lastContact.at) >= at);
}

/** The word a screen reader hears first on a row, because the colour says it only to those who can see it. */
export function actorPrefix(item: Pick<LeadTimelineItem, 'kind' | 'actor' | 'failed'>): string {
  if (item.failed) return 'Did not go through: ';
  switch (timelineActor(item)) {
    case 'lead':
      return 'They: ';
    case 'team':
      return 'Team: ';
    case 'system':
      return 'Automatic: ';
  }
}

/** Who on the team did it, for the line under a team row. A name that was never kept reads as "Someone at MDG". */
export function teamName(by: string | null | undefined): string {
  return by?.trim() || 'Someone at MDG';
}

/** The film visit this timeline row stands for, matched by its identical start time. `null` when none matches. */
export function visitOf(
  item: Pick<LeadTimelineItem, 'kind' | 'at'>,
  visits: readonly LeadVisit[],
): LeadVisit | null {
  if (item.kind !== 'film_visit') return null;
  return visits.find((v) => v.at === item.at) ?? null;
}

/** How much of the film one visit covered, as a whole 0 to 100 for its bar. */
export function visitPercent(v: Pick<LeadVisit, 'percent' | 'completed'>): number {
  if (v.completed) return 100;
  return Number.isFinite(v.percent) ? Math.max(0, Math.min(100, Math.round(v.percent))) : 0;
}

/** "sound on · Dhanbad · iPhone · opened later, without the link": the rest of what a visit says. */
export function visitMeta(v: Pick<LeadVisit, 'soundOn' | 'city' | 'device' | 'viaLink'>): string {
  return [
    v.soundOn ? 'sound on' : 'sound off',
    v.city?.trim(),
    v.device?.trim(),
    v.viaLink ? null : 'opened later, without the link',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── The timeline: days, and the ticks folded ────────────────────────────────

/** One line of the story: a thing that happened, or the invite's steps folded into one. */
export type StoryRow =
  | { type: 'item'; item: LeadTimelineItem }
  | { type: 'fold'; items: LeadTimelineItem[] };

/** One day of the story: "Today · 25 Oct" and its rows, newest first. */
export interface StoryDay {
  heading: string;
  rows: StoryRow[];
}

/**
 * The day as a heading, by the India calendar: "Today · 25 Oct", "Yesterday ·
 * 24 Oct", "Wed 21 Oct", and the year once it is not this year ("Mon 3 Nov
 * 2025"). Empty for a time that cannot be read.
 */
export function dayHeading(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const day = dayWords(iso, now);
  const diff = istDayNumber(at) - istDayNumber(now);
  if (diff === 0) return `Today · ${day}`;
  if (diff === -1) return `Yesterday · ${day}`;
  return `${WEEKDAYS[istWeekday(at)]} ${day}`;
}

/** An invite step that went through: sent, delivered, read. Folded when two or more sit together. */
function isTick(item: LeadTimelineItem): boolean {
  return item.kind === 'campaign_sent' && !item.failed;
}

/**
 * The timeline as days, newest first as the server sends it. Within a day, two
 * or more invite steps side by side (sent, delivered, read) become one fold, so
 * three lines that say one thing take one. A step that did not go through is
 * never folded, and a fold never crosses midnight: the day heading is the date.
 */
export function storyRows(items: readonly LeadTimelineItem[], now: number): StoryDay[] {
  const days = new Map<number, { heading: string; items: LeadTimelineItem[] }>();
  for (const item of items) {
    const ms = Date.parse(item.at);
    const key = Number.isNaN(ms) ? Number.NaN : istDayNumber(ms);
    const day = days.get(key) ?? { heading: dayHeading(item.at, now), items: [] };
    day.items.push(item);
    days.set(key, day);
  }
  return [...days.values()].map((day) => {
    const rows: StoryRow[] = [];
    let run: LeadTimelineItem[] = [];
    const endRun = () => {
      if (run.length >= 2) rows.push({ type: 'fold', items: run });
      else for (const item of run) rows.push({ type: 'item', item });
      run = [];
    };
    for (const item of day.items) {
      if (isTick(item)) {
        run.push(item);
      } else {
        endRun();
        rows.push({ type: 'item', item });
      }
    }
    endRun();
    return { heading: day.heading, rows };
  });
}

/**
 * The first `max` ROWS of the story, and how many were left out. Rows, not
 * items: a fold is one row however many steps it holds. A day cut part way
 * keeps its heading, and a day cut away whole takes its heading with it.
 */
export function firstRows(
  days: readonly StoryDay[],
  max: number,
): { days: StoryDay[]; hidden: number } {
  let room = Math.max(0, Math.floor(max));
  let hidden = 0;
  const out: StoryDay[] = [];
  for (const day of days) {
    if (day.rows.length <= room) {
      out.push(day);
      room -= day.rows.length;
    } else {
      if (room > 0) out.push({ heading: day.heading, rows: day.rows.slice(0, room) });
      hidden += day.rows.length - room;
      room = 0;
    }
  }
  return { days: out, hidden };
}

/** The fold's one line: the newest step, and how many came before it. "Film invite read · 2 earlier steps". */
export function foldLine(items: readonly LeadTimelineItem[]): string {
  const earlier = Math.max(0, items.length - 1);
  return `${items[0]?.title ?? ''} · ${earlier} earlier ${earlier === 1 ? 'step' : 'steps'}`;
}

// ── Forms: the follow-up boxes ──────────────────────────────────────────────

/** A time in the past is not a follow-up, and the server refuses it too. */
function whenProblem(ms: number | null, now: number): string | null {
  if (ms === null) return 'Pick a real day and time.';
  if (ms <= now) return 'Pick a time that has not passed yet.';
  if (ms > now + FOLLOW_UP_MAX_DAYS * DAY) {
    return `Pick a day within the next ${FOLLOW_UP_MAX_DAYS} days.`;
  }
  return null;
}

function noteTooLong(note: string): string | null {
  const length = note.trim().length;
  return length > NOTE_MAX ? `Keep the note under ${NOTE_MAX} characters. It is ${length} now.` : null;
}

/** "Reminder: Tue 11:00." and, should a narrower window ever move it, why it will come later. */
export function reminderLine(ms: number, now: number): string {
  const at = moveIntoWindow(ms);
  const when = whenWords(at, now);
  return at === ms
    ? `Reminder: ${when}.`
    : `Reminder: ${when}. We only remind ${WINDOW_WORDS}.`;
}

export interface QuickPick {
  id: 'soon' | 'tomorrow' | 'monday';
  label: string;
  at: number;
}

/**
 * The three one-tap choices on the follow-up form: in two hours, tomorrow at
 * 11:00, the next Monday at 11:00 (left out when tomorrow already is Monday).
 */
export function quickPicks(now: number): QuickPick[] {
  const today = istMidnight(now);
  const picks: QuickPick[] = [
    { id: 'soon', label: 'In 2 hours', at: Math.ceil((now + 2 * HOUR) / MINUTE) * MINUTE },
  ];
  const tomorrow = today + DAY + 11 * HOUR;
  picks.push({ id: 'tomorrow', label: 'Tomorrow 11:00', at: tomorrow });
  const toMonday = ((1 - istWeekday(today) + 7) % 7) || 7;
  const monday = today + toMonday * DAY + 11 * HOUR;
  if (monday !== tomorrow) picks.push({ id: 'monday', label: 'Monday 11:00', at: monday });
  return picks;
}

// ── Forms: log a contact ────────────────────────────────────────────────────

export interface ContactForm {
  channel: string;
  outcome: string;
  note: string;
  /**
   * The follow-up the person typed, or `null` while they have left the
   * suggestion alone. Left alone, nothing is sent and the server's own clock
   * picks the time and says why ("no answer last time"); sending the suggestion
   * would turn every reminder into "a time the team chose".
   */
  next: WhenInput | null;
}

/** Why the contact cannot be saved yet, or `null`. */
export function contactProblem(f: ContactForm, now: number): string | null {
  if (!(LEAD_CONTACT_OUTCOMES as readonly string[]).includes(f.outcome)) {
    return 'Pick what came of it.';
  }
  if (!(LEAD_CONTACT_CHANNELS as readonly string[]).includes(f.channel)) return 'Pick how you were in touch.';
  const long = noteTooLong(f.note);
  if (long) return long;
  if (f.next && !closesLead(f.outcome)) {
    const empty = !f.next.date && !f.next.time;
    if (empty) return null;
    if (!f.next.date || !f.next.time) return 'Pick both the day and the time, or clear both.';
    return whenProblem(parseWhen(f.next), now);
  }
  return null;
}

export interface ContactBody {
  channel: LeadContactChannel;
  outcome: LeadContactOutcome;
  note?: string;
  nextAt?: string;
}

/** What `POST …/contacts` takes: the note and the follow-up only when they mean something. */
export function contactBody(f: ContactForm): ContactBody {
  const note = f.note.trim();
  const at = f.next && !closesLead(f.outcome) ? parseWhen(f.next) : null;
  return {
    channel: f.channel as LeadContactChannel,
    outcome: f.outcome as LeadContactOutcome,
    ...(note ? { note } : {}),
    ...(at !== null ? { nextAt: new Date(at).toISOString() } : {}),
  };
}

// ── Forms: set a follow-up ──────────────────────────────────────────────────

export interface FollowUpForm {
  date: string;
  time: string;
  note: string;
}

export function followUpProblem(f: FollowUpForm, now: number): string | null {
  if (!f.date || !f.time) return 'Pick the day and the time.';
  const bad = whenProblem(parseWhen(f), now);
  if (bad) return bad;
  return noteTooLong(f.note);
}

export interface FollowUpBody {
  at: string;
  note?: string;
}

export function followUpBody(f: FollowUpForm): FollowUpBody {
  const at = parseWhen(f);
  const note = f.note.trim();
  return { at: new Date(at ?? 0).toISOString(), ...(note ? { note } : {}) };
}

// ── Forms: assign, note, close, reopen, number ──────────────────────────────

export interface AssignBody {
  ownerId: string | null;
}

/** "" is Nobody. */
export function assignBody(ownerId: string): AssignBody {
  return { ownerId: ownerId || null };
}

export function noteProblem(text: string): string | null {
  if (!text.trim()) return 'Write the note first.';
  return noteTooLong(text);
}

export function noteBody(text: string): { text: string } {
  return { text: text.trim() };
}

export interface CloseForm {
  reason: string;
  note: string;
}

export function closeProblem(f: CloseForm): string | null {
  if (!(LEAD_ADMIN_CLOSE_REASONS as readonly string[]).includes(f.reason)) {
    return 'Pick why you are closing it.';
  }
  return noteTooLong(f.note);
}

export interface CloseBody {
  reason: LeadAdminCloseReason;
  note?: string;
}

export function closeBody(f: CloseForm): CloseBody {
  const note = f.note.trim();
  return { reason: f.reason as LeadAdminCloseReason, ...(note ? { note } : {}) };
}

export function reopenProblem(note: string): string | null {
  return noteTooLong(note);
}

export function reopenBody(note: string): { note?: string } {
  const n = note.trim();
  return n ? { note: n } : {};
}

/**
 * Ten digits starting 6 to 9, from how a person types a number: spaces and
 * dashes, a "+91", "91" or "0" in front. Mirrors `addLeadPhoneSchema`'s
 * pattern, then checks it is an Indian mobile as `@/lib/intake` does.
 */
export function mobileTen(raw: string): string | null {
  const typed = raw.trim();
  if (!/^[0-9+\s-]{10,15}$/.test(typed)) return null;
  const digits = typed.replace(/\D/g, '');
  const ten =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
          ? digits.slice(1)
          : null;
  return ten && /^[6-9]/.test(ten) ? ten : null;
}

export function phoneProblem(raw: string): string | null {
  return mobileTen(raw) ? null : 'Type a 10-digit mobile number, for example 98765 43210.';
}

/** The ten digits on their own: nothing for the server to misread. */
export function phoneBody(raw: string): { mobile: string } {
  return { mobile: mobileTen(raw) ?? raw.trim() };
}

/** "Add lead": somebody the team wants to work, typed in by hand. Only the number is needed. */
export interface AddLeadForm {
  mobile: string;
  name: string;
  place: string;
  note: string;
}

export type AddLeadProblems = Partial<Record<keyof AddLeadForm, string>>;

/** What is wrong with the form, field by field. Empty when it can be sent. */
export function addLeadProblems(form: AddLeadForm): AddLeadProblems {
  const out: AddLeadProblems = {};
  const mobile = phoneProblem(form.mobile);
  if (mobile) out.mobile = mobile;
  for (const field of ['name', 'place'] as const) {
    const length = form[field].trim().length;
    if (length > NAME_MAX) out[field] = `Keep it under ${NAME_MAX} characters. It is ${length} now.`;
  }
  const note = noteTooLong(form.note);
  if (note) out.note = note;
  return out;
}

/** The form as the server takes it: the ten digits, and only the boxes that were filled in. */
export function addLeadBody(form: AddLeadForm): CreateLeadInput {
  const name = form.name.trim();
  const place = form.place.trim();
  const note = form.note.trim();
  return {
    ...phoneBody(form.mobile),
    ...(name ? { name } : {}),
    ...(place ? { place } : {}),
    ...(note ? { note } : {}),
  };
}

// ── Call recordings ─────────────────────────────────────────────────────────
// The team uploads the recording of a call, the server writes it down and a
// model boils it to a few lines, and the drawer shows those lines for the next
// person who rings. The rules here are what that screen decides on its own:
// which file may be picked, what a failure says, and how much of a summary a
// glance is given.

/** Mirrors the longest name `presignLeadRecordingSchema` takes; `scripts/leads.check.ts` fails if they disagree. */
export const RECORDING_FILENAME_MAX = 200;
/** Mirrors the longest call `addLeadRecordingSchema` takes a length for: four hours. */
export const RECORDING_DURATION_MAX_SEC = 4 * 60 * 60;
/** A summary shows this many bullets under each heading, whatever the server sent. */
export const SUMMARY_BULLETS_MAX = 3;

/** The three words the interest badge can mean, as the same colours the status badges use. */
const INTEREST_TONE: Record<LeadCallInterest, Intent> = {
  hot: 'success',
  warm: 'warning',
  cold: 'info',
  unclear: 'neutral',
};

/** A badge for an interest this screen does not know (a newer server) reads as "Unclear", never as a blank pill. */
export function interestLabel(interest: LeadCallInterest): string {
  return LEAD_CALL_INTEREST_LABELS[interest] ?? LEAD_CALL_INTEREST_LABELS.unclear;
}

export function interestTone(interest: LeadCallInterest): Intent {
  return INTEREST_TONE[interest] ?? INTEREST_TONE.unclear;
}

/**
 * The type a picked file goes up as, by the extensions a phone's call recorder
 * and a voice-memo app write. Used only when the browser names no type: an
 * Android picker often hands back an empty one.
 */
const RECORDING_EXTENSIONS: Record<string, (typeof LEAD_RECORDING_TYPES)[number]> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  // An .opus file is Opus inside an Ogg wrapper.
  opus: 'audio/ogg',
  webm: 'audio/webm',
};

/** Other names browsers give the same formats; the server's list holds only one name for each. */
const RECORDING_TYPE_ALIASES: Record<string, (typeof LEAD_RECORDING_TYPES)[number]> = {
  'audio/mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'audio/m4a': 'audio/x-m4a',
  'audio/x-aac': 'audio/aac',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
};

/**
 * What the file picker offers. Spelled out rather than `audio/*`, so a phone's
 * picker does not offer an .amr or a .flac that the server would then turn away.
 */
export const RECORDING_ACCEPT = [
  ...Object.keys(RECORDING_EXTENSIONS).map((ext) => `.${ext}`),
  ...LEAD_RECORDING_TYPES,
].join(',');

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * The content type to send for a picked file, or `null` when it is not audio
 * the server takes. The browser's own word wins when it gives one the server
 * knows. When it gives none (or the useless "binary file"), the name decides.
 */
export function recordingType(file: { name: string; type: string }): string | null {
  const raw = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  const named: string = RECORDING_TYPE_ALIASES[raw] ?? raw;
  if ((LEAD_RECORDING_TYPES as readonly string[]).includes(named)) return named;
  // No type, "binary file", or a sound or video type the server does not spell that
  // way (a WebM recording reported as video/webm, an Opus one as audio/opus): the
  // name decides, and the server checks the bytes either way.
  if (
    raw === '' ||
    raw === 'application/octet-stream' ||
    raw.startsWith('audio/') ||
    raw.startsWith('video/')
  ) {
    return RECORDING_EXTENSIONS[extensionOf(file.name)] ?? null;
  }
  return null;
}

/** "340 KB", "6.2 MB", "62 MB". */
export function fileSizeWords(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}

/** Why a picked file cannot go up, in words for the person who picked it, or `null` when it can. */
export function recordingFileProblem(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!(file.size > 0)) return 'That file is empty.';
  if (recordingType(file) === null) {
    return 'That is not a recording we can take. Use an MP3, M4A, AAC, WAV, OGG, WebM or Opus file.';
  }
  if (file.size > LEAD_RECORDING_MAX_BYTES) {
    return `That recording is ${fileSizeWords(file.size)}. The most we can take is ${fileSizeWords(LEAD_RECORDING_MAX_BYTES)}, about an hour of a phone call.`;
  }
  return null;
}

/**
 * The file's name as the server takes it: whole, or cut to the longest it
 * allows with the extension kept, so a long name does not fail the upload.
 */
export function recordingFilename(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (!n) return 'Call recording';
  if (n.length <= RECORDING_FILENAME_MAX) return n;
  const dot = n.lastIndexOf('.');
  const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : '';
  return `${n.slice(0, RECORDING_FILENAME_MAX - ext.length)}${ext}`;
}

/** What `POST …/recordings/presign` takes. */
export function recordingPresignBody(
  file: { name: string; size: number },
  contentType: string,
): { filename: string; contentType: string; size: number } {
  return { filename: recordingFilename(file.name), contentType, size: file.size };
}

/**
 * What `POST …/recordings` takes once the file is up. The length goes only when
 * the browser measured one the server will accept: it is a nicety on the row,
 * never a reason for the upload to fail.
 */
export function recordingAddBody(
  key: string,
  file: { name: string; size: number },
  contentType: string,
  durationSec: number | null,
): { key: string; filename: string; contentType: string; size: number; durationSec?: number } {
  const seconds = durationSec === null ? null : Math.round(durationSec);
  return {
    key,
    ...recordingPresignBody(file, contentType),
    ...(seconds !== null && seconds > 0 && seconds <= RECORDING_DURATION_MAX_SEC
      ? { durationSec: seconds }
      : {}),
  };
}

/** The line under the "Add call recording" button while a file goes up. */
export function uploadLine(stage: 'sending' | 'saving', percent: number): string {
  if (stage === 'saving') return 'Saving the recording…';
  return `Sending the recording… ${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

/** "6:32", or "1:02:05" past the hour. `null` when the length is not known. */
export function callLength(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || !(seconds > 0)) {
    return null;
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** "25 Oct, 14:20 · 6:32 · by Pawan": when it went up, how long the call ran, and who put it there. */
export function recordingHeader(
  r: Pick<LeadRecording, 'uploadedAt' | 'durationSec' | 'uploadedByName'>,
  now: number,
): string {
  const by = r.uploadedByName?.trim();
  const line = [istStamp(r.uploadedAt, now), callLength(r.durationSec), by ? `by ${by}` : null]
    .filter(Boolean)
    .join(' · ');
  return line || 'Call recording';
}

/** Whether any recording is still being listened to: the drawer asks again every few seconds while so. */
export function hasProcessing(
  recordings: readonly Pick<LeadRecording, 'status'>[] | null | undefined,
): boolean {
  return (recordings ?? []).some((r) => r.status === 'processing');
}

/**
 * One sentence for why a recording has no summary. The audio still plays in
 * every case, so none of them says it was lost.
 */
export const RECORDING_FAILURE_WORDS: Record<LeadRecordingFailure, string> = {
  unsupported: 'This file is not audio we can read, so there is no summary.',
  too_big: `This recording is over ${fileSizeWords(LEAD_RECORDING_MAX_BYTES)}, so nobody listened to it.`,
  no_speech: 'Nobody could be heard talking in this recording, so there is no summary.',
  transcribe_failed: 'We could not write the call down this time.',
  summary_failed: 'We wrote the call down but could not sum it up this time.',
  interrupted: 'The listening was cut off part way through.',
};

/** A failure this screen has no sentence for (a newer server) still says something true. */
export function recordingFailureWords(failure: LeadRecordingFailure | null): string {
  return (
    (failure && RECORDING_FAILURE_WORDS[failure]) ||
    'We could not listen to this call, so there is no summary.'
  );
}

/**
 * Whether "Try again" can change the outcome. A file that is not audio, or is
 * too big, comes out the same every time; the rest were the services' bad day.
 */
export function retryHelps(failure: LeadRecordingFailure | null): boolean {
  return failure !== 'unsupported' && failure !== 'too_big';
}

/** How long a recording may say "listening" before the server lets a person start it again. */
export const RECORDING_STUCK_MS = 15 * 60 * 1000;

/**
 * Whether to offer "Try again": a failure that trying again can fix, or a call
 * still "listening" a quarter of an hour after it went up — the server takes a
 * retry from then on, and nobody should have to wait for a restart.
 */
export function canRetryRecording(
  r: { status: LeadRecordingStatus; failure: LeadRecordingFailure | null; uploadedAt: string },
  now: number,
): boolean {
  if (r.status === 'failed') return retryHelps(r.failure);
  if (r.status === 'processing') return now - Date.parse(r.uploadedAt) >= RECORDING_STUCK_MS;
  return false;
}

/** The bullets a summary shows under one heading: tidy, none empty, at most three. */
export function shortList(items: readonly string[] | null | undefined): string[] {
  return (items ?? [])
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, SUMMARY_BULLETS_MAX);
}

/** What "Log this call" opens the Log contact form holding. */
export interface ContactPrefill {
  channel: LeadContactChannel;
  /** A `LeadContactOutcome`, or empty when the call did not say. */
  outcome: string;
  note: string;
}

/**
 * The Log contact form for a call that has a summary: how (a call), what came
 * of it (the outcome the summary suggests, when it is one the form knows) and
 * the note (the gist). The person reads it and presses Save; nothing is saved
 * from here.
 */
export function logCallPrefill(
  summary: Pick<LeadCallSummary, 'gist' | 'suggestedOutcome'>,
): ContactPrefill {
  const gist = summary.gist.replace(/\s+/g, ' ').trim();
  const outcome = summary.suggestedOutcome;
  return {
    channel: 'call',
    outcome:
      outcome && (LEAD_CONTACT_OUTCOMES as readonly string[]).includes(outcome) ? outcome : '',
    note: gist.length > NOTE_MAX ? `${gist.slice(0, NOTE_MAX - 1).trimEnd()}…` : gist,
  };
}

/** The list's "Last call" line: the words, and the badge for how keen they sounded. */
export interface LastCallLine {
  /** "Last call: Wants the price list." The list clamps it to two lines. */
  text: string;
  label: string;
  tone: Intent;
}

/** `null` when the lead has no analysed call, or its gist is only blank space. */
export function lastCallLine(call: LeadLastCall | null | undefined): LastCallLine | null {
  if (!call) return null;
  const gist = call.gist.replace(/\s+/g, ' ').trim();
  if (!gist) return null;
  return {
    text: `Last call: ${gist}`,
    label: interestLabel(call.interest),
    tone: interestTone(call.interest),
  };
}
