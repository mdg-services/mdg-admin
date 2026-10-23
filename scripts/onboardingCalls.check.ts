/**
 * Checks for the call log and follow-up lines (`src/lib/onboardingCalls.ts`), and
 * that every body the form builds is one the shared schema accepts.
 *
 *   cd mdg-admin && npm run check:onboarding-calls
 *
 * which is `npx tsx --test scripts/onboardingCalls.check.ts`. The schema is
 * imported from source by relative path, as `onboarding.check.ts` does, because
 * `@dk/shared` resolves to its compiled `dist/` outside Vite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logSetupCallSchema } from '../shared/src/schemas/outletSetup';
import { SETUP_CALL_OUTCOMES, type SetupCall } from '../shared/src/types/outletSetup';
import {
  CALL_NOTE_MAX,
  CALL_OUTCOMES,
  callBody,
  callDay,
  callLine,
  callProblem,
  istDayTime,
  lastCallLine,
  notMeLine,
  offersClose,
  reminderLine,
} from '../src/lib/onboardingCalls';

const TODAY = '2026-10-23';

describe('what a call can be', () => {
  it('offers exactly the outcomes the server takes, each with a hint', () => {
    assert.deepEqual(
      CALL_OUTCOMES.map((o) => o.value),
      [...SETUP_CALL_OUTCOMES],
    );
    for (const o of CALL_OUTCOMES) {
      assert.ok(o.label.length > 0);
      assert.ok(o.hint.length > 0);
    }
  });

  it('only "not interested" offers to close the onboarding', () => {
    assert.equal(offersClose('not_interested'), true);
    for (const o of ['answered', 'no_answer', 'call_later'] as const)
      assert.equal(offersClose(o), false);
  });
});

describe('the form', () => {
  it('needs an outcome', () => {
    assert.match(
      callProblem({ outcome: '', note: '', nextCallOn: '' }, TODAY) ?? '',
      /Pick what came/,
    );
    assert.match(
      callProblem({ outcome: 'maybe', note: '', nextCallOn: '' }, TODAY) ?? '',
      /Pick what came/,
    );
  });

  it('"call later" needs a real day after today, and nothing else needs one', () => {
    assert.match(
      callProblem({ outcome: 'call_later', note: '', nextCallOn: '' }, TODAY) ?? '',
      /Pick the day/,
    );
    assert.match(
      callProblem({ outcome: 'call_later', note: '', nextCallOn: '2026-02-30' }, TODAY) ?? '',
      /Pick the day/,
    );
    assert.match(
      callProblem({ outcome: 'call_later', note: '', nextCallOn: TODAY }, TODAY) ?? '',
      /after today/,
    );
    assert.equal(
      callProblem({ outcome: 'call_later', note: '', nextCallOn: '2026-10-24' }, TODAY),
      null,
    );
    for (const outcome of ['answered', 'no_answer', 'not_interested']) {
      assert.equal(callProblem({ outcome, note: '', nextCallOn: '' }, TODAY), null);
    }
  });

  it("keeps the note under the server's limit, judged on the trimmed text", () => {
    const fits = 'x'.repeat(CALL_NOTE_MAX);
    assert.equal(
      callProblem({ outcome: 'answered', note: `  ${fits}  `, nextCallOn: '' }, TODAY),
      null,
    );
    assert.match(
      callProblem({ outcome: 'answered', note: `${fits}y`, nextCallOn: '' }, TODAY) ?? '',
      /under 300/,
    );
  });

  it('builds a body the schema accepts, with the note and the date only when they mean something', () => {
    const answered = callBody({
      outcome: 'answered',
      note: '  will pay Monday  ',
      nextCallOn: '2026-11-02',
    });
    assert.deepEqual(answered, { outcome: 'answered', note: 'will pay Monday' });
    assert.equal(logSetupCallSchema.safeParse(answered).success, true);

    const later = callBody({ outcome: 'call_later', note: '', nextCallOn: '2026-11-02' });
    assert.deepEqual(later, { outcome: 'call_later', nextCallOn: '2026-11-02' });
    assert.equal(logSetupCallSchema.safeParse(later).success, true);

    for (const outcome of SETUP_CALL_OUTCOMES) {
      const body = callBody({
        outcome,
        note: 'n',
        nextCallOn: outcome === 'call_later' ? '2026-11-02' : '',
      });
      assert.equal(logSetupCallSchema.safeParse(body).success, true, outcome);
    }
  });
});

describe('words', () => {
  const call = (over: Partial<SetupCall> = {}): SetupCall => ({
    at: '2026-10-25T04:50:00.000Z', // 10:20 in India
    byName: 'Anjali',
    outcome: 'answered',
    note: null,
    nextCallOn: null,
    ...over,
  });

  it('reads times in India, in one short form', () => {
    assert.equal(istDayTime('2026-10-25T04:50:00.000Z'), '25 Oct 10:20');
    assert.equal(istDayTime('2026-10-25T20:00:00.000Z'), '26 Oct 01:30'); // past midnight in India
    assert.equal(istDayTime(null), '');
    assert.equal(istDayTime('not a time'), '');
    assert.equal(callDay('2026-11-02'), '2 Nov');
    assert.equal(callDay('soon'), 'soon');
    assert.equal(callDay(null), '');
  });

  it('puts a call on one line', () => {
    assert.equal(callLine(call()), 'Answered · Anjali · 25 Oct 10:20');
    assert.equal(
      callLine(call({ outcome: 'call_later', nextCallOn: '2026-11-02' })),
      'Call later · Anjali · 25 Oct 10:20 · call again 2 Nov',
    );
    assert.equal(
      callLine(call({ outcome: 'no_answer', byName: 'MDG' })),
      'No answer · MDG · 25 Oct 10:20',
    );
  });

  it('says what the last call was on the board, and nothing when there was none', () => {
    assert.equal(lastCallLine(null), '');
    assert.equal(
      lastCallLine(call({ outcome: 'no_answer' })),
      'Last call: no answer, 25 Oct 10:20',
    );
    assert.equal(
      lastCallLine(call({ outcome: 'call_later', nextCallOn: '2026-11-02' })),
      'Last call: call later, 25 Oct 10:20, again 2 Nov',
    );
  });

  it("says how many reminders went and when the next is due — only while the move is the dealer's", () => {
    const next = '2026-10-25T04:30:00.000Z'; // 10:00 in India
    assert.equal(
      reminderLine({ sent: 2, nextAt: next }, 'dealer'),
      'Reminded 2× · next 25 Oct 10:00',
    );
    assert.equal(
      reminderLine({ sent: 0, nextAt: next }, 'dealer'),
      'No reminder yet · first one 25 Oct 10:00',
    );
    assert.equal(
      reminderLine({ sent: 3, nextAt: null }, 'dealer'),
      'Reminded 3× · no more to send',
    );
    assert.equal(reminderLine({ sent: 1, nextAt: null }, 'dealer'), 'Reminded 1×');
    assert.equal(reminderLine({ sent: 0, nextAt: null }, 'dealer'), '');
    assert.equal(reminderLine({ sent: 2, nextAt: next }, 'mdg'), '');
    assert.equal(reminderLine({ sent: 2, nextAt: next }, 'nobody'), '');
  });

  it('says plainly that somebody disowned the registration', () => {
    assert.equal(notMeLine({ notMe: null }), '');
    assert.match(
      notMeLine({ notMe: { at: '2026-10-25T04:50:00.000Z' } }),
      /replied NO to the welcome on 25 Oct 10:20.*sign-in is switched off.*super-admin/,
    );
  });
});
