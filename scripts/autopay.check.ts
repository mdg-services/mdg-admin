/**
 * Checks for the decisions behind the Autopay section of an outlet's Setup card
 * (`src/lib/autopay.ts`): the chip's words and colour for each state, which buttons
 * a state allows, what the confirm and the status line say, how long a note may be
 * (and that it agrees with the shared schemas it is sent through), and how an
 * ended autopay and the call after it read. Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npm run check:autopay
 *
 * Like the other check scripts it sits outside `src/` on purpose: the build
 * type-checks `src/`, and a test import there would break a standalone build.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { autopayFollowUpSchema, stopAutopayAdminSchema } from '../shared/src/schemas/autopay';
import {
  AUTOPAY_ENDED_BY,
  AUTOPAY_VIEW_STATES,
  type AdminAutopay,
} from '../shared/src/types/autopay';
import {
  AUTOPAY_FOLLOW_UP_MAX,
  AUTOPAY_FOLLOW_UP_MIN,
  AUTOPAY_STATE_INTENT,
  AUTOPAY_STATE_LABEL,
  AUTOPAY_STOP_NOTE_MAX,
  AUTOPAY_STOP_NOTE_MIN,
  canStopAutopay,
  endedByDetail,
  failedText,
  followUpLine,
  followUpNoteProblem,
  modeBadge,
  monthsTakenLine,
  needsFollowUp,
  newestEndedFirst,
  refreshOutcome,
  sentToLine,
  shortDay,
  startConfirmWords,
  startedToast,
  stateHint,
  statusFacts,
  stopNoteProblem,
} from '../src/lib/autopay';

const TODAY = '2026-10-25';

describe('the chip', () => {
  it('has words and a colour for every state the server can answer', () => {
    for (const s of AUTOPAY_VIEW_STATES) {
      assert.ok(AUTOPAY_STATE_LABEL[s], s);
      assert.ok(AUTOPAY_STATE_INTENT[s], s);
    }
  });

  it('says what the brief says', () => {
    assert.equal(AUTOPAY_STATE_LABEL.setting_up, 'Waiting for approval');
    assert.equal(AUTOPAY_STATE_LABEL.on, 'On');
    assert.equal(AUTOPAY_STATE_LABEL.failing, 'Debit failing, retrying');
    assert.equal(AUTOPAY_STATE_LABEL.off, 'Off');
  });

  it('is amber while waiting, green when on, red when failing', () => {
    assert.equal(AUTOPAY_STATE_INTENT.setting_up, 'warning');
    assert.equal(AUTOPAY_STATE_INTENT.on, 'success');
    assert.equal(AUTOPAY_STATE_INTENT.failing, 'danger');
    assert.equal(AUTOPAY_STATE_INTENT.off, 'neutral');
  });

  it('marks test money so nobody mistakes it for real money', () => {
    assert.deepEqual(modeBadge('test'), { text: 'Test mode', intent: 'warning' });
    assert.deepEqual(modeBadge('live'), { text: 'Live', intent: 'neutral' });
  });
});

describe('which buttons', () => {
  it('stops only what is not already off', () => {
    assert.equal(canStopAutopay({ state: 'setting_up' }), true);
    assert.equal(canStopAutopay({ state: 'on' }), true);
    assert.equal(canStopAutopay({ state: 'failing' }), true);
    assert.equal(canStopAutopay({ state: 'off' }), false);
  });

  it('owes a call after a stop the owner, their UPI app or Razorpay made, until one is logged', () => {
    const none = null;
    const call = { doneAt: '2026-10-26T05:30:00.000Z', byName: 'Asha', note: 'Will pay by hand' };
    for (const endedBy of ['dealer', 'upi_app', 'halted'] as const) {
      assert.equal(needsFollowUp({ endedBy, followUp: none }), true, endedBy);
      assert.equal(needsFollowUp({ endedBy, followUp: call }), false, endedBy);
    }
  });

  it('owes no call after the other ways it ends, or while it has not ended', () => {
    for (const endedBy of ['admin', 'expired', 'completed'] as const) {
      assert.equal(needsFollowUp({ endedBy, followUp: null }), false, endedBy);
    }
    assert.equal(needsFollowUp({ endedBy: null, followUp: null }), false);
  });

  it('knows every way an autopay can end', () => {
    // A new way to end must be decided on here: does it owe the owner a call?
    assert.deepEqual([...AUTOPAY_ENDED_BY].sort(), [
      'admin',
      'completed',
      'dealer',
      'expired',
      'halted',
      'upi_app',
    ]);
  });
});

describe('notes', () => {
  it('mirror the shared schemas', () => {
    const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, note: string) =>
      schema.safeParse({ note }).success;
    assert.equal(ok(stopAutopayAdminSchema, 'a'.repeat(AUTOPAY_STOP_NOTE_MIN - 1)), false);
    assert.equal(ok(stopAutopayAdminSchema, 'a'.repeat(AUTOPAY_STOP_NOTE_MIN)), true);
    assert.equal(ok(stopAutopayAdminSchema, 'a'.repeat(AUTOPAY_STOP_NOTE_MAX)), true);
    assert.equal(ok(stopAutopayAdminSchema, 'a'.repeat(AUTOPAY_STOP_NOTE_MAX + 1)), false);
    assert.equal(ok(autopayFollowUpSchema, 'a'.repeat(AUTOPAY_FOLLOW_UP_MIN - 1)), false);
    assert.equal(ok(autopayFollowUpSchema, 'a'.repeat(AUTOPAY_FOLLOW_UP_MIN)), true);
    assert.equal(ok(autopayFollowUpSchema, 'a'.repeat(AUTOPAY_FOLLOW_UP_MAX)), true);
    assert.equal(ok(autopayFollowUpSchema, 'a'.repeat(AUTOPAY_FOLLOW_UP_MAX + 1)), false);
  });

  it('asks for the stop note, and says what it should hold', () => {
    assert.match(stopNoteProblem('') ?? '', /who asked/i);
    assert.match(stopNoteProblem('   ') ?? '', /who asked/i);
    assert.match(stopNoteProblem('ab') ?? '', /at least 3/);
    assert.equal(stopNoteProblem('Owner on phone, 25 Oct'), null);
    assert.match(stopNoteProblem('a'.repeat(AUTOPAY_STOP_NOTE_MAX + 1)) ?? '', /Keep it to 300/);
  });

  it('counts after trimming, as the server does', () => {
    assert.match(stopNoteProblem('  ab  ') ?? '', /at least 3/);
    assert.equal(stopNoteProblem(`  ${'a'.repeat(AUTOPAY_STOP_NOTE_MAX)}  `), null);
  });

  it('asks for what the owner said on the call', () => {
    assert.match(followUpNoteProblem('') ?? '', /what the owner said/i);
    assert.equal(followUpNoteProblem('Did not pick up'), null);
    assert.match(followUpNoteProblem('a'.repeat(AUTOPAY_FOLLOW_UP_MAX + 1)) ?? '', /Keep it to 500/);
  });
});

describe('days', () => {
  it('leaves the year off for this year and puts it on for another', () => {
    assert.equal(shortDay('2026-11-24', TODAY), '24 Nov');
    assert.equal(shortDay('2027-01-09', TODAY), '9 Jan 2027');
  });

  it('prints what it cannot read as it came', () => {
    assert.equal(shortDay(null, TODAY), '-');
    assert.equal(shortDay(undefined, TODAY), '-');
  });

  it('says months in the singular once', () => {
    assert.equal(monthsTakenLine(0), 'Taken 0 months');
    assert.equal(monthsTakenLine(1), 'Taken 1 month');
    assert.equal(monthsTakenLine(3), 'Taken 3 months');
  });
});

describe('the status line', () => {
  const base = {
    amountPaise: 354_000,
    firstDebitOn: null,
    nextDebitOn: null,
    chargedCount: 0,
  };

  it('on: amount, next debit, months taken', () => {
    assert.deepEqual(
      statusFacts({ ...base, state: 'on', nextDebitOn: '2026-11-24', chargedCount: 2 }, TODAY),
      ['₹3,540 a month', 'Next debit 24 Nov', 'Taken 2 months'],
    );
  });

  it('on, nothing taken yet: still says so', () => {
    assert.deepEqual(statusFacts({ ...base, state: 'on', nextDebitOn: '2026-11-24' }, TODAY), [
      '₹3,540 a month',
      'Next debit 24 Nov',
      'Taken 0 months',
    ]);
  });

  it('failing keeps the next try', () => {
    assert.deepEqual(
      statusFacts({ ...base, state: 'failing', nextDebitOn: '2026-10-27', chargedCount: 1 }, TODAY),
      ['₹3,540 a month', 'Next debit 27 Oct', 'Taken 1 month'],
    );
  });

  it('waiting for approval: the first debit, planned or at approval, and no months', () => {
    assert.deepEqual(
      statusFacts({ ...base, state: 'setting_up', firstDebitOn: '2026-11-24' }, TODAY),
      ['₹3,540 a month', 'First debit 24 Nov'],
    );
    assert.deepEqual(statusFacts({ ...base, state: 'setting_up' }, TODAY), [
      '₹3,540 a month',
      'First debit when the owner approves',
    ]);
  });

  it('off: the amount, and the months only if any were taken', () => {
    assert.deepEqual(statusFacts({ ...base, state: 'off' }, TODAY), ['₹3,540 a month']);
    assert.deepEqual(statusFacts({ ...base, state: 'off', chargedCount: 4 }, TODAY), [
      '₹3,540 a month',
      'Taken 4 months',
    ]);
  });

  it('explains the two states that are waiting on something', () => {
    assert.match(stateHint('setting_up') ?? '', /approve once with their UPI PIN/);
    assert.match(stateHint('failing') ?? '', /trying again/);
    assert.equal(stateHint('on'), null);
    assert.equal(stateHint('off'), null);
  });
});

describe('setting it up', () => {
  it('names the price from the server, not a number of its own', () => {
    assert.match(
      startConfirmWords({ monthlyPricePaise: 354_000, paidThrough: null }, TODAY),
      /^Razorpay will text the owner an approval link for ₹3,540 a month\./,
    );
    assert.match(
      startConfirmWords({ monthlyPricePaise: 295_000, paidThrough: null }, TODAY),
      /₹2,950 a month/,
    );
  });

  it('says the first debit waits for the paid month while one is left', () => {
    assert.match(
      startConfirmWords({ monthlyPricePaise: 354_000, paidThrough: '2026-11-23' }, TODAY),
      /The first debit is when the month already paid for runs out \(paid until 23 Nov\)\.$/,
    );
    assert.match(
      startConfirmWords({ monthlyPricePaise: 354_000, paidThrough: TODAY }, TODAY),
      /paid until 25 Oct/,
    );
  });

  it('says the first debit is at approval when no paid month is left', () => {
    for (const paidThrough of [null, '2026-10-24']) {
      assert.match(
        startConfirmWords({ monthlyPricePaise: 354_000, paidThrough }, TODAY),
        /The first debit is when the owner approves\.$/,
      );
    }
  });

  it('says where the link went', () => {
    assert.equal(
      sentToLine({ phone: '9876543210', email: 'owner@example.com' }),
      'Razorpay sent the link to +91 98765 43210 and owner@example.com.',
    );
    assert.equal(
      sentToLine({ phone: '+91 98765 43210', email: null }),
      'Razorpay sent the link to +91 98765 43210.',
    );
    assert.match(sentToLine({ phone: null, email: null }) ?? '', /no phone number or email/);
    assert.equal(sentToLine(null), null);
  });

  it('tells the person when the link had nowhere to go', () => {
    assert.match(startedToast({ phone: '9876543210', email: null }), /is sending the approval link/);
    assert.match(startedToast({ phone: null, email: null }), /nowhere to send the link/);
    assert.match(startedToast(null), /nowhere to send the link/);
  });
});

describe('checking with Razorpay', () => {
  it('says so when nothing moved, and what it moved to when something did', () => {
    assert.equal(
      refreshOutcome('setting_up', 'setting_up'),
      'Nothing new from Razorpay. It is still: waiting for approval.',
    );
    assert.equal(refreshOutcome('setting_up', 'on'), 'Razorpay says it is now: on.');
    assert.equal(refreshOutcome('on', 'off'), 'Razorpay says it is now: off.');
  });
});

describe('a refused press', () => {
  it('shows the server sentence as it is', () => {
    const why = 'Autopay can start once the first month is paid.';
    assert.equal(failedText(409, why), why);
  });

  it('puts "Razorpay is off" in plain words', () => {
    assert.match(failedText(503, 'Service Unavailable'), /not switched on yet/);
  });

  it('never prints nothing', () => {
    assert.equal(failedText(500, ''), 'That did not go through.');
    assert.equal(failedText(undefined, undefined), 'That did not go through.');
  });
});

describe('the ones that ended', () => {
  const one = (id: string, endedAt: string | null): AdminAutopay => ({ id, endedAt }) as AdminAutopay;

  it('come newest first, whatever order they arrived in', () => {
    const list = [
      one('a', '2026-08-01T00:00:00.000Z'),
      one('c', '2026-10-20T00:00:00.000Z'),
      one('b', '2026-09-10T00:00:00.000Z'),
    ];
    assert.deepEqual(
      newestEndedFirst(list.map((a) => ({ ...a, createdAt: '2026-01-01T00:00:00.000Z' }))).map(
        (a) => a.id,
      ),
      ['c', 'b', 'a'],
    );
  });

  it('does not reorder the list it was given', () => {
    const list = [
      { endedAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z' },
      { endedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-07-02T00:00:00.000Z' },
    ];
    const before = JSON.stringify(list);
    newestEndedFirst(list);
    assert.equal(JSON.stringify(list), before);
  });

  it('names the caller and when', () => {
    const call = { doneAt: '2026-10-26T05:30:00.000Z', byName: 'Asha', note: 'x' };
    assert.equal(followUpLine(call, '26 Oct, 11:00'), 'Asha called, 26 Oct, 11:00');
    assert.equal(followUpLine(call, ''), 'Asha called');
  });

  it('names who stopped it only when an admin did', () => {
    assert.equal(endedByDetail('admin', 'Rahul'), 'Rahul');
    assert.equal(endedByDetail('admin', null), null);
    assert.equal(endedByDetail('dealer', 'Rahul'), null);
    assert.equal(endedByDetail(null, null), null);
  });
});
