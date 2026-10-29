/**
 * Checks for the Leads page's rules (`src/lib/leads.ts`): the words, the
 * working window (the whole day, since 25 Oct 2026), the follow-up the contact form suggests, the call-recording
 * rules (which file may be picked, what a failure says, how a summary is cut
 * down), the drawer's own rules (the "do this now" colour, who did each thing on
 * the timeline, the days it is cut into), and that every body a form builds is
 * one the shared schema accepts.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:leads
 *
 * which is `npx tsx --test scripts/leads.check.ts`. The schemas and types are
 * imported from source by relative path, as `onboardingCalls.check.ts` does,
 * because `@dk/shared` resolves to its compiled `dist/` outside Vite.
 *
 * Times are written as India time (`ist(...)`), because that is the clock the
 * team works to and the one the window is defined in. 2026-10-22 is a Thursday.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LEAD_FOLLOW_UP_MAX_DAYS,
  LEAD_NAME_MAX,
  LEAD_NOTE_MAX,
  addLeadPhoneSchema,
  addLeadRecordingSchema,
  assignLeadSchema,
  closeLeadSchema,
  createLeadSchema,
  leadFromWhatsAppSchema,
  leadNoteSchema,
  logLeadContactSchema,
  presignLeadRecordingSchema,
  reopenLeadSchema,
  setLeadFollowUpSchema,
} from '../shared/src/schemas/lead';
import {
  LEAD_ADMIN_CLOSE_REASONS,
  LEAD_CALL_INTEREST,
  LEAD_CALL_INTEREST_LABELS,
  LEAD_CLOSING_OUTCOMES,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_CONTACT_OUTCOME_LABELS,
  LEAD_DUE_REASONS,
  LEAD_INVITE_DELIVERIES,
  LEAD_INVITE_FAILURES,
  LEAD_ORIGINS,
  LEAD_RECORDING_FAILURES,
  LEAD_RECORDING_MAX_BYTES,
  LEAD_RECORDING_STATUSES,
  LEAD_RECORDING_TYPES,
  LEAD_SIGN_KINDS,
  LEAD_SIGN_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_TIMELINE_ACTORS,
  LEAD_TIMELINE_KINDS,
  LEAD_VIEWS,
  type LeadCallInterest,
  type LeadContactOutcome,
  type LeadInvite,
  type LeadNote,
  type LeadRecordingFailure,
  type LeadRow,
  type LeadSignKind,
  type LeadSigns,
  type LeadTimelineItem,
  type LeadVisit,
  type LeadWatch,
} from '../shared/src/types/lead';
import {
  CLOSE_HINTS,
  CLOSING_OUTCOMES,
  DUE_REASON_LABELS,
  FOLLOW_UP_MAX_DAYS,
  NAME_MAX,
  LEAD_VIEW_LABELS,
  NOTE_MAX,
  OPEN_OUTCOMES,
  OUTCOME_HINTS,
  RECORDING_ACCEPT,
  RECORDING_DURATION_MAX_SEC,
  RECORDING_FAILURE_WORDS,
  RECORDING_FILENAME_MAX,
  STATUS_TONE,
  SUMMARY_BULLETS_MAX,
  WINDOW_WORDS,
  actorPrefix,
  addWorkingHours,
  agoWords,
  assignBody,
  canReopen,
  chatHref,
  callLength,
  clockOf,
  clockWords,
  closeBody,
  closeProblem,
  addedAsLeadText,
  canAddChatAsLead,
  dueReasonWords,
  closedLine,
  closesLead,
  contactBody,
  contactProblem,
  dayHeading,
  dayWords,
  devicesNote,
  doNowDetail,
  doNowTone,
  drawerSubtitle,
  dueLine,
  durationWords,
  fillOf,
  firstRows,
  foldLine,
  followUpBody,
  followUpGuide,
  followUpProblem,
  fileSizeWords,
  funnelSteps,
  hasProcessing,
  idFromParam,
  inTalksCount,
  inWindow,
  interestLabel,
  interestTone,
  inviteLine,
  isClosed,
  isWaitingForUs,
  lastCallLine,
  lastContactLine,
  lastWatchedLine,
  leadHref,
  leadName,
  logCallPrefill,
  lookupLine,
  mobileTen,
  moveIntoWindow,
  newestReachOut,
  nextFollowUpLine,
  nextWindowStart,
  noteBody,
  noteByLine,
  noteLine,
  noteProblem,
  originText,
  resultLeadAction,
  ownerLine,
  parseWhen,
  addLeadBody,
  addLeadProblems,
  phoneBody,
  phoneProblem,
  quickPicks,
  reachOutLine,
  recordingAddBody,
  recordingFailureWords,
  recordingFileProblem,
  recordingFilename,
  recordingHeader,
  recordingPresignBody,
  recordingType,
  registrationWords,
  reminderLine,
  reopenBody,
  reopenProblem,
  retryHelps,
  canRetryRecording,
  RECORDING_STUCK_MS,
  shortList,
  signLine,
  sinceLine,
  statusLabel,
  storyRows,
  suggestNextAt,
  teamName,
  theyDid,
  timelineActor,
  triesLine,
  unansweredAfter,
  uploadLine,
  viewFromParam,
  viewLabel,
  visitMeta,
  visitOf,
  visitPercent,
  visitsLine,
  watchFill,
  watchLine,
  watchPercent,
  whenInput,
  whenWords,
} from '../src/lib/leads';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A moment in India time. */
function ist(y: number, mo: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi) - 330 * MIN;
}

// 2026-10-22 Thu · 23 Fri · 24 Sat · 25 Sun · 26 Mon · 27 Tue
const THU = (h: number, m = 0) => ist(2026, 10, 22, h, m);
const FRI = (h: number, m = 0) => ist(2026, 10, 23, h, m);
const SAT = (h: number, m = 0) => ist(2026, 10, 24, h, m);
const SUN = (h: number, m = 0) => ist(2026, 10, 25, h, m);
const MON = (h: number, m = 0) => ist(2026, 10, 26, h, m);
const TUE = (h: number, m = 0) => ist(2026, 10, 27, h, m);
const WED = (h: number, m = 0) => ist(2026, 10, 28, h, m);

const OBJECT_ID = '507f1f77bcf86cd799439011';

/** How many rows the days hold in all. */
const rowCount = (days: readonly { rows: readonly unknown[] }[]): number =>
  days.reduce((n, d) => n + d.rows.length, 0);

describe('the words cover every value the server can send', () => {
  it('every status has a label and a colour', () => {
    for (const s of LEAD_STATUSES) {
      assert.ok(statusLabel(s).length > 0, s);
      assert.ok(STATUS_TONE[s], s);
    }
  });

  it('every tab has a label, and the counted ones show their number', () => {
    for (const v of LEAD_VIEWS) assert.ok(LEAD_VIEW_LABELS[v].length > 0, v);
    const counts = { todo: 12, open: 30, mine: 4, closed: 9, viewers: 1200, new: 3, overdue: 5, cold: 2 };
    assert.equal(viewLabel('todo', counts), 'To do (12)');
    assert.equal(viewLabel('open', counts), 'All open (30)');
    assert.equal(viewLabel('mine', counts), 'Mine (4)');
    assert.equal(viewLabel('viewers', counts), 'Unknown viewers (1,200)');
    // Closed has no number on its tab, and no counts yet means no numbers.
    assert.equal(viewLabel('closed', counts), 'Closed');
    assert.equal(viewLabel('todo', undefined), 'To do');
  });

  it('every reason a follow-up is due, every outcome and every close reason has its words', () => {
    for (const r of LEAD_DUE_REASONS) assert.ok(DUE_REASON_LABELS[r].length > 0, r);
    for (const o of LEAD_CONTACT_OUTCOMES) {
      assert.ok(OUTCOME_HINTS[o].length > 0, o);
      assert.ok(LEAD_CONTACT_OUTCOME_LABELS[o].length > 0, o);
    }
    for (const r of LEAD_ADMIN_CLOSE_REASONS) assert.ok(CLOSE_HINTS[r].length > 0, r);
    for (const c of LEAD_CONTACT_CHANNELS) assert.ok(LEAD_CONTACT_CHANNEL_LABELS[c].length > 0, c);
    for (const k of LEAD_SIGN_KINDS) assert.ok(LEAD_SIGN_LABELS[k].length > 0, k);
  });

  it('every origin reads as a line', () => {
    for (const origin of LEAD_ORIGINS) assert.ok(originText({ origin, linkLabel: null }).length > 0, origin);
  });

  it('the outcomes split into those that keep the chase going and those that end it', () => {
    assert.deepEqual([...CLOSING_OUTCOMES], [...LEAD_CLOSING_OUTCOMES]);
    assert.equal(OPEN_OUTCOMES.length + CLOSING_OUTCOMES.length, LEAD_CONTACT_OUTCOMES.length);
    for (const o of OPEN_OUTCOMES) assert.equal(closesLead(o), false, o);
    for (const o of CLOSING_OUTCOMES) assert.equal(closesLead(o), true, o);
  });

  it('closed and reopenable statuses', () => {
    assert.equal(isClosed('client'), true);
    assert.equal(isClosed('asked_to_stop'), true);
    assert.equal(isClosed('registered'), false);
    assert.equal(isClosed('new'), false);
    // A client is never opened again by hand; the others may be.
    assert.equal(canReopen('client'), false);
    for (const s of ['not_interested', 'asked_to_stop', 'wrong_number', 'not_a_lead'] as const) {
      assert.equal(canReopen(s), true, s);
    }
    assert.equal(canReopen('interested'), false);
  });

  it('registration states say what happened', () => {
    for (const s of ['NEW', 'CONTACTED', 'APPROVED', 'LOST'] as const) {
      assert.ok(registrationWords(s).length > 0, s);
    }
  });
});

describe('the limits the forms mirror', () => {
  it('are the schemas', () => {
    assert.equal(NOTE_MAX, LEAD_NOTE_MAX);
    assert.equal(FOLLOW_UP_MAX_DAYS, LEAD_FOLLOW_UP_MAX_DAYS);
    assert.equal(NAME_MAX, LEAD_NAME_MAX);
  });
});

describe('the working window: the whole day, India time, every day and night', () => {
  // Until 25 Oct 2026 the window ran 09:00 to 20:00. The owner wants follow-ups and
  // alerts "at any hour, day or night", so it now never closes. These checks pin that
  // down edge by edge, so that a narrower window cannot come back unnoticed.
  it('is open at every hour, 00:00 and 03:00 included', () => {
    assert.equal(inWindow(MON(0, 0)), true);
    assert.equal(inWindow(MON(3, 0)), true);
    assert.equal(inWindow(MON(8, 59)), true);
    assert.equal(inWindow(MON(9, 0)), true);
    assert.equal(inWindow(MON(19, 59)), true);
    // 20:00 used to be the first closed minute.
    assert.equal(inWindow(MON(20, 0)), true);
    assert.equal(inWindow(MON(23, 59)), true);
    // The last millisecond of the day, and the first one of the next.
    assert.equal(inWindow(TUE(0, 0) - 1), true);
    assert.equal(inWindow(TUE(0, 0)), true);
  });

  it('is open on a Saturday and on a Sunday, night included', () => {
    assert.equal(inWindow(SAT(3, 0)), true);
    assert.equal(inWindow(SAT(9, 0)), true);
    assert.equal(inWindow(SAT(19, 59)), true);
    assert.equal(inWindow(SUN(9, 0)), true);
    assert.equal(inWindow(SUN(12, 0)), true);
    assert.equal(inWindow(SUN(20, 0)), true);
    assert.equal(inWindow(SUN(23, 59)), true);
  });

  it('is open at every minute of a fortnight', () => {
    // Every 37 minutes, so every hour of the day and every weekday is tried.
    for (let t = THU(0, 0); t < THU(0, 0) + 14 * DAY; t += 37 * MIN) {
      assert.equal(inWindow(t), true, new Date(t).toISOString());
    }
  });

  it('turns the day at India midnight, not at UTC midnight', () => {
    // 04:00 UTC is 09:30 in India and 15:00 UTC is 20:30: both used to differ, both are open now.
    assert.equal(inWindow(Date.UTC(2026, 9, 26, 4, 0)), true);
    assert.equal(inWindow(Date.UTC(2026, 9, 26, 15, 0)), true);
    // 17:00 UTC on Monday is 22:30 that night in India: the next day starts at 18:30 UTC.
    assert.equal(nextWindowStart(Date.UTC(2026, 9, 26, 17, 0)), Date.UTC(2026, 9, 26, 18, 30));
    assert.equal(nextWindowStart(Date.UTC(2026, 9, 26, 18, 30)), Date.UTC(2026, 9, 27, 18, 30));
  });

  it('the next start is the next India midnight, strictly after the moment asked about', () => {
    // With no closed hours the window "opens" once a day, at midnight. Nothing moves a time
    // to it any more; it only marks where one day ends and the next begins.
    assert.equal(nextWindowStart(MON(0, 0)), TUE(0, 0));
    assert.equal(nextWindowStart(MON(0, 1)), TUE(0, 0));
    assert.equal(nextWindowStart(MON(8, 0)), TUE(0, 0));
    assert.equal(nextWindowStart(MON(9, 0)), TUE(0, 0));
    assert.equal(nextWindowStart(MON(20, 0)), TUE(0, 0));
    assert.equal(nextWindowStart(MON(23, 59)), TUE(0, 0));
    assert.equal(nextWindowStart(SAT(12, 0)), SUN(0, 0));
    assert.equal(nextWindowStart(SUN(3, 0)), MON(0, 0));
    assert.equal(nextWindowStart(SUN(23, 0)), MON(0, 0));
  });

  it('never moves a time: not at night, not at the old closing time, not on a Sunday', () => {
    assert.equal(moveIntoWindow(MON(12, 30)), MON(12, 30));
    assert.equal(moveIntoWindow(MON(0, 0)), MON(0, 0));
    // These used to move to 09:00 the next morning (or the same morning).
    assert.equal(moveIntoWindow(MON(20, 0)), MON(20, 0));
    assert.equal(moveIntoWindow(MON(5, 0)), MON(5, 0));
    assert.equal(moveIntoWindow(SAT(21, 0)), SAT(21, 0));
    assert.equal(moveIntoWindow(MON(23, 59)), MON(23, 59));
    assert.equal(moveIntoWindow(SUN(10, 0)), SUN(10, 0));
    for (let t = THU(0, 0); t < THU(0, 0) + 14 * DAY; t += 37 * MIN) {
      assert.equal(moveIntoWindow(t), t, new Date(t).toISOString());
    }
  });

  it('counts hours straight through the night, Sunday included', () => {
    assert.equal(addWorkingHours(FRI(10, 15), 4), FRI(14, 15));
    // Friday 18:30 used to run out of window at 20:00 and finish on Saturday 11:30.
    assert.equal(addWorkingHours(FRI(18, 30), 4), FRI(22, 30));
    // Saturday 19:00 used to finish on Sunday 12:00.
    assert.equal(addWorkingHours(SAT(19, 0), 4), SAT(23, 0));
    // 22:00 plus 4 h crosses midnight, and nothing waits for the morning.
    assert.equal(addWorkingHours(SAT(22, 0), 4), SUN(2, 0));
    // Thursday 20:41 used to wait for Friday 09:00 and finish at 11:00.
    assert.equal(addWorkingHours(THU(20, 41), 2), THU(22, 41));
    assert.equal(addWorkingHours(THU(23, 0), 2), FRI(1, 0));
    // Counting starts at once, also at 03:00.
    assert.equal(addWorkingHours(SUN(3, 0), 2), SUN(5, 0));
    assert.equal(addWorkingHours(SAT(0, 0), 4), SAT(4, 0));
    assert.equal(addWorkingHours(SUN(10, 0), 0), SUN(10, 0));
  });

  it('is exactly the moment plus the hours, whatever the hour it starts', () => {
    for (let t = THU(0, 0); t < THU(0, 0) + 14 * DAY; t += 37 * MIN) {
      for (const h of [0, 0.5, 2, 4, 24, 49]) {
        assert.equal(addWorkingHours(t, h), t + h * HOUR, `${h} h from ${new Date(t).toISOString()}`);
      }
    }
  });

  it('ending exactly at midnight stays at that midnight', () => {
    // Friday 20:00 used to be the end of the window and moved to Saturday 09:00.
    assert.equal(addWorkingHours(FRI(18, 0), 2), FRI(20, 0));
    assert.equal(moveIntoWindow(addWorkingHours(FRI(18, 0), 2)), FRI(20, 0));
    assert.equal(addWorkingHours(FRI(22, 0), 2), SAT(0, 0));
    assert.equal(moveIntoWindow(addWorkingHours(FRI(22, 0), 2)), SAT(0, 0));
  });

  it('says it in words as "at any hour, day or night"', () => {
    assert.equal(WINDOW_WORDS, 'at any hour, day or night');
  });
});

