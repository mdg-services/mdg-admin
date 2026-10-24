/**
 * Checks for the Leads page's rules (`src/lib/leads.ts`): the words, the
 * working window, the follow-up the contact form suggests, and that every body
 * a form builds is one the shared schema accepts.
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
  LEAD_NOTE_MAX,
  addLeadPhoneSchema,
  assignLeadSchema,
  closeLeadSchema,
  leadNoteSchema,
  logLeadContactSchema,
  reopenLeadSchema,
  setLeadFollowUpSchema,
} from '../shared/src/schemas/lead';
import {
  LEAD_ACTIVITY_KINDS,
  LEAD_ADMIN_CLOSE_REASONS,
  LEAD_CLOSING_OUTCOMES,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_CONTACT_OUTCOME_LABELS,
  LEAD_DUE_REASONS,
  LEAD_ORIGINS,
  LEAD_SIGN_KINDS,
  LEAD_SIGN_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_VIEWS,
  type LeadActivity,
  type LeadContactOutcome,
  type LeadWatch,
} from '../shared/src/types/lead';
import {
  CLOSE_HINTS,
  CLOSING_OUTCOMES,
  DUE_REASON_LABELS,
  FOLLOW_UP_MAX_DAYS,
  LEAD_VIEW_LABELS,
  NOTE_MAX,
  OPEN_OUTCOMES,
  OUTCOME_HINTS,
  STATUS_TONE,
  activityLine,
  addWorkingHours,
  agoWords,
  assignBody,
  canReopen,
  chatHref,
  clockWords,
  closeBody,
  closeProblem,
  closedLine,
  closesLead,
  contactBody,
  contactProblem,
  devicesNote,
  dueLine,
  durationWords,
  followUpBody,
  followUpGuide,
  followUpProblem,
  funnelSteps,
  idFromParam,
  inTalksCount,
  inWindow,
  isClosed,
  lastContactLine,
  leadHref,
  leadName,
  lookupLine,
  mobileTen,
  moveIntoWindow,
  nextWindowStart,
  noteBody,
  noteProblem,
  originText,
  ownerLine,
  parseWhen,
  phoneBody,
  phoneProblem,
  quickPicks,
  registrationWords,
  reminderLine,
  reopenBody,
  reopenProblem,
  signLine,
  statusLabel,
  suggestNextAt,
  unansweredAfter,
  viewFromParam,
  viewLabel,
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

  it('every origin and every kind of log entry reads as a line', () => {
    for (const origin of LEAD_ORIGINS) assert.ok(originText({ origin, linkLabel: null }).length > 0, origin);
    for (const kind of LEAD_ACTIVITY_KINDS) {
      const a: LeadActivity = {
        id: 'a',
        at: '2026-10-24T05:00:00.000Z',
        kind,
        byName: 'Aryan',
        channel: kind === 'contact' ? 'call' : null,
        outcome: kind === 'contact' ? 'no_answer' : null,
        note: null,
        nextAt: kind === 'follow_up' ? '2026-10-25T05:00:00.000Z' : null,
        reason: kind === 'closed' ? 'not_interested' : null,
        ownerName: kind === 'assigned' ? 'Anjali' : null,
      };
      assert.ok(activityLine(a, SAT(12)).length > 0, kind);
    }
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
  });
});

describe('the working window: 09:00 to 20:00 India time, Monday to Saturday', () => {
  it('is open from 09:00 up to but not including 20:00', () => {
    assert.equal(inWindow(MON(8, 59)), false);
    assert.equal(inWindow(MON(9, 0)), true);
    assert.equal(inWindow(MON(19, 59)), true);
    assert.equal(inWindow(MON(20, 0)), false);
    assert.equal(inWindow(MON(23, 59)), false);
    assert.equal(inWindow(MON(0, 0)), false);
  });

  it('is open on a Saturday and closed all of Sunday', () => {
    assert.equal(inWindow(SAT(9, 0)), true);
    assert.equal(inWindow(SAT(19, 59)), true);
    assert.equal(inWindow(SUN(9, 0)), false);
    assert.equal(inWindow(SUN(12, 0)), false);
  });

  it('reads the day in India, not in UTC', () => {
    // 04:00 UTC is 09:30 in India: open. 15:00 UTC is 20:30 in India: closed.
    assert.equal(inWindow(Date.UTC(2026, 9, 26, 4, 0)), true);
    assert.equal(inWindow(Date.UTC(2026, 9, 26, 15, 0)), false);
  });

  it('the next opening is strictly after the moment asked about', () => {
    assert.equal(nextWindowStart(MON(8, 0)), MON(9, 0));
    assert.equal(nextWindowStart(MON(9, 0)), TUE(9, 0));
    assert.equal(nextWindowStart(MON(12, 0)), TUE(9, 0));
    assert.equal(nextWindowStart(MON(20, 0)), TUE(9, 0));
    assert.equal(nextWindowStart(SAT(12, 0)), MON(9, 0));
    assert.equal(nextWindowStart(SUN(3, 0)), MON(9, 0));
    assert.equal(nextWindowStart(SUN(23, 0)), MON(9, 0));
  });

  it('a time inside the window stays put; any other moves to the next morning', () => {
    assert.equal(moveIntoWindow(MON(12, 30)), MON(12, 30));
    assert.equal(moveIntoWindow(MON(20, 0)), TUE(9, 0));
    assert.equal(moveIntoWindow(MON(5, 0)), MON(9, 0));
    assert.equal(moveIntoWindow(SAT(21, 0)), MON(9, 0));
    assert.equal(moveIntoWindow(SUN(10, 0)), MON(9, 0));
  });

  it('counts working hours only, across a night and a Sunday', () => {
    assert.equal(addWorkingHours(FRI(10, 15), 4), FRI(14, 15));
    // 1 h 30 left on Friday, the other 2 h 30 after the window opens on Saturday.
    assert.equal(addWorkingHours(FRI(18, 30), 4), SAT(11, 30));
    // Saturday 19:00: 1 h left, then Sunday is skipped, 3 h on Monday.
    assert.equal(addWorkingHours(SAT(19, 0), 4), MON(12, 0));
    // Counting starts when the window opens, not at midnight.
    assert.equal(addWorkingHours(THU(20, 41), 2), FRI(11, 0));
    assert.equal(addWorkingHours(SUN(3, 0), 2), MON(11, 0));
  });

  it('can end exactly when the window closes, which then moves to the next morning', () => {
    assert.equal(addWorkingHours(FRI(18, 0), 2), FRI(20, 0));
    assert.equal(moveIntoWindow(addWorkingHours(FRI(18, 0), 2)), SAT(9, 0));
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

  it('after no answer: 4 working hours, then 24 h, 48 h, 72 h, a week', () => {
    assert.equal(suggestNextAt('no_answer', 1, now), MON(14, 0));
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

  it('is always inside the working window and always later than now', () => {
    // Every 37 minutes for two weeks, so every hour of the day and every weekday is tried.
    for (let t = THU(0, 0); t < THU(0, 0) + 14 * DAY; t += 37 * MIN) {
      for (const o of LEAD_CONTACT_OUTCOMES) {
        for (const n of [1, 2, 3, 5, 8]) {
          const at = suggestNextAt(o as LeadContactOutcome, n, t);
          if (at === null) continue;
          assert.ok(inWindow(at), `${o} ${n} from ${new Date(t).toISOString()}`);
          assert.ok(at > t, `${o} ${n} from ${new Date(t).toISOString()}`);
        }
      }
    }
  });

  it('moves a 24 h follow-up that lands on a Sunday to Monday morning', () => {
    assert.equal(suggestNextAt('interested', 0, SAT(15, 0)), MON(9, 0));
    assert.equal(suggestNextAt('message_sent', 1, SAT(21, 0)), MON(9, 0));
  });

  it('follows the worked example from the spec', () => {
    // Aryan calls Friday 10:15, no answer: due Friday 14:15.
    assert.equal(suggestNextAt('no_answer', 1, FRI(10, 15)), FRI(14, 15));
    // Calls 14:30, no answer again (2 in a row): due Saturday 14:30.
    assert.equal(suggestNextAt('no_answer', 2, FRI(14, 30)), SAT(14, 30));
    // Monday 09:20: spoke, thinking: due Wednesday 09:20.
    assert.equal(suggestNextAt('thinking', 0, MON(9, 20)), WED(9, 20));
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
    assert.equal(originText({ origin: 'campaign', linkLabel: null }), 'WhatsApp film invite');
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
    // A call-back from the film page with no visit tied to them is not "watched 0:00".
    assert.equal(
      watchLine(watch({ visits: 0, bestSeconds: 0 })),
      'Was on the film page; no visit we can tie to them',
    );
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
    assert.equal(chatHref('919876543210'), '/whatsapp?chat=919876543210');
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

  it('offers in two hours, tomorrow 11:00 and Monday 11:00, and leaves out what we would not remind on', () => {
    const labels = (now: number) => quickPicks(now).map((p) => p.label);
    // Monday: tomorrow is Tuesday; "Monday" is a week away.
    assert.deepEqual(labels(MON(10, 0)), ['In 2 hours', 'Tomorrow 11:00', 'Monday 11:00']);
    assert.equal(quickPicks(MON(10, 0))[1]?.at, TUE(11, 0));
    assert.equal(quickPicks(MON(10, 0))[2]?.at, ist(2026, 11, 2, 11, 0));
    // Friday: Saturday is a working day; Monday follows.
    assert.deepEqual(labels(FRI(10, 0)), ['In 2 hours', 'Tomorrow 11:00', 'Monday 11:00']);
    assert.equal(quickPicks(FRI(10, 0))[2]?.at, MON(11, 0));
    // Saturday: tomorrow is Sunday, so only the Monday one is offered.
    assert.deepEqual(labels(SAT(10, 0)), ['In 2 hours', 'Monday 11:00']);
    // Sunday: tomorrow IS Monday, so it is not offered twice.
    assert.deepEqual(labels(SUN(10, 0)), ['In 2 hours', 'Tomorrow 11:00']);
    assert.equal(quickPicks(SUN(10, 0))[1]?.at, MON(11, 0));
    assert.equal(quickPicks(MON(10, 0))[0]?.at, MON(12, 0));
  });

  it('every pick is a follow-up the server would take', () => {
    for (let t = THU(0, 0); t < THU(0, 0) + 8 * DAY; t += 53 * MIN) {
      for (const p of quickPicks(t)) {
        const { date, time } = whenInput(p.at);
        assert.equal(followUpProblem({ date, time, note: '' }, t), null, `${p.label} from ${new Date(t).toISOString()}`);
      }
    }
  });

  it('says when the reminder will really come', () => {
    const now = MON(10, 0);
    assert.equal(reminderLine(TUE(11, 0), now), 'Reminder: Tomorrow 11:00.');
    assert.match(reminderLine(MON(21, 0), now), /^Reminder: Tomorrow 09:00\. We only remind between 09:00 and 20:00, Monday to Saturday\.$/);
    // A Sunday time is shown at Monday's opening, named by its weekday from Friday.
    assert.match(reminderLine(SUN(12, 0), FRI(10, 0)), /^Reminder: Mon 09:00\. We only remind/);
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
});

describe('"How follow-ups work"', () => {
  it('is built from the same steps the suggestion uses', () => {
    const rows = followUpGuide();
    const text = rows.map((r) => `${r.when} ${r.then}`).join('\n');
    assert.ok(rows.length >= 6);
    for (const r of rows) {
      assert.ok(r.when.length > 0 && r.then.length > 0);
    }
    assert.match(text, /4 working hours later, then the next day, then 2 days later, then 3 days later, then a week later/);
    assert.match(text, /the next day, then 2 days later, then 3 days later, then a week later/);
  });
});