describe('the follow-up the contact form suggests (docs/specs/leads.md §3, rule 5)', () => {
  const now = MON(10, 0);

  it('after an interested call: the next day', () => {
    assert.equal(suggestNextAt('interested', 0, now), TUE(10, 0));
  });

  it('after a thinking call: two days', () => {
    assert.equal(suggestNextAt('thinking', 0, now), WED(10, 0));
  });

  it('after no answer: 4 hours, then 24 h, 48 h, 72 h, a week', () => {
    assert.equal(suggestNextAt('no_answer', 1, now), MON(14, 0));
    // The 4 hours run through the evening and the night: they used to stop at 20:00 and wait for 09:00.
    assert.equal(suggestNextAt('no_answer', 1, MON(18, 30)), MON(22, 30));
    assert.equal(suggestNextAt('no_answer', 1, MON(22, 0)), TUE(2, 0));
    assert.equal(suggestNextAt('no_answer', 1, MON(3, 0)), MON(7, 0));
    assert.equal(suggestNextAt('no_answer', 2, now), TUE(10, 0));
    assert.equal(suggestNextAt('no_answer', 3, now), WED(10, 0));
    for (const n of [4, 5, 6]) assert.equal(suggestNextAt('no_answer', n, now), ist(2026, 10, 29, 10, 0), `unanswered ${n}`);
    for (const n of [7, 8, 30]) assert.equal(suggestNextAt('no_answer', n, now), ist(2026, 11, 2, 10, 0), `unanswered ${n}`);
  });

  it('after a message: 24 h twice, then 48 h, 72 h, a week', () => {
    assert.equal(suggestNextAt('message_sent', 1, now), TUE(10, 0));
    assert.equal(suggestNextAt('message_sent', 2, now), TUE(10, 0));
    assert.equal(suggestNextAt('message_sent', 3, now), WED(10, 0));
    for (const n of [4, 5, 6]) assert.equal(suggestNextAt('message_sent', n, now), ist(2026, 10, 29, 10, 0), `unanswered ${n}`);
    for (const n of [7, 9]) assert.equal(suggestNextAt('message_sent', n, now), ist(2026, 11, 2, 10, 0), `unanswered ${n}`);
  });

  it('after an outcome that closes the lead there is no follow-up', () => {
    for (const o of LEAD_CLOSING_OUTCOMES) assert.equal(suggestNextAt(o, 1, now), null, o);
  });

  it('is always later than now and exactly the table\'s hours after it, at any hour', () => {
    // How long after the moment each outcome waits, in hours, by tries in a row. Plain clock
    // time: there is no window left to move a follow-up into.
    const hoursAfter = (o: LeadContactOutcome, n: number): number => {
      if (o === 'interested') return 24;
      if (o === 'thinking') return 48;
      const steps = o === 'no_answer' ? [4, 24, 48, 72, 72, 72] : [24, 24, 48, 72, 72, 72];
      return steps[n - 1] ?? 7 * 24;
    };
    // Every 37 minutes for two weeks, so every hour of the day and every weekday is tried.
    for (let t = THU(0, 0); t < THU(0, 0) + 14 * DAY; t += 37 * MIN) {
      for (const o of LEAD_CONTACT_OUTCOMES) {
        for (const n of [1, 2, 3, 5, 8]) {
          const at = suggestNextAt(o as LeadContactOutcome, n, t);
          if (at === null) continue;
          assert.ok(inWindow(at), `${o} ${n} from ${new Date(t).toISOString()}`);
          assert.ok(at > t, `${o} ${n} from ${new Date(t).toISOString()}`);
          assert.equal(at, t + hoursAfter(o as LeadContactOutcome, n) * HOUR, `${o} ${n} from ${new Date(t).toISOString()}`);
        }
      }
    }
  });

  it('keeps a 24 h follow-up as it falls, on a Sunday and at night', () => {
    assert.equal(suggestNextAt('interested', 0, SAT(15, 0)), SUN(15, 0));
    // Saturday 21:00 used to be moved to Monday 09:00; it now stays at Sunday 21:00.
    assert.equal(suggestNextAt('message_sent', 1, SAT(21, 0)), SUN(21, 0));
    assert.equal(suggestNextAt('interested', 0, SAT(3, 0)), SUN(3, 0));
    assert.equal(suggestNextAt('thinking', 0, FRI(23, 30)), SUN(23, 30));
  });

  it('follows the worked example from the spec', () => {
    // Aryan calls Friday 10:15, no answer: due Friday 14:15.
    assert.equal(suggestNextAt('no_answer', 1, FRI(10, 15)), FRI(14, 15));
    // Calls 14:30, no answer again (2 in a row): due Saturday 14:30.
    assert.equal(suggestNextAt('no_answer', 2, FRI(14, 30)), SAT(14, 30));
    // Monday 09:20: spoke, thinking: due Wednesday 09:20.
    assert.equal(suggestNextAt('thinking', 0, MON(9, 20)), WED(9, 20));
    // Round the clock, the first 4 hours no longer wait for the morning. Friday 18:30, no
    // answer: due Friday 22:30 (it used to be Saturday 11:30). Friday 22:00: due Saturday
    // 02:00 (it used to be Saturday 13:00).
    assert.equal(suggestNextAt('no_answer', 1, FRI(18, 30)), FRI(22, 30));
    assert.equal(suggestNextAt('no_answer', 1, FRI(22, 0)), SAT(2, 0));
  });
});

describe('how many tries in a row have gone unanswered', () => {
  const noAnswer = (at: number) => ({
    at: new Date(at).toISOString(),
    byName: 'Aryan',
    channel: 'call' as const,
    outcome: 'no_answer' as const,
  });

  it('adds this try to the ones before it', () => {
    assert.equal(unansweredAfter({ unanswered: 0, lastContact: null }, 'no_answer', MON(10, 0)), 1);
    assert.equal(
      unansweredAfter({ unanswered: 2, lastContact: noAnswer(MON(8, 0)) }, 'no_answer', MON(10, 0)),
      3,
    );
    assert.equal(unansweredAfter({ unanswered: 0, lastContact: null }, 'message_sent', MON(10, 0)), 1);
  });

  it('counts a second try within half an hour as the same attempt', () => {
    assert.equal(
      unansweredAfter({ unanswered: 2, lastContact: noAnswer(MON(9, 45)) }, 'no_answer', MON(10, 0)),
      2,
    );
    assert.equal(
      unansweredAfter({ unanswered: 2, lastContact: noAnswer(MON(9, 30)) }, 'no_answer', MON(10, 0)),
      3,
    );
  });

  it('is zero for an outcome that is not a try', () => {
    for (const o of ['interested', 'thinking', 'not_interested', 'asked_to_stop', 'wrong_number'] as const) {
      assert.equal(unansweredAfter({ unanswered: 4, lastContact: null }, o, MON(10, 0)), 0, o);
    }
  });
});

describe('the lines on a lead row', () => {
  const lead = (over: Partial<{ status: 'new' | 'trying' | 'talking' | 'registered' | 'client'; nextDueAt: string | null }> = {}) => ({
    status: 'trying' as const,
    nextDueAt: null as string | null,
    ...over,
  });
  const iso = (ms: number) => new Date(ms).toISOString();

  it('says how late a follow-up is, in red words', () => {
    const now = FRI(15, 0);
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(10, 0)) }), now), { text: 'Overdue 5 h', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(14, 20)) }), now), { text: 'Overdue 40 min', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(THU(15, 0)) }), now), { text: 'Overdue 1 day', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(THU(15, 0) - 2 * DAY) }), now), { text: 'Overdue 3 days', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(15, 0)) }), now), { text: 'Due now', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(15, 0) - 30_000) }), now), { text: 'Due now', tone: 'danger' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(14, 59)) }), now), { text: 'Overdue 1 min', tone: 'danger' });
  });

  it('is amber inside two hours, plain after that', () => {
    const now = FRI(15, 0);
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(15, 40)) }), now), { text: 'Due in 40 min', tone: 'warning' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(17, 0)) }), now), { text: 'Due in 2 h', tone: 'warning' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(FRI(17, 1)) }), now), { text: 'Today 17:01', tone: 'neutral' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(SAT(11, 0)) }), now), { text: 'Tomorrow 11:00', tone: 'neutral' });
    assert.deepEqual(dueLine(lead({ nextDueAt: iso(TUE(11, 0)) }), now), { text: 'Tue 11:00', tone: 'neutral' });
  });

  it('prints no due line for a closed lead or one waiting on Onboarding, and says so when a chased one has none', () => {
    const now = FRI(15, 0);
    assert.equal(dueLine(lead({ status: 'client', nextDueAt: iso(FRI(10, 0)) }), now), null);
    assert.equal(dueLine(lead({ status: 'registered', nextDueAt: null }), now), null);
    // Once Onboarding has contacted them the lead's own clock chases a registration.
    assert.deepEqual(dueLine(lead({ status: 'registered', nextDueAt: iso(FRI(10, 0)) }), now), {
      text: 'Overdue 5 h',
      tone: 'danger',
    });
    assert.deepEqual(dueLine(lead({ status: 'new', nextDueAt: null }), now), { text: 'No follow-up set', tone: 'neutral' });
  });

  it('says when a later moment is, the way a person says it', () => {
    const now = FRI(15, 0);
    assert.equal(whenWords(FRI(17, 30), now), 'Today 17:30');
    assert.equal(whenWords(SAT(11, 0), now), 'Tomorrow 11:00');
    assert.equal(whenWords(SAT(11, 0), now, true), 'tomorrow 11:00');
    assert.equal(whenWords(TUE(11, 0), now), 'Tue 11:00');
    assert.equal(whenWords(TUE(11, 0), now, true), 'Tue 11:00');
    // Six days out is still a weekday; a week out is a date.
    assert.equal(whenWords(ist(2026, 10, 29, 9, 5), now), 'Thu 09:05');
    assert.equal(whenWords(ist(2026, 10, 30, 9, 5), now), '30 Oct 09:05');
    assert.equal(whenWords(ist(2026, 11, 3, 14, 0), now), '3 Nov 14:00');
    // After midnight in India is the next day even while it is still the evening in UTC.
    assert.equal(whenWords(SAT(0, 30), FRI(23, 0)), 'Tomorrow 00:30');
  });

  it('keeps durations and ages short', () => {
    assert.equal(durationWords(0), '1 min');
    assert.equal(durationWords(59 * MIN), '59 min');
    assert.equal(durationWords(60 * MIN), '1 h');
    assert.equal(durationWords(23 * HOUR + 59 * MIN), '23 h');
    assert.equal(durationWords(24 * HOUR), '1 day');
    assert.equal(durationWords(49 * HOUR), '2 days');
    assert.equal(agoWords(new Date(FRI(15, 0) - 30_000).toISOString(), FRI(15, 0)), 'just now');
    assert.equal(agoWords(new Date(FRI(14, 40)).toISOString(), FRI(15, 0)), '20 min ago');
    assert.equal(agoWords(new Date(FRI(13, 0)).toISOString(), FRI(15, 0)), '2 h ago');
    assert.equal(agoWords('not a time', FRI(15, 0)), '');
    assert.equal(agoWords(null, FRI(15, 0)), '');
  });

  it('says who last did what', () => {
    const now = FRI(15, 0);
    const c = (over: object) => ({
      at: iso(FRI(13, 0)),
      byName: 'Aryan' as string | null,
      channel: 'call' as const,
      outcome: 'no_answer' as const,
      ...over,
    });
    assert.equal(lastContactLine(c({}), now), 'Called by Aryan · 2 h ago · no answer');
    assert.equal(lastContactLine(c({ outcome: 'interested' }), now), 'Called by Aryan · 2 h ago · spoke, interested');
    assert.equal(lastContactLine(c({ channel: 'whatsapp', outcome: 'message_sent' }), now), 'Messaged by Aryan · 2 h ago');
    assert.equal(lastContactLine(c({ byName: null, channel: 'visit', outcome: 'thinking' }), now), 'Met · 2 h ago · spoke, thinking it over');
    assert.equal(lastContactLine(null, now), null);
  });

  it('only calls a sign news while it is newer than our last contact', () => {
    const now = FRI(15, 0);
    const sign = { at: iso(FRI(14, 40)), kind: 'call_me' as const };
    assert.equal(signLine(sign, null, now), 'Tapped "Call me" · 20 min ago');
    const before = { at: iso(FRI(14, 0)), byName: null, channel: 'call' as const, outcome: 'no_answer' as const };
    assert.equal(signLine(sign, before, now), 'Tapped "Call me" · 20 min ago');
    const after = { ...before, at: iso(FRI(14, 50)) };
    assert.equal(signLine(sign, after, now), null);
    assert.equal(signLine(null, null, now), null);
  });

  it('names a lead by its name, else its number, else its reference', () => {
    assert.equal(leadName({ name: 'Modak Automobiles', phone: '9876543210', ref: 'L-0007' }), 'Modak Automobiles');
    assert.equal(leadName({ name: '  ', phone: '9876543210', ref: 'L-0007' }), '+91 98765 43210');
    assert.equal(leadName({ name: null, phone: null, ref: 'L-0007' }), 'L-0007');
  });

  it('says where a lead came from, owner and close in a few words', () => {
    assert.equal(originText({ origin: 'share_link', linkLabel: 'Ramesh ji' }), 'Share link “Ramesh ji”');
    assert.equal(originText({ origin: 'share_link', linkLabel: null }), 'Share link');
    assert.equal(originText({ origin: 'campaign', linkLabel: null }), 'WhatsApp campaign');
    assert.equal(originText({ origin: 'whatsapp_reply', linkLabel: null }), 'Wrote to us on WhatsApp');
    assert.equal(ownerLine({ id: 'u1', name: 'Aryan' }), 'Owner: Aryan');
    assert.equal(ownerLine(null), 'Nobody owns it yet');
    assert.equal(
      closedLine({ closedAt: iso(FRI(14, 5)), closedByName: 'Aryan' }, FRI(15, 0)),
      'Closed by Aryan · 23 Oct, 14:05',
    );
    assert.equal(
      closedLine({ closedAt: iso(FRI(14, 5)), closedByName: 'Automatic' }, FRI(15, 0)),
      'Closed automatically · 23 Oct, 14:05',
    );
    assert.equal(closedLine({ closedAt: null, closedByName: null }, FRI(15, 0)), 'Closed automatically');
  });

  it('prints the WhatsApp inbox line', () => {
    const now = FRI(15, 0);
    const l = (over: object) => ({
      id: 'x',
      ref: 'L-0007',
      status: 'interested' as const,
      nextDueAt: iso(SAT(11, 0)) as string | null,
      overdue: false,
      ownerName: null,
      ...over,
    });
    assert.equal(lookupLine(l({}), now), 'Lead L-0007 · Interested · Due tomorrow 11:00');
    assert.equal(lookupLine(l({ nextDueAt: iso(FRI(15, 40)) }), now), 'Lead L-0007 · Interested · Due in 40 min');
    assert.equal(lookupLine(l({ nextDueAt: iso(FRI(10, 0)) }), now), 'Lead L-0007 · Interested · Overdue 5 h');
    assert.equal(lookupLine(l({ nextDueAt: iso(TUE(11, 0)) }), now), 'Lead L-0007 · Interested · Due Tue 11:00');
    assert.equal(lookupLine(l({ status: 'not_interested', nextDueAt: null }), now), 'Lead L-0007 · Not interested');
    assert.equal(lookupLine(l({ status: 'registered', nextDueAt: null }), now), 'Lead L-0007 · Registered');
    assert.equal(lookupLine(l({ status: 'registered' }), now), 'Lead L-0007 · Registered · Due tomorrow 11:00');
  });
});

describe('what they watched', () => {
  const watch = (over: Partial<LeadWatch> = {}): LeadWatch => ({
    visits: 1,
    bestSeconds: 750,
    durationSeconds: 1589,
    completed: false,
    soundOn: true,
    devices: 1,
    firstAt: null,
    lastAt: null,
    city: null,
    ...over,
  });

  it('says how far they got and whether they could hear', () => {
    assert.equal(watchLine(watch({ visits: 2 })), 'Watched 12:30 of 26:29 · 2 visits · sound on');
    assert.equal(watchLine(watch({ soundOn: false })), 'Watched 12:30 of 26:29 · sound off');
    assert.equal(watchLine(watch({ completed: true, bestSeconds: 1585 })), 'Watched to the end · sound on');
    assert.equal(watchLine(watch({ durationSeconds: 0 })), 'Watched 12:30 · sound on');
    // The table prints the visit count on the next line, so its watch line leaves it out.
    assert.equal(watchLine(watch({ visits: 4 }), false), 'Watched 12:30 of 26:29 · sound on');
    assert.equal(watchLine(watch({ visits: 1 }), false), 'Watched 12:30 of 26:29 · sound on');
    // A call-back from the film page with no visit tied to them is not "watched 0:00".
    assert.equal(
      watchLine(watch({ visits: 0, bestSeconds: 0 }), true, 'film_callback'),
      'Was on the film page; no visit we can tie to them',
    );
    // Every other lead (since 29 Oct 2026 one wrote to us or was added by the team) has simply not watched.
    for (const origin of ['whatsapp_reply', 'campaign', 'manual', 'share_link'] as const) {
      assert.equal(watchLine(watch({ visits: 0, bestSeconds: 0 }), true, origin), 'Has not watched the film', origin);
    }
    assert.equal(watchLine(watch({ visits: 0, bestSeconds: 0 })), 'Has not watched the film');
    // Once they do watch, it reads like anybody else's.
    assert.equal(watchLine(watch(), true, 'manual'), 'Watched 12:30 of 26:29 · sound on');
    assert.equal(watchLine(watch(), true, 'whatsapp_reply'), 'Watched 12:30 of 26:29 · sound on');
  });

  it('draws the bar from the best visit, never past the ends', () => {
    assert.equal(watchPercent(watch()), 47);
    assert.equal(watchPercent(watch({ bestSeconds: 0 })), 0);
    assert.equal(watchPercent(watch({ bestSeconds: 5000 })), 100);
    assert.equal(watchPercent(watch({ completed: true, bestSeconds: 1500 })), 100);
    assert.equal(watchPercent(watch({ durationSeconds: 0 })), 0);
  });

  it('prints a clock the way a player does', () => {
    assert.equal(clockWords(0), '0:00');
    assert.equal(clockWords(7), '0:07');
    assert.equal(clockWords(754), '12:34');
    assert.equal(clockWords(3723), '1:02:03');
    assert.equal(clockWords(-5), '0:00');
  });

  it('notes more than one device, and only then', () => {
    assert.equal(devicesNote(1), null);
    assert.match(devicesNote(2) ?? '', /2 devices/);
  });
});

describe('what the table says about a lead', () => {
  const now = FRI(15, 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const watch = (over: Partial<LeadWatch> = {}): LeadWatch => ({
    visits: 4,
    bestSeconds: 750,
    durationSeconds: 1589,
    completed: false,
    soundOn: true,
    devices: 1,
    firstAt: iso(THU(10, 0)),
    lastAt: iso(FRI(13, 0)),
    city: null,
    ...over,
  });
  const noSigns = (): LeadSigns => ({
    replied: null,
    callMe: null,
    callback: null,
    assistant: null,
    registered: null,
  });
  const invite = (over: Partial<LeadInvite> = {}): LeadInvite => ({
    at: iso(THU(11, 0)),
    delivery: 'read',
    failure: null,
    ...over,
  });
  const row = (over: { invite?: LeadInvite | null; signs?: Partial<LeadSigns>; watch?: Partial<LeadWatch> } = {}) => ({
    invite: over.invite === undefined ? invite() : over.invite,
    signs: { ...noSigns(), ...over.signs },
    watch: watch(over.watch),
  });

  it('says the day in India time, and the year only when it is not this year', () => {
    assert.equal(dayWords(iso(THU(11, 0)), now), '22 Oct');
    // 00:30 in India on the 22nd is still the 21st in UTC: the day is the India one.
    assert.equal(dayWords(iso(THU(0, 30)), now), '22 Oct');
    assert.equal(dayWords(iso(THU(0, 0) - 1), now), '21 Oct');
    // 23:59 in India on 31 Dec, and the first minute of the year.
    assert.equal(dayWords(iso(ist(2025, 12, 31, 23, 59)), now), '31 Dec 2025');
    assert.equal(dayWords(iso(ist(2026, 1, 1, 0, 1)), now), '1 Jan');
    // The year is compared with India's year at `now` too.
    assert.equal(dayWords(iso(ist(2026, 12, 31, 12, 0)), ist(2027, 1, 1, 0, 30)), '31 Dec 2026');
    assert.equal(dayWords(null, now), '');
    assert.equal(dayWords('not a date', now), '');
  });

  it('says since when they have been a lead', () => {
    assert.equal(sinceLine(iso(THU(11, 0)), now), 'Lead since 22 Oct');
    assert.equal(sinceLine(iso(ist(2025, 3, 3, 9, 0)), now), 'Lead since 3 Mar 2025');
    assert.equal(sinceLine('not a date', now), null);
    assert.equal(sinceLine(null, now), null);
  });

  it('counts the tries that got no answer, and says nothing for none', () => {
    assert.equal(triesLine(0), null);
    assert.equal(triesLine(-1), null);
    assert.equal(triesLine(Number.NaN), null);
    assert.equal(triesLine(1), '1 try without an answer');
    assert.equal(triesLine(2), '2 tries without an answer');
    assert.equal(triesLine(11), '11 tries without an answer');
  });

  it('says how often and how lately they watched, and on how many devices', () => {
    assert.equal(visitsLine(watch(), now), '4 visits · last watched 2 h ago');
    assert.equal(visitsLine(watch({ devices: 2 }), now), '4 visits · last watched 2 h ago · 2 devices');
    // One visit leaves the count out; the line then starts with a capital.
    assert.equal(visitsLine(watch({ visits: 1 }), now), 'Last watched 2 h ago');
    assert.equal(visitsLine(watch({ visits: 1, devices: 2 }), now), 'Last watched 2 h ago · 2 devices');
    assert.equal(visitsLine(watch({ lastAt: iso(FRI(14, 59) + 30_000) }), now), '4 visits · last watched just now');
    assert.equal(visitsLine(watch({ lastAt: iso(FRI(15, 0) - 3 * DAY) }), now), '4 visits · last watched 3 days ago');
    // No time to print: the count still says something, one visit does not.
    assert.equal(visitsLine(watch({ lastAt: null }), now), '4 visits');
    assert.equal(visitsLine(watch({ visits: 1, lastAt: null }), now), null);
    // A call-back from the film page has no visit: not "0 visits".
    assert.equal(visitsLine(watch({ visits: 0, lastAt: null, devices: 0 }), now), null);
  });

  it('says how the invite fared, for every way it can', () => {
    // read: the day it went, and whether they have answered since.
    assert.equal(inviteLine(row(), now), 'Invite read 22 Oct · no reply yet');
    assert.equal(inviteLine(row({ signs: { replied: iso(FRI(13, 0)) } }), now), 'Invite read 22 Oct');
    assert.equal(inviteLine(row({ signs: { callMe: iso(FRI(13, 0)) } }), now), 'Invite read 22 Oct');
    // A call-back or the assistant is not a reply to the invite.
    assert.equal(inviteLine(row({ signs: { callback: iso(FRI(13, 0)) } }), now), 'Invite read 22 Oct · no reply yet');
    // delivered: not opened yet, unless something says it was.
    const delivered = { delivery: 'delivered' as const };
    assert.equal(inviteLine(row({ invite: invite(delivered), watch: { visits: 0 } }), now), 'Invite delivered, not opened yet');
    assert.equal(inviteLine(row({ invite: invite(delivered) }), now), 'Invite delivered 22 Oct');
    assert.equal(
      inviteLine(row({ invite: invite(delivered), watch: { visits: 0 }, signs: { replied: iso(FRI(13, 0)) } }), now),
      'Invite delivered 22 Oct',
    );
    // sent
    assert.equal(inviteLine(row({ invite: invite({ delivery: 'sent' }) }), now), 'Invite sent 22 Oct');
    // failed, for each reason, and for none given
    const failed = (failure: LeadInvite['failure']) => row({ invite: invite({ delivery: 'failed', failure }) });
    assert.equal(inviteLine(failed('held_back'), now), 'Invite not delivered — held back by WhatsApp');
    assert.equal(inviteLine(failed('not_on_whatsapp'), now), 'Invite not delivered — not on WhatsApp');
    assert.equal(inviteLine(failed('other'), now), 'Invite not delivered');
    assert.equal(inviteLine(failed(null), now), 'Invite not delivered');
    // never sent one
    assert.equal(inviteLine(row({ invite: null }), now), null);
  });

  it('has a line for every delivery and every failure, whoever has replied', () => {
    for (const delivery of LEAD_INVITE_DELIVERIES) {
      for (const failure of [null, ...LEAD_INVITE_FAILURES] as const) {
        for (const signs of [{}, { replied: iso(FRI(13, 0)) }]) {
          for (const visits of [0, 3]) {
            const line = inviteLine(
              row({ invite: invite({ delivery, failure: delivery === 'failed' ? failure : null }), signs, watch: { visits } }),
              now,
            );
            assert.ok(line && line.startsWith('Invite '), `${delivery} ${failure} ${visits}`);
          }
        }
      }
    }
  });

  it('prints the day of an invite from another year with the year, and nothing odd for an unreadable one', () => {
    assert.equal(inviteLine(row({ invite: invite({ at: iso(ist(2025, 12, 30, 9, 0)) }) }), now), 'Invite read 30 Dec 2025 · no reply yet');
    assert.equal(inviteLine(row({ invite: invite({ at: 'not a date' }) }), now), 'Invite read · no reply yet');
  });

  it('quotes the newest note with who wrote it and when', () => {
    const note = (over: Partial<LeadNote> = {}): LeadNote => ({
      text: 'Wants a demo on Monday',
      byName: 'Aryan',
      at: iso(FRI(13, 0)),
      ...over,
    });
    assert.deepEqual(noteLine(note(), now), { quote: '“Wants a demo on Monday”', by: 'Aryan, 2 h ago' });
    // Breaks and runs of spaces become one space: the list clamps it to two lines.
    assert.deepEqual(noteLine(note({ text: '  Call back\n\n after   lunch \n' }), now), {
      quote: '“Call back after lunch”',
      by: 'Aryan, 2 h ago',
    });
    assert.deepEqual(noteLine(note({ byName: null }), now), { quote: '“Wants a demo on Monday”', by: '2 h ago' });
    assert.deepEqual(noteLine(note({ byName: '  ' }), now), { quote: '“Wants a demo on Monday”', by: '2 h ago' });
    assert.deepEqual(noteLine(note({ at: 'not a date' }), now), { quote: '“Wants a demo on Monday”', by: 'Aryan' });
    assert.deepEqual(noteLine(note({ byName: null, at: 'not a date' }), now), { quote: '“Wants a demo on Monday”', by: '' });
    // The whole note is kept: the clamp is the page's, so the drawer and the words agree.
    const long = 'x'.repeat(500);
    assert.equal(noteLine(note({ text: long }), now)?.quote, `“${long}”`);
    assert.equal(noteLine(null, now), null);
    assert.equal(noteLine(note({ text: ' \n ' }), now), null);
  });

  it('shows the newest way they reached out, and not the ones other lines already say', () => {
    // Each key on its own: every way that is a reach-out shows, watching and registering do not.
    const only = (key: keyof LeadSigns) => ({ ...noSigns(), [key]: iso(FRI(14, 40)) });
    assert.deepEqual(newestReachOut(only('replied')), { at: iso(FRI(14, 40)), kind: 'replied' });
    assert.deepEqual(newestReachOut(only('callMe')), { at: iso(FRI(14, 40)), kind: 'call_me' });
    assert.deepEqual(newestReachOut(only('callback')), { at: iso(FRI(14, 40)), kind: 'callback' });
    assert.deepEqual(newestReachOut(only('assistant')), { at: iso(FRI(14, 40)), kind: 'assistant' });
    assert.equal(newestReachOut(only('registered')), null);
    assert.equal(newestReachOut(noSigns()), null);
    // Every kind of sign is either shown here or left to the line that says it.
    const shown = LEAD_SIGN_KINDS.filter((k) => k !== 'watched' && k !== 'registered');
    assert.deepEqual([...shown].sort(), ['assistant', 'call_me', 'callback', 'replied']);

    // A "Call me" tap is also an incoming message, so it lands as a reply at the same
    // moment: the tap is what the chip names.
    const tap = { ...noSigns(), replied: iso(FRI(14, 40)), callMe: iso(FRI(14, 40)) };
    assert.deepEqual(newestReachOut(tap), { at: iso(FRI(14, 40)), kind: 'call_me' });

    // The newest wins, however the keys are ordered.
    const both = { ...noSigns(), replied: iso(FRI(10, 0)), callback: iso(FRI(14, 0)) };
    assert.deepEqual(newestReachOut(both), { at: iso(FRI(14, 0)), kind: 'callback' });
    // An unreadable time is not a sign.
    assert.equal(newestReachOut({ ...noSigns(), replied: 'not a date' }), null);
  });

  it('prints that chip only while it is news, as the sign line does', () => {
    const signs = { ...noSigns(), callMe: iso(FRI(14, 40)), registered: iso(FRI(14, 50)) };
    assert.equal(reachOutLine({ signs, lastContact: null }, now), 'Tapped "Call me" · 20 min ago');
    const calledBefore = { at: iso(FRI(14, 0)), byName: null, channel: 'call' as const, outcome: 'no_answer' as const };
    assert.equal(reachOutLine({ signs, lastContact: calledBefore }, now), 'Tapped "Call me" · 20 min ago');
    // We rang after they tapped: dealt with.
    assert.equal(reachOutLine({ signs, lastContact: { ...calledBefore, at: iso(FRI(14, 45)) } }, now), null);
    assert.equal(reachOutLine({ signs: noSigns(), lastContact: null }, now), null);
    // They replied, then watched again: the reply still shows (it is not hidden under the newest sign).
    const replied = { ...noSigns(), replied: iso(FRI(10, 0)) };
    assert.equal(reachOutLine({ signs: replied, lastContact: null }, now), 'Replied on WhatsApp · 5 h ago');
  });
});

describe('the page numbers', () => {
  it('counts the leads we are in talks with', () => {
    assert.equal(
      inTalksCount([{ status: 'new' }, { status: 'talking' }, { status: 'interested' }, { status: 'trying' }, { status: 'registered' }]),
      2,
    );
    assert.equal(inTalksCount([]), 0);
  });

  it('lays the funnel out in the order people go through it', () => {
    const steps = funnelSteps({ days: 30, watched: 40, contacted: 36, spoke: 12, registered: 4, clients: 2 });
    assert.deepEqual(
      steps.map((s) => [s.key, s.count]),
      [['watched', 40], ['contacted', 36], ['spoke', 12], ['registered', 4], ['clients', 2]],
    );
    // The first step counts every lead that began in the window, not only those who watched.
    assert.equal(steps[0]?.label, 'New leads');
  });
});

describe('why a lead is due', () => {
  const sign = (kind: LeadSignKind) => ({ at: new Date(0).toISOString(), kind });
  it('words a new lead by what they did, not as coming back', () => {
    assert.equal(dueReasonWords({ status: 'new', dueReason: 'they_came_back', lastSign: sign('replied') }), 'they wrote to us');
    assert.equal(dueReasonWords({ status: 'new', dueReason: 'they_came_back', lastSign: sign('call_me') }), 'they tapped "Call me"');
    assert.equal(dueReasonWords({ status: 'new', dueReason: 'they_came_back', lastSign: sign('callback') }), 'they asked for a call');
    // Once somebody has been in touch, a new sign is them coming back.
    assert.equal(dueReasonWords({ status: 'trying', dueReason: 'they_came_back', lastSign: sign('replied') }), 'they came back');
    assert.equal(dueReasonWords({ status: 'new', dueReason: 'first_contact', lastSign: null }), 'first call');
    assert.equal(dueReasonWords({ status: 'new', dueReason: null, lastSign: null }), null);
  });
});

describe('Add as lead from WhatsApp', () => {
  const row = (
    over: Partial<{
      person: string;
      phone: string | null;
      stopped: boolean;
      onStopList: boolean;
      lead: { id: string; ref: string } | null;
    }> = {},
  ) => ({
    person: '919876543210',
    phone: '919876543210',
    ...over,
  });

  it('chooses what a Message results row offers: the lead, the button, or nothing', () => {
    // Already a lead: the link, whatever else is true of the row.
    assert.deepEqual(resultLeadAction(row({ lead: { id: 'a'.repeat(24), ref: 'L-0007' } })), {
      kind: 'link',
      id: 'a'.repeat(24),
      ref: 'L-0007',
    });
    // A number and no lead: the button, with the inbox's id for the chat.
    assert.deepEqual(resultLeadAction(row()), { kind: 'add', person: '919876543210' });
    assert.deepEqual(resultLeadAction(row({ lead: null })), { kind: 'add', person: '919876543210' });
    // Known only by a username: no number, so nothing to add.
    assert.deepEqual(resultLeadAction(row({ person: 'user:abc', phone: null })), { kind: 'none' });
    assert.deepEqual(resultLeadAction(row({ person: 'message:xyz', phone: null, lead: null })), { kind: 'none' });
    // Said stop: a lead made now would only close as "asked to stop". A lead they already are still links.
    assert.deepEqual(resultLeadAction(row({ stopped: true })), { kind: 'none' });
    // On the stop list from another promotion (or by hand): this row says nothing, but still no button.
    assert.deepEqual(resultLeadAction(row({ stopped: false, onStopList: true })), { kind: 'none' });
    assert.deepEqual(resultLeadAction(row({ stopped: true, lead: { id: 'b'.repeat(24), ref: 'L-0009' } })), {
      kind: 'link',
      id: 'b'.repeat(24),
      ref: 'L-0009',
    });
    // A number the server cannot make a lead of (foreign, landline): nothing, rather than a button that fails.
    assert.deepEqual(resultLeadAction(row({ person: '447911123456', phone: '447911123456' })), { kind: 'none' });
    assert.deepEqual(resultLeadAction(row({ person: '911123456789', phone: '911123456789' })), { kind: 'none' });
  });

  it('offers the inbox button only for a chat that is an Indian mobile, as the server reads one', () => {
    assert.equal(canAddChatAsLead('919876543210'), true);
    assert.equal(canAddChatAsLead('9876543210'), true);
    assert.equal(canAddChatAsLead('916000000000'), true);
    // Foreign numbers and landlines write to the public number too; the server refuses them.
    assert.equal(canAddChatAsLead('447911123456'), false);
    assert.equal(canAddChatAsLead('12025550123'), false);
    assert.equal(canAddChatAsLead('911123456789'), false);
    assert.equal(canAddChatAsLead('915123456789'), false);
    assert.equal(canAddChatAsLead('user:abc'), false);
    assert.equal(canAddChatAsLead('message:xyz'), false);
    assert.equal(canAddChatAsLead('98765'), false);
    assert.equal(canAddChatAsLead('9198765432101234'), false);
    assert.equal(canAddChatAsLead('+919876543210'), false);
    assert.equal(canAddChatAsLead(''), false);
    assert.equal(canAddChatAsLead(null), false);
    // What the page would send is what the server's schema takes.
    assert.ok(leadFromWhatsAppSchema.safeParse({ person: '919876543210' }).success);
    assert.ok(!leadFromWhatsAppSchema.safeParse({ person: 'user:abc' }).success);
  });

  it('says what was made, or that the number was already a lead', () => {
    assert.equal(addedAsLeadText('L-0012', false), 'Added as lead L-0012. It is yours.');
    assert.equal(addedAsLeadText('L-0012', true), 'This number is already lead L-0012.');
    assert.equal(addedAsLeadText('L-0012', false, 'new'), 'Added as lead L-0012. It is yours.');
    // Closed by the server the moment it was made: not "yours", and why.
    assert.equal(
      addedAsLeadText('L-0012', false, 'client'),
      'Added as lead L-0012, but it closed at once: this number is already one of our outlets.',
    );
    assert.equal(
      addedAsLeadText('L-0012', false, 'asked_to_stop'),
      'Added as lead L-0012, but it closed at once: they asked us to stop.',
    );
    // An existing lead is just that, whatever its status.
    assert.equal(addedAsLeadText('L-0012', true, 'client'), 'This number is already lead L-0012.');
  });
});

describe('the address', () => {
  it('takes only the tabs that exist, and starts on To do', () => {
    for (const v of LEAD_VIEWS) assert.equal(viewFromParam(v), v);
    assert.equal(viewFromParam(null), 'todo');
    assert.equal(viewFromParam('everything'), 'todo');
  });

  it('takes only a real id', () => {
    assert.equal(idFromParam(OBJECT_ID), OBJECT_ID);
    assert.equal(idFromParam('abc'), null);
    assert.equal(idFromParam(`${OBJECT_ID}0`), null);
    assert.equal(idFromParam('../../etc/passwd'), null);
    assert.equal(idFromParam(null), null);
  });

  it('links to one lead and to their chat', () => {
    assert.equal(leadHref(OBJECT_ID), `/leads?lead=${OBJECT_ID}`);
    // A lead is a marketing chat, so it opens in the MDG Services inbox (one inbox per number).
    assert.equal(chatHref('919876543210'), '/whatsapp?line=marketing&chat=919876543210');
    assert.equal(chatHref(null), null);
  });
});

describe('the "Log contact" form', () => {
  const NOW = MON(10, 0);
  const base = { channel: 'call', outcome: 'no_answer', note: '', next: null };

  it('needs an outcome, and a channel the server knows', () => {
    assert.match(contactProblem({ ...base, outcome: '' }, NOW) ?? '', /Pick what came/);
    assert.match(contactProblem({ ...base, outcome: 'maybe' }, NOW) ?? '', /Pick what came/);
    assert.match(contactProblem({ ...base, channel: 'fax' }, NOW) ?? '', /how you were in touch/);
    assert.equal(contactProblem(base, NOW), null);
  });

  it('keeps the note short, as the server does', () => {
    assert.equal(contactProblem({ ...base, note: 'x'.repeat(NOTE_MAX) }, NOW), null);
    assert.match(contactProblem({ ...base, note: 'x'.repeat(NOTE_MAX + 1) }, NOW) ?? '', /under 500/);
    // Judged trimmed, as the schema does.
    assert.equal(contactProblem({ ...base, note: `  ${'x'.repeat(NOTE_MAX)}  ` }, NOW), null);
  });

  it('lets the follow-up be left alone, cleared, or typed — and checks what is typed', () => {
    assert.equal(contactProblem({ ...base, next: null }, NOW), null);
    assert.equal(contactProblem({ ...base, next: { date: '', time: '' } }, NOW), null);
    assert.match(contactProblem({ ...base, next: { date: '2026-10-27', time: '' } }, NOW) ?? '', /both the day and the time/);
    assert.match(contactProblem({ ...base, next: { date: '2026-02-30', time: '11:00' } }, NOW) ?? '', /real day/);
    assert.match(contactProblem({ ...base, next: { date: '2026-10-26', time: '09:00' } }, NOW) ?? '', /not passed/);
    assert.equal(contactProblem({ ...base, next: { date: '2026-10-27', time: '11:00' } }, NOW), null);
    assert.match(contactProblem({ ...base, next: { date: '2027-03-01', time: '11:00' } }, NOW) ?? '', /within the next 90 days/);
  });

  it('does not look at a follow-up for an outcome that closes the lead', () => {
    for (const o of LEAD_CLOSING_OUTCOMES) {
      assert.equal(contactProblem({ ...base, outcome: o, next: { date: '2020-01-01', time: '11:00' } }, NOW), null, o);
    }
  });

  it('builds a body the shared schema accepts, for every channel and outcome', () => {
    for (const channel of LEAD_CONTACT_CHANNELS) {
      for (const outcome of LEAD_CONTACT_OUTCOMES) {
        for (const note of ['', '  ', 'Will decide on Friday.']) {
          for (const next of [null, whenInput(MON(14, 0) + 24 * HOUR)]) {
            const form = { channel, outcome, note, next };
            assert.equal(contactProblem(form, NOW), null, `${channel} ${outcome}`);
            const body = contactBody(form);
            const parsed = logLeadContactSchema.safeParse(body);
            assert.ok(parsed.success, `${channel} ${outcome} ${JSON.stringify(body)}`);
          }
        }
      }
    }
  });

  it('sends the note and the follow-up only when there is one', () => {
    assert.deepEqual(contactBody({ ...base }), { channel: 'call', outcome: 'no_answer' });
    assert.deepEqual(contactBody({ ...base, note: '  ' }), { channel: 'call', outcome: 'no_answer' });
    assert.deepEqual(contactBody({ ...base, note: '  call after lunch ' }), {
      channel: 'call',
      outcome: 'no_answer',
      note: 'call after lunch',
    });
    assert.deepEqual(contactBody({ ...base, next: { date: '', time: '' } }), { channel: 'call', outcome: 'no_answer' });
    // 11:00 in India on Tuesday 27 Oct is 05:30 UTC.
    assert.deepEqual(contactBody({ ...base, next: { date: '2026-10-27', time: '11:00' } }), {
      channel: 'call',
      outcome: 'no_answer',
      nextAt: '2026-10-27T05:30:00.000Z',
    });
  });

  it('never sends a follow-up with an outcome that closes the lead', () => {
    for (const o of LEAD_CLOSING_OUTCOMES) {
      const body = contactBody({ ...base, outcome: o, next: { date: '2026-10-27', time: '11:00' } });
      assert.equal('nextAt' in body, false, o);
      assert.ok(logLeadContactSchema.safeParse(body).success, o);
    }
  });
});

describe('the "Set a follow-up" form', () => {
  const NOW = MON(10, 0);

  it('needs a real future day and time within 90 days', () => {
    assert.match(followUpProblem({ date: '', time: '', note: '' }, NOW) ?? '', /day and the time/);
    assert.match(followUpProblem({ date: '2026-10-27', time: '', note: '' }, NOW) ?? '', /day and the time/);
    assert.match(followUpProblem({ date: '2026-13-01', time: '11:00', note: '' }, NOW) ?? '', /real day/);
    assert.match(followUpProblem({ date: '2026-10-26', time: '10:00', note: '' }, NOW) ?? '', /not passed/);
    assert.equal(followUpProblem({ date: '2026-10-26', time: '10:01', note: '' }, NOW), null);
    assert.equal(followUpProblem({ date: '2027-01-24', time: '10:00', note: '' }, NOW), null);
    assert.match(followUpProblem({ date: '2027-01-25', time: '10:01', note: '' }, NOW) ?? '', /90 days/);
    assert.match(followUpProblem({ date: '2026-10-27', time: '11:00', note: 'x'.repeat(NOTE_MAX + 1) }, NOW) ?? '', /under 500/);
  });

  it('builds a body the shared schema accepts', () => {
    const plain = followUpBody({ date: '2026-10-27', time: '11:00', note: '' });
    assert.deepEqual(plain, { at: '2026-10-27T05:30:00.000Z' });
    assert.ok(setLeadFollowUpSchema.safeParse(plain).success);
    const noted = followUpBody({ date: '2026-10-27', time: '11:00', note: ' ask about the second pump ' });
    assert.deepEqual(noted, { at: '2026-10-27T05:30:00.000Z', note: 'ask about the second pump' });
    assert.ok(setLeadFollowUpSchema.safeParse(noted).success);
  });

  it('reads two boxes as India time, and refuses what is not a moment', () => {
    assert.equal(parseWhen({ date: '2026-10-26', time: '10:00' }), MON(10, 0));
    assert.equal(parseWhen({ date: '2026-10-26', time: '24:00' }), null);
    assert.equal(parseWhen({ date: '2026-10-26', time: '10:60' }), null);
    assert.equal(parseWhen({ date: '2026-02-29', time: '10:00' }), null);
    assert.equal(parseWhen({ date: '', time: '10:00' }), null);
    assert.equal(parseWhen({ date: '26-10-2026', time: '10:00' }), null);
    assert.deepEqual(whenInput(MON(10, 5)), { date: '2026-10-26', time: '10:05' });
    // Midnight in India is still the evening before in UTC.
    assert.deepEqual(whenInput(Date.UTC(2026, 9, 25, 18, 30)), { date: '2026-10-26', time: '00:00' });
  });

  it('offers in two hours, tomorrow 11:00 and Monday 11:00, never the same time twice', () => {
    const labels = (now: number) => quickPicks(now).map((p) => p.label);
    // Monday: tomorrow is Tuesday; "Monday" is a week away.
    assert.deepEqual(labels(MON(10, 0)), ['In 2 hours', 'Tomorrow 11:00', 'Monday 11:00']);
    assert.equal(quickPicks(MON(10, 0))[1]?.at, TUE(11, 0));
    assert.equal(quickPicks(MON(10, 0))[2]?.at, ist(2026, 11, 2, 11, 0));
    // Friday: Saturday is a working day; Monday follows.
    assert.deepEqual(labels(FRI(10, 0)), ['In 2 hours', 'Tomorrow 11:00', 'Monday 11:00']);
    assert.equal(quickPicks(FRI(10, 0))[2]?.at, MON(11, 0));
    // Saturday: tomorrow is Sunday, a working day like any other.
    assert.deepEqual(labels(SAT(10, 0)), ['In 2 hours', 'Tomorrow 11:00', 'Monday 11:00']);
    assert.equal(quickPicks(SAT(10, 0))[1]?.at, SUN(11, 0));
    // Sunday: tomorrow IS Monday, so it is not offered twice.
    assert.deepEqual(labels(SUN(10, 0)), ['In 2 hours', 'Tomorrow 11:00']);
    assert.equal(quickPicks(SUN(10, 0))[1]?.at, MON(11, 0));
    assert.equal(quickPicks(MON(10, 0))[0]?.at, MON(12, 0));
    // At night "in 2 hours" is still two hours, not the morning.
    assert.equal(quickPicks(THU(23, 30))[0]?.at, FRI(1, 30));
    assert.equal(quickPicks(THU(23, 30))[1]?.at, FRI(11, 0));
  });

  it('every pick is a follow-up the server would take', () => {
    for (let t = THU(0, 0); t < THU(0, 0) + 8 * DAY; t += 53 * MIN) {
      for (const p of quickPicks(t)) {
        const { date, time } = whenInput(p.at);
        assert.equal(followUpProblem({ date, time, note: '' }, t), null, `${p.label} from ${new Date(t).toISOString()}`);
      }
    }
  });

  it('says when the reminder will come, and never a quiet-hours excuse', () => {
    const now = MON(10, 0);
    assert.equal(reminderLine(TUE(11, 0), now), 'Reminder: Tomorrow 11:00.');
    // 21:00 used to read "Tomorrow 09:00. We only remind between 09:00 and 20:00, every day."
    assert.equal(reminderLine(MON(21, 0), now), 'Reminder: Today 21:00.');
    assert.equal(reminderLine(TUE(3, 0), now), 'Reminder: Tomorrow 03:00.');
    assert.equal(reminderLine(TUE(0, 0), now), 'Reminder: Tomorrow 00:00.');
    for (let t = MON(10, 1); t < MON(10, 0) + 3 * DAY; t += 53 * MIN) {
      assert.doesNotMatch(reminderLine(t, now), /only remind/, new Date(t).toISOString());
    }
    // A Sunday noon is kept as it is, named by its weekday from Friday.
    assert.equal(reminderLine(SUN(12, 0), FRI(10, 0)), 'Reminder: Sun 12:00.');
  });
});

describe('assign, note, close, reopen and number', () => {
  it('"Nobody" is a null owner', () => {
    assert.deepEqual(assignBody(''), { ownerId: null });
    assert.deepEqual(assignBody(OBJECT_ID), { ownerId: OBJECT_ID });
    assert.ok(assignLeadSchema.safeParse(assignBody('')).success);
    assert.ok(assignLeadSchema.safeParse(assignBody(OBJECT_ID)).success);
  });

  it('a note needs words and a short length', () => {
    assert.match(noteProblem('   ') ?? '', /Write the note/);
    assert.equal(noteProblem('Asked for the price list.'), null);
    assert.match(noteProblem('x'.repeat(NOTE_MAX + 1)) ?? '', /under 500/);
    const body = noteBody('  Asked for the price list. ');
    assert.deepEqual(body, { text: 'Asked for the price list.' });
    assert.ok(leadNoteSchema.safeParse(body).success);
  });

  it('closing needs one of the four reasons a person may give', () => {
    assert.match(closeProblem({ reason: '', note: '' }) ?? '', /Pick why/);
    // `client` is only ever the server's.
    assert.match(closeProblem({ reason: 'client', note: '' }) ?? '', /Pick why/);
    assert.match(closeProblem({ reason: 'not_interested', note: 'x'.repeat(NOTE_MAX + 1) }) ?? '', /under 500/);
    for (const reason of LEAD_ADMIN_CLOSE_REASONS) {
      assert.equal(closeProblem({ reason, note: '' }), null, reason);
      for (const note of ['', 'Said no on the phone.']) {
        const body = closeBody({ reason, note });
        assert.ok(closeLeadSchema.safeParse(body).success, `${reason} ${note}`);
      }
    }
    assert.deepEqual(closeBody({ reason: 'wrong_number', note: ' ' }), { reason: 'wrong_number' });
  });

  it('reopening takes an optional short note', () => {
    assert.equal(reopenProblem(''), null);
    assert.match(reopenProblem('x'.repeat(NOTE_MAX + 1)) ?? '', /under 500/);
    assert.deepEqual(reopenBody('  '), {});
    assert.deepEqual(reopenBody(' They called back. '), { note: 'They called back.' });
    assert.ok(reopenLeadSchema.safeParse(reopenBody('')).success);
    assert.ok(reopenLeadSchema.safeParse(reopenBody('They called back.')).success);
  });

  it('a number is ten digits starting 6 to 9, however it is typed', () => {
    for (const typed of ['9876543210', '98765 43210', '+91 98765 43210', '+91-98765-43210', '09876543210', '919876543210']) {
      assert.equal(mobileTen(typed), '9876543210', typed);
      assert.equal(phoneProblem(typed), null, typed);
      assert.ok(addLeadPhoneSchema.safeParse(phoneBody(typed)).success, typed);
      assert.deepEqual(phoneBody(typed), { mobile: '9876543210' }, typed);
    }
    for (const typed of ['', '12345', '5876543210', '98765 4321', '+44 7911 123456', 'call him', '98765 43210 extra']) {
      assert.equal(mobileTen(typed), null, typed);
      assert.match(phoneProblem(typed) ?? '', /10-digit mobile/, typed);
    }
  });

  it('"Add lead" needs only the number, and sends only the boxes filled in', () => {
    const empty = { mobile: '', name: '', place: '', note: '' };
    assert.deepEqual(Object.keys(addLeadProblems(empty)), ['mobile']);
    const bare = { ...empty, mobile: '+91 98765 43210' };
    assert.deepEqual(addLeadProblems(bare), {});
    assert.deepEqual(addLeadBody(bare), { mobile: '9876543210' });
    assert.ok(createLeadSchema.safeParse(addLeadBody(bare)).success);

    const full = { mobile: '98765 43210', name: ' Suresh ji ', place: 'Patna ', note: ' Met at the meet ' };
    assert.deepEqual(addLeadBody(full), {
      mobile: '9876543210',
      name: 'Suresh ji',
      place: 'Patna',
      note: 'Met at the meet',
    });
    assert.ok(createLeadSchema.safeParse(addLeadBody(full)).success);

    const long = {
      mobile: '9876543210',
      name: 'x'.repeat(NAME_MAX + 1),
      place: 'y'.repeat(NAME_MAX + 1),
      note: 'z'.repeat(NOTE_MAX + 1),
    };
    const p = addLeadProblems(long);
    assert.deepEqual(Object.keys(p).sort(), ['name', 'note', 'place']);
    assert.match(p.name ?? '', /under 80/);
    // What the form lets through, the server takes; what it stops, the server would refuse.
    assert.ok(!createLeadSchema.safeParse(addLeadBody(long)).success);
    assert.ok(createLeadSchema.safeParse(addLeadBody({ ...long, name: 'x'.repeat(NAME_MAX), place: '', note: '' })).success);
  });
});

describe('"How follow-ups work"', () => {
  it('is built from the same steps the suggestion uses', () => {
    const rows = followUpGuide();
    const text = rows.map((r) => `${r.when} ${r.then}`).join('\n');
    assert.ok(rows.length >= 6);
    for (const r of rows) {
      assert.ok(r.when.length > 0 && r.then.length > 0);
    }
    // The 4 hours are plain hours now, not "working hours": there is nothing to wait out.
    assert.doesNotMatch(text, /working hours/);
    // The first call keeps to 11:00–19:00 (26 Oct 2026): a lead that comes in during the evening waits for the morning.
    assert.equal(
      rows[0]?.then,
      '2 hours after we could first reach them, between 11:00 and 19:00. A lead that comes in during the evening is called at 11:00 the next morning',
    );
    assert.equal(
      rows.find((r) => r.when.startsWith('Nobody answered'))?.then,
      '4 hours later, then the next day, then 2 days later, then 3 days later, then a week later',
    );
    assert.equal(
      rows.find((r) => r.when.startsWith('You sent a message'))?.then,
      'the next day, then 2 days later, then 3 days later, then a week later',
    );
  });
});

describe('call recordings: the words cover every value the server can send', () => {
  it('every kind of failure has one plain sentence, and a retry is offered only where it can help', () => {
    for (const f of LEAD_RECORDING_FAILURES) {
      const words = RECORDING_FAILURE_WORDS[f];
      assert.ok(words.length > 0 && words.endsWith('.'), f);
      assert.equal(recordingFailureWords(f), words, f);
      // One sentence, and none says the audio is gone: it plays in every case.
      assert.equal(words.split('. ').length, 1, f);
      assert.doesNotMatch(words, /lost|deleted|gone/i, f);
    }
    assert.match(RECORDING_FAILURE_WORDS.too_big, /50 MB/);
    // The file is the problem for these two: asking again changes nothing.
    const noHelp: LeadRecordingFailure[] = ['unsupported', 'too_big'];
    for (const f of LEAD_RECORDING_FAILURES) assert.equal(retryHelps(f), !noHelp.includes(f), f);
    // A failure with no kind (or one from a newer server) still says something true, and may be retried.
    assert.match(recordingFailureWords(null), /could not listen/);
    assert.match(recordingFailureWords('brand_new' as LeadRecordingFailure), /could not listen/);
    assert.equal(retryHelps(null), true);

    // A call still "listening" may be started again a quarter of an hour after it went up, not before.
    const up = FRI(10, 0);
    const listening = { status: 'processing' as const, failure: null, uploadedAt: new Date(up).toISOString() };
    assert.equal(canRetryRecording(listening, up + RECORDING_STUCK_MS - 1), false);
    assert.equal(canRetryRecording(listening, up + RECORDING_STUCK_MS), true);
    assert.equal(canRetryRecording({ ...listening, status: 'ready' }, up + 2 * RECORDING_STUCK_MS), false);
    assert.equal(canRetryRecording({ ...listening, status: 'failed', failure: 'too_big' }, up), false);
    assert.equal(canRetryRecording({ ...listening, status: 'failed', failure: 'summary_failed' }, up), true);
  });

  it('every interest has a label and a colour, and one this screen does not know reads as unclear', () => {
    for (const i of LEAD_CALL_INTEREST) {
      assert.equal(interestLabel(i), LEAD_CALL_INTEREST_LABELS[i], i);
      assert.ok(interestTone(i), i);
    }
    assert.deepEqual(
      LEAD_CALL_INTEREST.map((i) => [i, interestTone(i)]),
      [
        ['hot', 'success'],
        ['warm', 'warning'],
        ['cold', 'info'],
        ['unclear', 'neutral'],
      ],
    );
    assert.equal(interestLabel('gone' as LeadCallInterest), 'Unclear');
    assert.equal(interestTone('gone' as LeadCallInterest), 'neutral');
  });

  it('only a recording still being listened to keeps the drawer asking', () => {
    for (const status of LEAD_RECORDING_STATUSES) {
      assert.equal(hasProcessing([{ status }]), status === 'processing', status);
    }
    assert.equal(hasProcessing([]), false);
    assert.equal(hasProcessing(undefined), false);
    assert.equal(hasProcessing(null), false);
    assert.equal(hasProcessing([{ status: 'ready' }, { status: 'failed' }, { status: 'processing' }]), true);
  });

  it('the new kind of history item is one the timeline knows', () => {
    assert.ok((LEAD_TIMELINE_KINDS as readonly string[]).includes('call_recording'));
  });
});

describe('call recordings: which file may be picked', () => {
  const file = (name: string, type: string, size = 1_000_000) => ({ name, type, size });

  it('takes every type the server lists, as the browser reports it', () => {
    for (const t of LEAD_RECORDING_TYPES) {
      assert.equal(recordingType(file('call', t)), t, t);
      assert.equal(recordingFileProblem(file('call', t)), null, t);
    }
    // A codec after the type is not part of it.
    assert.equal(recordingType(file('x.webm', 'audio/webm;codecs=opus')), 'audio/webm');
    assert.equal(recordingType(file('x.m4a', ' Audio/MP4 ')), 'audio/mp4');
  });

  it('turns the other names browsers use for the same formats into the listed ones', () => {
    const aliases: Record<string, string> = {
      'audio/mp3': 'audio/mpeg',
      'audio/mpeg3': 'audio/mpeg',
      'audio/x-mpeg-3': 'audio/mpeg',
      'audio/m4a': 'audio/x-m4a',
      'audio/x-aac': 'audio/aac',
      'audio/wave': 'audio/wav',
      'audio/vnd.wave': 'audio/wav',
    };
    for (const [seen, sent] of Object.entries(aliases)) {
      assert.equal(recordingType(file('call', seen)), sent, seen);
      assert.ok((LEAD_RECORDING_TYPES as readonly string[]).includes(sent), sent);
    }
  });

  it('goes by the name when the browser says nothing useful, upper case or not', () => {
    const byName: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      webm: 'audio/webm',
    };
    for (const [ext, type] of Object.entries(byName)) {
      for (const seen of ['', 'application/octet-stream']) {
        assert.equal(recordingType(file(`Call 25-10.${ext}`, seen)), type, `${ext} ${seen}`);
        assert.equal(recordingType(file(`CALL.${ext.toUpperCase()}`, seen)), type, `${ext} upper`);
      }
      assert.ok((LEAD_RECORDING_TYPES as readonly string[]).includes(type), type);
    }
    // A sound or video type the server spells differently: the name decides here too.
    assert.equal(recordingType(file('call.webm', 'video/webm')), 'audio/webm');
    assert.equal(recordingType(file('call.opus', 'audio/opus')), 'audio/ogg');
    assert.equal(recordingType(file('call.amr', 'audio/amr')), null);
    assert.equal(recordingType(file('notes.pdf', 'application/pdf')), null);
    assert.equal(recordingType(file('call.amr', '')), null);
    assert.equal(recordingType(file('call.3gp', '')), null);
    assert.equal(recordingType(file('notes.pdf', '')), null);
    assert.equal(recordingType(file('call', '')), null);
    // A non-sound type the browser names wins over the name; an unfamiliar sound type
    // does not (the name decides, and the server checks the bytes).
    assert.equal(recordingType(file('call.mp3', 'application/pdf')), null);
    assert.equal(recordingType(file('call.mp3', 'audio/flac')), 'audio/mpeg');
    assert.equal(recordingType(file('call.flac', 'audio/flac')), null);
  });

  it('the picker offers exactly these, spelled out and not "any audio"', () => {
    const offered = RECORDING_ACCEPT.split(',');
    for (const t of LEAD_RECORDING_TYPES) assert.ok(offered.includes(t), t);
    for (const ext of ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm']) {
      assert.ok(offered.includes(`.${ext}`), ext);
    }
    assert.ok(!offered.includes('audio/*'));
    assert.equal(offered.length, new Set(offered).size);
  });

  it('refuses with a sentence that says what to do', () => {
    assert.equal(recordingFileProblem(file('call.mp3', 'audio/mpeg', 0)), 'That file is empty.');
    assert.match(
      recordingFileProblem(file('photo.jpg', 'image/jpeg')) ?? '',
      /MP3, M4A, AAC, WAV, OGG, WebM or Opus/,
    );
    assert.match(recordingFileProblem(file('notes.pdf', '')) ?? '', /not a recording/);
    // Wrong type is said before too big: the bigger problem is the one that cannot be fixed by trimming.
    assert.match(recordingFileProblem(file('big.pdf', 'application/pdf', 99 * 1024 * 1024)) ?? '', /not a recording/);
    assert.match(
      recordingFileProblem(file('long.m4a', 'audio/mp4', 62 * 1024 * 1024)) ?? '',
      /62 MB.*50 MB.*about an hour/,
    );
  });

  it('the size limit is the shared one, and the edge is exact', () => {
    assert.equal(LEAD_RECORDING_MAX_BYTES, 50 * 1024 * 1024);
    assert.equal(recordingFileProblem(file('a.mp3', 'audio/mpeg', LEAD_RECORDING_MAX_BYTES)), null);
    assert.notEqual(recordingFileProblem(file('a.mp3', 'audio/mpeg', LEAD_RECORDING_MAX_BYTES + 1)), null);
    assert.equal(recordingFileProblem(file('a.mp3', 'audio/mpeg', 1)), null);
  });

  it('says a size in the units a person reads', () => {
    assert.equal(fileSizeWords(500), '1 KB');
    assert.equal(fileSizeWords(340 * 1024), '340 KB');
    assert.equal(fileSizeWords(Math.round(6.2 * 1024 * 1024)), '6.2 MB');
    assert.equal(fileSizeWords(1024 * 1024), '1 MB');
    assert.equal(fileSizeWords(62 * 1024 * 1024), '62 MB');
    assert.equal(fileSizeWords(LEAD_RECORDING_MAX_BYTES), '50 MB');
  });
});

describe('call recordings: what is sent', () => {
  it('a name is kept whole, tidied, or cut to the longest the server takes with its extension kept', () => {
    assert.equal(recordingFilename('Call with Ramesh.m4a'), 'Call with Ramesh.m4a');
    assert.equal(recordingFilename('  Call   with\n Ramesh.m4a '), 'Call with Ramesh.m4a');
    assert.equal(recordingFilename(''), 'Call recording');
    assert.equal(recordingFilename('   '), 'Call recording');
    const long = recordingFilename(`${'a'.repeat(300)}.m4a`);
    assert.equal(long.length, RECORDING_FILENAME_MAX);
    assert.ok(long.endsWith('.m4a'));
    // No extension to keep, and an "extension" that is really most of the name.
    assert.equal(recordingFilename('b'.repeat(300)).length, RECORDING_FILENAME_MAX);
    assert.equal(recordingFilename(`${'c'.repeat(150)}.${'d'.repeat(150)}`).length, RECORDING_FILENAME_MAX);
  });

  it('the limits the bodies keep are the schemas', () => {
    const ok = (filename: string) =>
      presignLeadRecordingSchema.safeParse({ filename, contentType: 'audio/mpeg', size: 1000 }).success;
    assert.equal(ok('a'.repeat(RECORDING_FILENAME_MAX)), true);
    assert.equal(ok('a'.repeat(RECORDING_FILENAME_MAX + 1)), false);
    const lasts = (durationSec: number) =>
      addLeadRecordingSchema.safeParse({
        key: 'k',
        filename: 'a.mp3',
        contentType: 'audio/mpeg',
        size: 1000,
        durationSec,
      }).success;
    assert.equal(lasts(RECORDING_DURATION_MAX_SEC), true);
    assert.equal(lasts(RECORDING_DURATION_MAX_SEC + 1), false);
  });

  it('the signing request and the "it is there" request are ones the schemas accept, for every type', () => {
    for (const type of LEAD_RECORDING_TYPES) {
      const f = { name: 'Call.m4a', size: 6_800_000 };
      assert.ok(presignLeadRecordingSchema.safeParse(recordingPresignBody(f, type)).success, type);
      assert.deepEqual(recordingPresignBody(f, type), { filename: 'Call.m4a', contentType: type, size: 6_800_000 });
      assert.ok(
        addLeadRecordingSchema.safeParse(recordingAddBody('lead-recordings/abc/1.m4a', f, type, 392)).success,
        type,
      );
    }
    // The biggest file and the longest name still pass.
    const edge = { name: `${'x'.repeat(400)}.mp3`, size: LEAD_RECORDING_MAX_BYTES };
    assert.ok(presignLeadRecordingSchema.safeParse(recordingPresignBody(edge, 'audio/mpeg')).success);
    assert.ok(addLeadRecordingSchema.safeParse(recordingAddBody('k', edge, 'audio/mpeg', null)).success);
  });

  it('the length goes whole seconds, and only when it is one the server will take', () => {
    const f = { name: 'a.mp3', size: 1000 };
    const body = (d: number | null) => recordingAddBody('k', f, 'audio/mpeg', d);
    assert.equal(body(392.4).durationSec, 392);
    assert.equal(body(392.6).durationSec, 393);
    assert.equal(body(RECORDING_DURATION_MAX_SEC).durationSec, RECORDING_DURATION_MAX_SEC);
    // Not known, not a length, or longer than the server allows: no field, and the upload carries on.
    for (const d of [null, 0, 0.2, -5, Number.NaN, Number.POSITIVE_INFINITY, RECORDING_DURATION_MAX_SEC + 1]) {
      assert.equal('durationSec' in body(d), false, String(d));
      assert.ok(addLeadRecordingSchema.safeParse(body(d)).success, String(d));
    }
    assert.equal(body(392).key, 'k');
  });

  it('the line under the button says where the upload is, and never more than 100', () => {
    assert.equal(uploadLine('sending', 0), 'Sending the recording… 0%');
    assert.equal(uploadLine('sending', 42.4), 'Sending the recording… 42%');
    assert.equal(uploadLine('sending', 140), 'Sending the recording… 100%');
    assert.equal(uploadLine('sending', -3), 'Sending the recording… 0%');
    assert.equal(uploadLine('saving', 100), 'Saving the recording…');
  });
});

describe('call recordings: the lines in the drawer and the list', () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  it('says how long the call ran, as m:ss and past the hour as h:mm:ss', () => {
    assert.equal(callLength(392), '6:32');
    assert.equal(callLength(5), '0:05');
    assert.equal(callLength(60), '1:00');
    assert.equal(callLength(59.6), '1:00');
    assert.equal(callLength(3599), '59:59');
    assert.equal(callLength(3725), '1:02:05');
    for (const d of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(callLength(d), null, String(d));
    }
  });

  it('puts when, how long and who on one line, and leaves out what is not known', () => {
    const now = FRI(15, 0);
    const r = { uploadedAt: iso(FRI(14, 20)), durationSec: 392 as number | null, uploadedByName: 'Pawan' as string | null };
    assert.equal(recordingHeader(r, now), '23 Oct, 14:20 · 6:32 · by Pawan');
    assert.equal(recordingHeader({ ...r, durationSec: null }, now), '23 Oct, 14:20 · by Pawan');
    assert.equal(recordingHeader({ ...r, uploadedByName: null }, now), '23 Oct, 14:20 · 6:32');
    assert.equal(recordingHeader({ ...r, uploadedByName: '   ' }, now), '23 Oct, 14:20 · 6:32');
    assert.equal(recordingHeader({ ...r, durationSec: 3725 }, now), '23 Oct, 14:20 · 1:02:05 · by Pawan');
    // The day is the India one, and the year appears once it is not this year.
    assert.equal(recordingHeader({ ...r, uploadedAt: iso(ist(2025, 12, 31, 23, 59)) }, now), '31 Dec 2025, 23:59 · 6:32 · by Pawan');
    // Nothing known at all still reads as a line.
    assert.equal(
      recordingHeader({ uploadedAt: 'not a date', durationSec: null, uploadedByName: null }, now),
      'Call recording',
    );
  });

  it('shows at most three short bullets under a heading, none empty', () => {
    assert.equal(SUMMARY_BULLETS_MAX, 3);
    assert.deepEqual(shortList(['  Wants the price list  ', '', '   ', 'Call his son\n after 6', 'Visit Monday', 'Fourth', 'Fifth']), [
      'Wants the price list',
      'Call his son after 6',
      'Visit Monday',
    ]);
    assert.deepEqual(shortList([]), []);
    assert.deepEqual(shortList(null), []);
    assert.deepEqual(shortList(undefined), []);
  });

  it('"Log this call" opens Log contact as a call, with the suggested outcome and the gist as the note', () => {
    for (const outcome of LEAD_CONTACT_OUTCOMES) {
      const p = logCallPrefill({ gist: 'Wants the price list.', suggestedOutcome: outcome });
      assert.deepEqual(p, { channel: 'call', outcome, note: 'Wants the price list.' }, outcome);
      // What the form would then send is a contact the server takes.
      assert.equal(contactProblem({ ...p, next: null }, FRI(15, 0)), null, outcome);
      assert.ok(logLeadContactSchema.safeParse(contactBody({ ...p, next: null })).success, outcome);
    }
    // No outcome suggested, or one this screen does not know: the person picks, nothing is guessed for them.
    for (const suggestedOutcome of [null, 'brand_new' as LeadContactOutcome]) {
      const p = logCallPrefill({ gist: 'Not clear.', suggestedOutcome });
      assert.equal(p.outcome, '');
      assert.match(contactProblem({ ...p, next: null }, FRI(15, 0)) ?? '', /Pick what came of it/);
    }
    assert.equal(logCallPrefill({ gist: '  Asked\n for   a visit.  ', suggestedOutcome: null }).note, 'Asked for a visit.');
    // A gist longer than a note may be is cut, so the form opens ready to save.
    const long = logCallPrefill({ gist: 'word '.repeat(300), suggestedOutcome: 'thinking' });
    assert.ok(long.note.length <= NOTE_MAX);
    assert.ok(long.note.endsWith('…'));
    assert.equal(contactProblem({ ...long, next: null }, FRI(15, 0)), null);
  });

  it('the list says how the last call went, with a badge for every interest', () => {
    for (const interest of LEAD_CALL_INTEREST) {
      const line = lastCallLine({ at: iso(FRI(14, 20)), gist: 'Wants the price list.', interest });
      assert.deepEqual(line, {
        text: 'Last call: Wants the price list.',
        label: LEAD_CALL_INTEREST_LABELS[interest],
        tone: interestTone(interest),
      });
    }
    assert.equal(
      lastCallLine({ at: iso(FRI(14, 20)), gist: ' Wants\n the   price list. ', interest: 'hot' })?.text,
      'Last call: Wants the price list.',
    );
    // No call, a server that sends none, or a gist that is only blank space: nothing printed.
    assert.equal(lastCallLine(null), null);
    assert.equal(lastCallLine(undefined), null);
    assert.equal(lastCallLine({ at: iso(FRI(14, 20)), gist: '  \n ', interest: 'warm' }), null);
  });
});

describe('the drawer: which colour says what to do now', () => {
  const now = FRI(15, 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const signs = (over: Partial<LeadSigns> = {}): LeadSigns => ({
    replied: null,
    callMe: null,
    callback: null,
    assistant: null,
    registered: null,
    ...over,
  });
  const contact = (at: number) => ({
    at: iso(at),
    byName: 'Aryan',
    channel: 'call' as const,
    outcome: 'no_answer' as const,
  });
  /** An open lead that is fine: spoken to this morning, next follow-up this evening. */
  const lead = (over: Partial<Pick<LeadRow, 'status' | 'cold' | 'nextDueAt' | 'lastContact' | 'signs'>> = {}) => ({
    status: 'trying' as LeadRow['status'],
    cold: false,
    nextDueAt: iso(FRI(18, 0)) as string | null,
    lastContact: contact(FRI(9, 0)) as LeadRow['lastContact'],
    signs: signs(),
    ...over,
  });

  it('is blue for a lead that is on track', () => {
    assert.equal(doNowTone(lead(), now), 'brand');
    // A follow-up nobody has set is not a reason to shout.
    assert.equal(doNowTone(lead({ nextDueAt: null }), now), 'brand');
  });

  it('is red once it is overdue or has gone cold, even if the next time looks fine', () => {
    assert.equal(doNowTone(lead({ nextDueAt: iso(FRI(10, 0)) }), now), 'danger');
    assert.equal(doNowTone(lead({ nextDueAt: iso(FRI(15, 0)) }), now), 'danger');
    assert.equal(doNowTone(lead({ cold: true }), now), 'danger');
    // Red wins over amber: late and never contacted is late first.
    assert.equal(doNowTone(lead({ nextDueAt: iso(FRI(10, 0)), lastContact: null }), now), 'danger');
  });

  it('is amber when somebody is waiting on us', () => {
    // Due within two hours.
    assert.equal(doNowTone(lead({ nextDueAt: iso(FRI(16, 59)) }), now), 'warning');
    assert.equal(doNowTone(lead({ nextDueAt: iso(FRI(17, 1)) }), now), 'brand');
    // Nobody has been in touch.
    assert.equal(doNowTone(lead({ lastContact: null }), now), 'warning');
    // They reached out after our last contact; before it, they are dealt with.
    assert.equal(doNowTone(lead({ signs: signs({ callMe: iso(FRI(14, 0)) }) }), now), 'warning');
    assert.equal(doNowTone(lead({ signs: signs({ callMe: iso(FRI(8, 0)) }) }), now), 'brand');
    // Watching again is not asking: it does not turn the panel amber.
    assert.equal(doNowTone(lead({ signs: signs() }), now), 'brand');
  });

  it('is grey when there is nothing to do: closed, or Onboarding has it', () => {
    for (const status of ['client', 'not_interested', 'asked_to_stop', 'wrong_number', 'not_a_lead'] as const) {
      // Never red, however late its old due time was, and never amber for being uncontacted.
      assert.equal(doNowTone(lead({ status, cold: true, nextDueAt: iso(FRI(1, 0)), lastContact: null }), now), 'quiet', status);
    }
    assert.equal(doNowTone(lead({ status: 'registered', nextDueAt: null, lastContact: null }), now), 'quiet');
    // Once Onboarding has been in touch the lead's own clock chases it again.
    assert.equal(doNowTone(lead({ status: 'registered', nextDueAt: iso(FRI(10, 0)) }), now), 'danger');
    assert.equal(doNowTone(lead({ status: 'registered', nextDueAt: iso(SAT(11, 0)) }), now), 'brand');
  });

  it('says what the next follow-up is, who closed it, or that Onboarding has it', () => {
    const row = (over: Partial<Pick<LeadRow, 'status' | 'nextDueAt' | 'dueReason' | 'closedAt' | 'closedByName'>>) => ({
      status: 'trying' as LeadRow['status'],
      nextDueAt: null as string | null,
      dueReason: null as LeadRow['dueReason'],
      closedAt: null as string | null,
      closedByName: null as string | null,
      ...over,
    });
    // A plain day carries the label; a time the team chose leaves its reason to the sentence above.
    assert.equal(
      nextFollowUpLine(row({ nextDueAt: iso(SAT(11, 0)), dueReason: 'scheduled' }), now),
      'Next follow-up: Tomorrow 11:00',
    );
    // Late and soon say what they are about without a label in front.
    assert.equal(
      nextFollowUpLine(row({ nextDueAt: iso(FRI(10, 0)), dueReason: 'no_answer_retry' }), now),
      'Overdue 5 h · no answer last time',
    );
    assert.equal(
      nextFollowUpLine(row({ nextDueAt: iso(FRI(15, 40)), dueReason: 'check_in' }), now),
      'Due in 40 min · check in',
    );
    assert.equal(nextFollowUpLine(row({ nextDueAt: iso(FRI(15, 0)), dueReason: 'first_contact' }), now), 'Due now · first call');
    assert.equal(nextFollowUpLine(row({ nextDueAt: iso(SAT(11, 0)) }), now), 'Next follow-up: Tomorrow 11:00');
    assert.equal(nextFollowUpLine(row({ status: 'new' }), now), 'No follow-up set');
    assert.equal(nextFollowUpLine(row({ status: 'registered' }), now), 'Onboarding has them');
    assert.equal(
      nextFollowUpLine(row({ status: 'registered', nextDueAt: iso(SAT(11, 0)), dueReason: 'check_in' }), now),
      'Next follow-up: Tomorrow 11:00 · check in',
    );
    assert.equal(
      nextFollowUpLine(
        row({ status: 'not_interested', nextDueAt: iso(FRI(10, 0)), closedAt: iso(FRI(14, 5)), closedByName: 'Pawan' }),
        now,
      ),
      'Closed by Pawan · 23 Oct, 14:05',
    );
    assert.equal(
      nextFollowUpLine(row({ status: 'client', closedAt: iso(FRI(14, 5)), closedByName: 'Automatic' }), now),
      'Closed automatically · 23 Oct, 14:05',
    );
  });

  it('leaves the second line out when the sentence above already says it', () => {
    const row = (over: Partial<Pick<LeadRow, 'status' | 'nextDueAt' | 'dueReason' | 'closedAt' | 'closedByName'>>) => ({
      status: 'trying' as LeadRow['status'],
      nextDueAt: null as string | null,
      dueReason: null as LeadRow['dueReason'],
      closedAt: null as string | null,
      closedByName: null as string | null,
      ...over,
    });
    // The server's own sentence for a registered lead says what the line would.
    assert.equal(doNowDetail(row({ status: 'registered' }), 'Registered: Onboarding has them.', now), null);
    // A follow-up a person set: the sentence names who, the line gives the time, once.
    assert.equal(
      doNowDetail(
        row({ nextDueAt: iso(SAT(11, 0)), dueReason: 'scheduled' }),
        'Follow up as planned — Pawan Kumar Singh set the time.',
        now,
      ),
      'Next follow-up: Tomorrow 11:00',
    );
    // A late lead: the time and why, with nothing repeated.
    assert.equal(
      doNowDetail(
        row({ nextDueAt: iso(FRI(10, 0)), dueReason: 'no_answer_retry' }),
        'Try calling again — they did not answer 3 h ago.',
        now,
      ),
      'Overdue 5 h · no answer last time',
    );
    // A closed lead keeps who closed it: the sentence says why, not by whom.
    assert.equal(
      doNowDetail(
        row({ status: 'not_interested', closedAt: iso(FRI(14, 5)), closedByName: 'Pawan' }),
        'Closed: they said they are not interested.',
        now,
      ),
      'Closed by Pawan · 23 Oct, 14:05',
    );
    // Nothing to add when there is no line at all.
    assert.equal(doNowDetail(row({ status: 'registered', nextDueAt: null }), 'Registered: Onboarding has them.', now), null);
  });
});

describe('the drawer: the header, "They" and the film bar', () => {
  const now = FRI(15, 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const watch = (over: Partial<LeadWatch> = {}): LeadWatch => ({
    visits: 1,
    bestSeconds: 750,
    durationSeconds: 1000,
    completed: false,
    soundOn: true,
    devices: 1,
    firstAt: null,
    lastAt: null,
    city: null,
    ...over,
  });

  it('writes the header line as ref, place and since, leaving out what is not known', () => {
    const row = { ref: 'L-0012', place: 'Dhanbad' as string | null, firstSeenAt: iso(THU(19, 48)) };
    assert.equal(drawerSubtitle(row, now), 'L-0012 · Dhanbad · Lead since 22 Oct');
    assert.equal(drawerSubtitle({ ...row, place: null }, now), 'L-0012 · Lead since 22 Oct');
    assert.equal(drawerSubtitle({ ...row, place: '  ' }, now), 'L-0012 · Lead since 22 Oct');
    assert.equal(drawerSubtitle({ ...row, firstSeenAt: 'not a date' }, now), 'L-0012 · Dhanbad');
    // The status is not in it: the badge beside the name says that.
    assert.doesNotMatch(drawerSubtitle(row, now), /talks|Interested|New/);
  });

  it('turns the bar green at 75% or when they watched to the end', () => {
    assert.equal(watchPercent(watch({ bestSeconds: 744 })), 74);
    assert.equal(watchPercent(watch({ bestSeconds: 745 })), 75);
    assert.equal(watchFill(watch({ bestSeconds: 744 })), 'brand');
    assert.equal(watchFill(watch({ bestSeconds: 745 })), 'success');
    assert.equal(watchFill(watch({ bestSeconds: 1000 })), 'success');
    assert.equal(watchFill(watch({ bestSeconds: 100, completed: true })), 'success');
    assert.equal(watchFill(watch({ bestSeconds: 0 })), 'brand');
    assert.equal(watchFill(watch({ durationSeconds: 0 })), 'brand');
    assert.equal(fillOf(74, false), 'brand');
    assert.equal(fillOf(75, false), 'success');
    assert.equal(fillOf(10, true), 'success');
  });

  it('says when they last watched and from where, and nothing when no visit is tied to them', () => {
    assert.equal(
      lastWatchedLine(watch({ lastAt: iso(FRI(14, 40)), city: 'Dhanbad' }), now),
      'Last watched 23 Oct, 14:40 · Dhanbad',
    );
    assert.equal(lastWatchedLine(watch({ lastAt: iso(FRI(14, 40)) }), now), 'Last watched 23 Oct, 14:40');
    assert.equal(lastWatchedLine(watch({ lastAt: iso(FRI(14, 40)), city: '  ' }), now), 'Last watched 23 Oct, 14:40');
    assert.equal(lastWatchedLine(watch({ lastAt: null, city: 'Dhanbad' }), now), null);
  });

  it('says who wrote the newest note and when, with a dot between them', () => {
    assert.equal(noteByLine({ byName: 'Pawan', at: iso(FRI(13, 0)) }, now), 'Pawan · 2 h ago');
    assert.equal(noteByLine({ byName: ' Pawan Kumar Singh ', at: iso(FRI(14, 40)) }, now), 'Pawan Kumar Singh · 20 min ago');
    assert.equal(noteByLine({ byName: null, at: iso(FRI(13, 0)) }, now), '2 h ago');
    assert.equal(noteByLine({ byName: 'Pawan', at: 'not a date' }, now), 'Pawan');
    assert.equal(noteByLine({ byName: '  ', at: 'not a date' }, now), '');
  });

  it('says what they did to reach us, with the sign that goes with it, while it is still news', () => {
    const signs = (over: Partial<LeadSigns> = {}): LeadSigns => ({
      replied: null,
      callMe: null,
      callback: null,
      assistant: null,
      registered: null,
      ...over,
    });
    const contact = (at: number) => ({ at: iso(at), byName: null, channel: 'call' as const, outcome: 'no_answer' as const });
    const tap = { at: iso(FRI(14, 0)), kind: 'call_me' as const };
    assert.deepEqual(
      theyDid({ signs: signs({ callMe: tap.at }), lastSign: tap, lastContact: null }, now),
      { text: 'Tapped "Call me" · 1 h ago', kind: 'call_me', tone: 'warning' },
    );
    // We rang after: it has been dealt with.
    assert.equal(theyDid({ signs: signs({ callMe: tap.at }), lastSign: tap, lastContact: contact(FRI(14, 30)) }, now), null);
    // A reply at ten and watching again at eleven: the reply is the one that needs an answer.
    const watched = { at: iso(FRI(11, 0)), kind: 'watched' as const };
    assert.deepEqual(
      theyDid({ signs: signs({ replied: iso(FRI(10, 0)) }), lastSign: watched, lastContact: null }, now),
      { text: 'Replied on WhatsApp · 5 h ago', kind: 'replied', tone: 'warning' },
    );
    // Watching is not a way of asking, but it is still the newest thing they did, as the old row said.
    assert.deepEqual(
      theyDid({ signs: signs(), lastSign: watched, lastContact: contact(FRI(9, 0)) }, now),
      { text: 'Watched the film · 4 h ago', kind: 'watched', tone: 'info' },
    );
    // Registering is something they did, but nobody is waiting on it: not amber either.
    const registered = { at: iso(FRI(13, 0)), kind: 'registered' as const };
    assert.deepEqual(
      theyDid({ signs: signs({ registered: registered.at }), lastSign: registered, lastContact: null }, now),
      { text: 'Registered their pump · 2 h ago', kind: 'registered', tone: 'info' },
    );
    assert.equal(theyDid({ signs: signs(), lastSign: null, lastContact: null }, now), null);
  });
});

describe('the drawer: who did it', () => {
  const now = SUN(21, 0);
  const item = (at: number, kind: LeadTimelineItem['kind'], over: Partial<LeadTimelineItem> = {}): LeadTimelineItem => ({
    at: new Date(at).toISOString(),
    kind,
    title: kind,
    detail: null,
    by: null,
    href: null,
    ...over,
  });

  it('takes the actor the server sent, and without one goes by kind, never by title', () => {
    for (const actor of LEAD_TIMELINE_ACTORS) {
      assert.equal(timelineActor(item(SUN(20, 0), 'activity', { actor })), actor);
    }
    const byKind: Record<LeadTimelineItem['kind'], 'lead' | 'team' | 'system'> = {
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
    for (const kind of LEAD_TIMELINE_KINDS) {
      assert.equal(timelineActor(item(SUN(20, 0), kind)), byKind[kind], kind);
      // A title that says "Sent" or "Tapped" changes nothing.
      assert.equal(timelineActor(item(SUN(20, 0), kind, { title: 'Tapped "Call me"' })), byKind[kind], kind);
    }
    // The server's word beats the kind: a call-back the team marked called is theirs.
    assert.equal(timelineActor(item(SUN(20, 0), 'callback', { actor: 'team' })), 'team');
    assert.equal(timelineActor(item(SUN(20, 0), 'whatsapp_out', { actor: 'team' })), 'team');
    // A word from a newer server that this screen does not know is not trusted.
    assert.equal(
      timelineActor({ kind: 'activity', actor: 'robot' as unknown as LeadTimelineItem['actor'] }),
      'team',
    );
    assert.equal(timelineActor({ kind: 'telepathy' as LeadTimelineItem['kind'] }), 'system');
  });

  it('is waiting for us when they asked or wrote and nobody has answered since', () => {
    const none = null;
    const spoke = { at: new Date(SUN(20, 0)).toISOString() };
    for (const kind of ['call_me', 'callback', 'whatsapp_in', 'assistant'] as const) {
      assert.equal(isWaitingForUs(item(SUN(20, 4), kind, { actor: 'lead' }), none), true, kind);
      assert.equal(isWaitingForUs(item(SUN(20, 4), kind, { actor: 'lead' }), spoke), true, kind);
      // Before our last contact, or at the same minute, it has been dealt with.
      assert.equal(isWaitingForUs(item(SUN(19, 59), kind, { actor: 'lead' }), spoke), false, kind);
      assert.equal(isWaitingForUs(item(SUN(20, 0), kind, { actor: 'lead' }), spoke), false, kind);
    }
    // Watching and registering are things they did, not asks.
    for (const kind of ['film_visit', 'registration', 'opted_out'] as const) {
      assert.equal(isWaitingForUs(item(SUN(20, 4), kind, { actor: 'lead' }), none), false, kind);
    }
    // Something we did is never waiting for us: the call-back marked called, a message a person sent.
    assert.equal(isWaitingForUs(item(SUN(20, 4), 'callback', { actor: 'team' }), none), false);
    assert.equal(isWaitingForUs(item(SUN(20, 4), 'whatsapp_out', { actor: 'team' }), none), false);
    assert.equal(isWaitingForUs(item(SUN(20, 4), 'activity', { actor: 'team' }), none), false);
    // A server that sends no actor: the kind decides.
    assert.equal(isWaitingForUs(item(SUN(20, 4), 'call_me'), none), true);
    assert.equal(isWaitingForUs(item(SUN(20, 4), 'activity'), none), false);
    // A time that cannot be read is not news.
    assert.equal(isWaitingForUs({ ...item(SUN(20, 4), 'call_me', { actor: 'lead' }), at: 'soon' }, none), false);
  });

  it('gives a screen reader the actor first, and "did not go through" over all of them', () => {
    assert.equal(actorPrefix(item(SUN(20, 4), 'call_me', { actor: 'lead' })), 'They: ');
    assert.equal(actorPrefix(item(SUN(20, 4), 'activity', { actor: 'team' })), 'Team: ');
    assert.equal(actorPrefix(item(SUN(20, 4), 'campaign_sent', { actor: 'system' })), 'Automatic: ');
    assert.equal(actorPrefix(item(SUN(20, 4), 'whatsapp_out', { actor: 'system', failed: true })), 'Did not go through: ');
    // No actor sent: by kind.
    assert.equal(actorPrefix(item(SUN(20, 4), 'film_visit')), 'They: ');
  });

  it('names who on the team did it, and says so when the name was never kept', () => {
    assert.equal(teamName('Pawan Kumar Singh'), 'Pawan Kumar Singh');
    assert.equal(teamName('  Anil '), 'Anil');
    for (const none of [null, undefined, '', '   ']) assert.equal(teamName(none), 'Someone at MDG');
  });

  it('finds the visit a row stands for by its identical start time, and only for a film visit', () => {
    const visit = (at: number): LeadVisit => ({
      at: new Date(at).toISOString(),
      lastAt: new Date(at + 5 * MIN).toISOString(),
      seconds: 1053,
      percent: 66.2,
      completed: false,
      soundOn: true,
      city: 'Dhanbad',
      device: 'iPhone · safari',
      viaLink: true,
    });
    const visits = [visit(SUN(20, 2)), visit(SUN(19, 48))];
    assert.equal(visitOf(item(SUN(19, 48), 'film_visit'), visits), visits[1]);
    assert.equal(visitOf(item(SUN(20, 2), 'film_visit'), visits), visits[0]);
    // A different minute, or another kind of row at the same minute, is not a match.
    assert.equal(visitOf(item(SUN(19, 49), 'film_visit'), visits), null);
    assert.equal(visitOf(item(SUN(19, 48), 'call_me'), visits), null);
    assert.equal(visitOf(item(SUN(19, 48), 'film_visit'), []), null);
  });

  it('draws one visit: a whole percent, and what sound, city, device and link it came with', () => {
    assert.equal(visitPercent({ percent: 66.2, completed: false }), 66);
    assert.equal(visitPercent({ percent: 66.5, completed: false }), 67);
    assert.equal(visitPercent({ percent: 40, completed: true }), 100);
    assert.equal(visitPercent({ percent: 140, completed: false }), 100);
    assert.equal(visitPercent({ percent: -4, completed: false }), 0);
    assert.equal(visitPercent({ percent: Number.NaN, completed: false }), 0);

    const v = { soundOn: true, city: 'Dhanbad', device: 'iPhone · safari', viaLink: true };
    assert.equal(visitMeta(v), 'sound on · Dhanbad · iPhone · safari');
    assert.equal(visitMeta({ ...v, soundOn: false }), 'sound off · Dhanbad · iPhone · safari');
    assert.equal(
      visitMeta({ ...v, viaLink: false }),
      'sound on · Dhanbad · iPhone · safari · opened later, without the link',
    );
    assert.equal(visitMeta({ soundOn: true, city: null, device: null, viaLink: true }), 'sound on');
    assert.equal(visitMeta({ soundOn: false, city: ' ', device: null, viaLink: false }), 'sound off · opened later, without the link');
  });
});

describe('the drawer: the timeline as days', () => {
  const now = SUN(21, 0);
  const item = (at: number, kind: LeadTimelineItem['kind'], over: Partial<LeadTimelineItem> = {}): LeadTimelineItem => ({
    at: new Date(at).toISOString(),
    kind,
    title: kind,
    detail: null,
    by: null,
    href: null,
    ...over,
  });
  const iso = (ms: number) => new Date(ms).toISOString();

  it('clocks a time in India, and not in the browser’s zone', () => {
    assert.equal(clockOf(iso(SUN(20, 4))), '20:04');
    assert.equal(clockOf(iso(SUN(0, 0))), '00:00');
    assert.equal(clockOf('2026-10-24T18:30:00.000Z'), '00:00');
    assert.equal(clockOf('2026-10-24T18:29:59.000Z'), '23:59');
    assert.equal(clockOf('2026-10-25T13:31:00Z'), '19:01');
    assert.equal(clockOf('not a date'), '');
    assert.equal(clockOf(''), '');
  });

  it('heads a day by the India calendar: today, yesterday, then the weekday', () => {
    assert.equal(dayHeading(iso(SUN(20, 4)), now), 'Today · 25 Oct');
    // The day turns at India midnight, which is 18:30 UTC.
    assert.equal(dayHeading('2026-10-24T18:30:00.000Z', now), 'Today · 25 Oct');
    assert.equal(dayHeading('2026-10-24T18:29:59.000Z', now), 'Yesterday · 24 Oct');
    assert.equal(dayHeading(iso(SAT(0, 0)), now), 'Yesterday · 24 Oct');
    assert.equal(dayHeading(iso(FRI(23, 59)), now), 'Fri 23 Oct');
    assert.equal(dayHeading(iso(ist(2026, 10, 21, 12)), now), 'Wed 21 Oct');
    // Just past midnight, it is a new day for the one asking too.
    assert.equal(dayHeading(iso(SUN(23, 59)), MON(0, 1)), 'Yesterday · 25 Oct');
    assert.equal(dayHeading(iso(SUN(23, 59)), SUN(23, 59)), 'Today · 25 Oct');
  });

  it('adds the year once it is not this year', () => {
    assert.equal(dayHeading(iso(ist(2025, 11, 3, 10)), now), 'Mon 3 Nov 2025');
    assert.equal(dayHeading(iso(ist(2025, 12, 31, 23, 59)), ist(2026, 1, 2, 10)), 'Wed 31 Dec 2025');
    // "Yesterday" across New Year still says which year it was.
    assert.equal(dayHeading(iso(ist(2025, 12, 31, 23, 59)), ist(2026, 1, 1, 10)), 'Yesterday · 31 Dec 2025');
    assert.equal(dayHeading('soon', now), '');
  });

  /** The owner's own lead, as the drawer showed it on 25 Oct, newest first. */
  const sample = (): LeadTimelineItem[] => [
    item(SUN(20, 39), 'activity', { title: 'Set a follow-up for tomorrow at 11:00', by: 'Pawan Kumar Singh', actor: 'team' }),
    item(SUN(20, 4), 'whatsapp_out', { title: 'Sent a WhatsApp message', by: 'Automatic', actor: 'system' }),
    item(SUN(20, 4), 'call_me', { title: 'Tapped "Call me" under the film invite', actor: 'lead' }),
    item(SUN(20, 2), 'film_visit', { actor: 'lead' }),
    item(SUN(19, 48), 'film_visit', { actor: 'lead' }),
    item(SUN(19, 39), 'campaign_sent', { title: 'Film invite read', by: 'Automatic', actor: 'system' }),
    item(SUN(19, 39), 'campaign_sent', { title: 'Film invite delivered', by: 'Automatic', actor: 'system' }),
    item(SUN(19, 39), 'campaign_sent', { title: 'Film invite sent', by: 'Automatic', actor: 'system' }),
    item(SUN(19, 25), 'whatsapp_out', {
      title: 'A WhatsApp message could not be delivered',
      by: 'Automatic',
      actor: 'system',
      failed: true,
    }),
  ];

  it('folds sent, delivered and read into one row, newest first, and leaves the rest as they are', () => {
    const days = storyRows(sample(), now);
    assert.equal(days.length, 1);
    assert.equal(days[0]!.heading, 'Today · 25 Oct');
    assert.deepEqual(
      days[0]!.rows.map((r) => r.type),
      ['item', 'item', 'item', 'item', 'item', 'fold', 'item'],
    );
    const fold = days[0]!.rows[5]!;
    assert.equal(fold.type, 'fold');
    if (fold.type === 'fold') {
      assert.deepEqual(
        fold.items.map((i) => i.title),
        ['Film invite read', 'Film invite delivered', 'Film invite sent'],
      );
      assert.equal(foldLine(fold.items), 'Film invite read · 2 earlier steps');
    }
    // Nine things happened and seven lines say so.
    assert.equal(rowCount(days), 7);
  });

  it('never folds a step that did not go through, and does not fold one on its own', () => {
    const items = [
      item(SUN(19, 40), 'campaign_sent', { title: 'Film invite read', actor: 'system' }),
      item(SUN(19, 39), 'campaign_sent', { title: 'The film invite did not reach them', actor: 'system', failed: true }),
      item(SUN(19, 38), 'campaign_sent', { title: 'Film invite delivered', actor: 'system' }),
      item(SUN(19, 37), 'campaign_sent', { title: 'Film invite sent', actor: 'system' }),
      item(SUN(19, 30), 'campaign_sent', { title: 'The film invite could not be sent', actor: 'system', failed: true }),
    ];
    const rows = storyRows(items, now)[0]!.rows;
    assert.deepEqual(
      rows.map((r) => (r.type === 'fold' ? `fold ${r.items.length}` : `item ${r.item.title}`)),
      [
        'item Film invite read',
        'item The film invite did not reach them',
        'fold 2',
        'item The film invite could not be sent',
      ],
    );
    // Two steps that went through and a failure between them are not one run.
    const split = storyRows(
      [
        item(SUN(19, 40), 'campaign_sent', { actor: 'system' }),
        item(SUN(19, 39), 'campaign_sent', { actor: 'system', failed: true }),
        item(SUN(19, 38), 'campaign_sent', { actor: 'system' }),
      ],
      now,
    )[0]!.rows;
    assert.deepEqual(split.map((r) => r.type), ['item', 'item', 'item']);
    // Something else between two steps breaks the run too.
    const apart = storyRows(
      [
        item(SUN(19, 40), 'campaign_sent', { actor: 'system' }),
        item(SUN(19, 39), 'call_me', { actor: 'lead' }),
        item(SUN(19, 38), 'campaign_sent', { actor: 'system' }),
      ],
      now,
    )[0]!.rows;
    assert.deepEqual(apart.map((r) => r.type), ['item', 'item', 'item']);
  });

  it('cuts the story into India days and never folds across midnight', () => {
    const items = [
      item(MON(0, 10), 'call_me', { actor: 'lead' }),
      item(SUN(23, 58), 'campaign_sent', { title: 'Film invite read', actor: 'system' }),
      item(SUN(23, 57), 'campaign_sent', { title: 'Film invite delivered', actor: 'system' }),
      item(SUN(0, 3), 'campaign_sent', { title: 'Film invite sent', actor: 'system' }),
      item(SAT(23, 59), 'campaign_sent', { title: 'Film invite sent earlier', actor: 'system' }),
      item(FRI(12, 0), 'film_visit', { actor: 'lead' }),
    ];
    const days = storyRows(items, MON(9, 0));
    assert.deepEqual(
      days.map((d) => [d.heading, d.rows.map((r) => (r.type === 'fold' ? `fold ${r.items.length}` : 'item'))]),
      [
        ['Today · 26 Oct', ['item']],
        ['Yesterday · 25 Oct', ['fold 3']],
        ['Sat 24 Oct', ['item']],
        ['Fri 23 Oct', ['item']],
      ],
    );
    assert.deepEqual(storyRows([], now), []);
  });

  it('counts a day cut part way by its rows, keeps its heading, and says how many rows were left out', () => {
    const days = storyRows(
      [
        item(SUN(20, 39), 'activity', { actor: 'team' }),
        item(SUN(20, 4), 'call_me', { actor: 'lead' }),
        item(SUN(19, 40), 'campaign_sent', { title: 'read', actor: 'system' }),
        item(SUN(19, 39), 'campaign_sent', { title: 'sent', actor: 'system' }),
        item(SAT(12, 0), 'activity', { actor: 'team' }),
        item(SAT(11, 0), 'film_visit', { actor: 'lead' }),
        item(FRI(10, 0), 'film_visit', { actor: 'lead' }),
      ],
      now,
    );
    // Today: activity, call me, one fold. Yesterday: two rows. Fri: one row.
    assert.equal(rowCount(days), 6);
    const rowsOf = (cut: { days: { heading: string; rows: unknown[] }[]; hidden: number }) => ({
      shape: cut.days.map((d) => [d.heading, d.rows.length]),
      hidden: cut.hidden,
    });
    assert.deepEqual(rowsOf(firstRows(days, 10)), {
      shape: [['Today · 25 Oct', 3], ['Yesterday · 24 Oct', 2], ['Fri 23 Oct', 1]],
      hidden: 0,
    });
    assert.deepEqual(rowsOf(firstRows(days, 6)), {
      shape: [['Today · 25 Oct', 3], ['Yesterday · 24 Oct', 2], ['Fri 23 Oct', 1]],
      hidden: 0,
    });
    assert.deepEqual(rowsOf(firstRows(days, 5)), {
      shape: [['Today · 25 Oct', 3], ['Yesterday · 24 Oct', 2]],
      hidden: 1,
    });
    // Cut in the middle of a day: the heading stays with the rows that are left.
    assert.deepEqual(rowsOf(firstRows(days, 4)), {
      shape: [['Today · 25 Oct', 3], ['Yesterday · 24 Oct', 1]],
      hidden: 2,
    });
    assert.deepEqual(rowsOf(firstRows(days, 2)), { shape: [['Today · 25 Oct', 2]], hidden: 4 });
    // A day cut away whole takes its heading with it.
    assert.deepEqual(rowsOf(firstRows(days, 0)), { shape: [], hidden: 6 });
    assert.deepEqual(rowsOf(firstRows(days, -3)), { shape: [], hidden: 6 });
    assert.deepEqual(rowsOf(firstRows([], 10)), { shape: [], hidden: 0 });
    // What is kept is the same rows, not copies of other ones.
    assert.equal(firstRows(days, 4).days[0]!.rows[2], days[0]!.rows[2]);
  });

  it('counts a fold as one row however many steps it holds', () => {
    const items: LeadTimelineItem[] = [];
    for (let i = 0; i < 8; i += 1) {
      items.push(item(SUN(20, 50 - i * 5), 'campaign_sent', { actor: 'system' }));
    }
    items.push(item(SUN(10, 0), 'call_me', { actor: 'lead' }));
    items.push(item(SUN(9, 0), 'activity', { actor: 'team' }));
    const days = storyRows(items, now);
    assert.equal(rowCount(days), 3);
    assert.equal(firstRows(days, 10).hidden, 0);
  });

  it('words a fold of two as "1 earlier step"', () => {
    assert.equal(
      foldLine([
        item(SUN(19, 40), 'campaign_sent', { title: 'Film invite delivered' }),
        item(SUN(19, 39), 'campaign_sent', { title: 'Film invite sent' }),
      ]),
      'Film invite delivered · 1 earlier step',
    );
  });
});
