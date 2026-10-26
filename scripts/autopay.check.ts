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
  refundDayProblem,
  sentToLine,
  shortDay,
  moneyBackLine,
  moneyBackWords,
  firstMonthByHand,
  firstBillAutopayWaiting,
  FIRST_BILL_AUTOPAY_RESEND_WORDS,
  FIRST_BILL_AUTOPAY_RECORD_WORDS,
  BY_HAND_REFUND_POINTER,
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
    assert.match(
      followUpNoteProblem('a'.repeat(AUTOPAY_FOLLOW_UP_MAX + 1)) ?? '',
      /Keep it to 500/,
    );
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
    assert.match(
      startedToast({ phone: '9876543210', email: null }),
      /is sending the approval link/,
    );
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

  it('says Razorpay is switched off only for the code that means it', () => {
    assert.match(
      failedText(503, 'Payments are not switched on yet.', 'PAYMENTS_NOT_CONFIGURED'),
      /switched off/,
    );
  });

  it('does not call a 503 "switched off" because of its status', () => {
    const said = failedText(503, 'Some other 503 sentence.', 'SOMETHING_ELSE');
    assert.equal(said, 'Some other 503 sentence.');
    assert.doesNotMatch(said, /switched/);
  });

  it('says Razorpay did not answer, and nothing changed, for the two codes that mean it', () => {
    for (const code of ['AUTOPAY_NOT_STOPPED', 'RAZORPAY_UNREACHABLE']) {
      const said = failedText(503, 'The server sentence.', code);
      assert.match(said, /Razorpay did not answer/, code);
      assert.match(said, /Nothing has changed/, code);
      assert.match(said, /Try again/, code);
      assert.doesNotMatch(said, /switched|set up/, code);
    }
  });

  it('shows Razorpay\'s own refusal as the server wrote it, never "did not answer"', () => {
    const why = 'Razorpay refused: the refund is more than the amount captured.';
    for (const status of [502, 400]) {
      const said = failedText(status, why, 'PAYMENT_PROVIDER_ERROR');
      assert.equal(said, why);
      assert.doesNotMatch(said, /did not answer|Nothing has changed/);
    }
  });

  it("shows the money-back's 502, which says autopay is already stopped, as it is", () => {
    const why =
      'Razorpay refused the refund: the payment is too old. Autopay is stopped and billing has ended; press Give the first month back again once this is sorted.';
    assert.equal(failedText(502, why, 'PAYMENT_PROVIDER_ERROR'), why);
  });

  it('does not tell a stop or a refund that "autopay cannot be set up"', () => {
    for (const code of ['PAYMENTS_NOT_CONFIGURED', 'AUTOPAY_NOT_STOPPED']) {
      assert.doesNotMatch(failedText(503, 'x', code), /set up/);
    }
  });

  it('shows the web server\'s own 503, which carries no server sentence, as "did not answer"', () => {
    assert.match(failedText(503, 'Service Unavailable', 'HTTP_503'), /server did not answer/);
  });

  it('shows the refusal for a changed first bill as the server wrote it', () => {
    const why = 'This bill has an autopay waiting for approval. Stop autopay before changing it.';
    assert.equal(failedText(409, why, 'FIRST_BILL_HAS_AUTOPAY'), why);
  });

  it('never prints nothing', () => {
    assert.equal(failedText(500, ''), 'That did not go through.');
    assert.equal(failedText(undefined, undefined), 'That did not go through.');
  });
});

describe('the ones that ended', () => {
  const one = (id: string, endedAt: string | null): AdminAutopay =>
    ({ id, endedAt }) as AdminAutopay;

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

describe('the first month', () => {
  const fm = (over: Record<string, unknown> = {}) => ({
    paymentId: 'p1',
    number: 'MDG-2026-00007',
    amountPaise: 354_000,
    status: 'paid' as const,
    paidOn: '2026-10-26',
    refundableUntil: '2026-11-25',
    canMoneyBack: true,
    moneyBackReason: null,
    paidByHand: false,
    paidPaise: 354_000,
    ...over,
  });

  it('says the approval takes the first month and pays the first bill', () => {
    const words = startConfirmWords(
      {
        monthlyPricePaise: 354_000,
        paidThrough: null,
        firstMonth: fm({ status: 'due', paidOn: null }),
      },
      TODAY,
    );
    assert.match(words, /first month is taken when the owner approves/);
    assert.match(words, /MDG-2026-00007/);
  });

  it('offers the money-back while it can be given, and says why not when it cannot', () => {
    assert.match(moneyBackLine(fm(), TODAY)!, /money-back possible till/);
    assert.equal(
      moneyBackLine(
        fm({ canMoneyBack: false, moneyBackReason: 'The first month has already been refunded.' }),
        TODAY,
      ),
      'First month: The first month has already been refunded.',
    );
    assert.equal(moneyBackLine(fm({ status: 'due', paidOn: null }), TODAY), null);
    assert.equal(moneyBackLine(null, TODAY), null);
  });
});

describe('the money-back words', () => {
  const words = moneyBackWords('₹3,540');

  it("say what stops: no more monthly bills, and the next month's bill is cancelled", () => {
    assert.match(words, /no more monthly bills are raised for this outlet/);
    assert.match(words, /already raised for the next month is cancelled/);
  });

  it('say the services keep running until the outlet is archived', () => {
    assert.match(words, /services keep running until you archive the outlet/);
  });

  it('keep the order: autopay stops, then the amount goes back with a credit note', () => {
    assert.match(words, /Autopay is stopped first/);
    assert.match(words, /₹3,540 goes back to the owner/);
    assert.match(words, /credit note/);
  });
});

describe('a first month recorded by hand', () => {
  const handFm = {
    paymentId: 'p1',
    number: 'MDG-2026-00007',
    amountPaise: 354_000,
    status: 'paid' as const,
    paidOn: '2026-10-26',
    refundableUntil: '2026-11-25',
    canMoneyBack: true,
    moneyBackReason: null,
    paidByHand: true,
    paidPaise: 350_460,
  };

  it('is told by the server flag, not by words', () => {
    assert.equal(firstMonthByHand(handFm), true);
    assert.equal(firstMonthByHand({ ...handFm, paidByHand: false }), false);
    assert.equal(firstMonthByHand(null), false);
  });

  it('offers the money-back like any other first month', () => {
    assert.match(moneyBackLine(handFm, '2026-10-27')!, /money-back possible till/);
  });
});

describe('an autopay waiting on the first bill', () => {
  const waiting = { state: 'setting_up' as const, firstBillId: 'b1' };

  it('is only when the approval is out and it is meant to take the first bill', () => {
    assert.equal(firstBillAutopayWaiting(waiting), true);
    assert.equal(firstBillAutopayWaiting({ state: 'on', firstBillId: 'b1' }), false);
    assert.equal(firstBillAutopayWaiting({ state: 'setting_up', firstBillId: null }), false);
    assert.equal(firstBillAutopayWaiting(null), false);
    assert.equal(firstBillAutopayWaiting(undefined), false);
  });

  it('is about one bill only when a bill is named', () => {
    assert.equal(firstBillAutopayWaiting(waiting, 'b1'), true);
    assert.equal(firstBillAutopayWaiting(waiting, 'b2'), false);
  });

  it('says a different amount is refused and the same amount is fine', () => {
    assert.match(FIRST_BILL_AUTOPAY_RESEND_WORDS, /same amount is fine/);
    assert.match(FIRST_BILL_AUTOPAY_RESEND_WORDS, /different amount is refused/);
  });

  it('says the approval charge goes back if the money is recorded by hand', () => {
    assert.match(FIRST_BILL_AUTOPAY_RECORD_WORDS, /approval charge goes back/);
    assert.match(FIRST_BILL_AUTOPAY_RECORD_WORDS, /stop autopay first/);
  });
});

describe('the day the money went back', () => {
  const TODAY_YMD = '2026-10-26';

  it('accepts the day it came, any day after it, and today', () => {
    assert.equal(refundDayProblem('2026-10-24', '2026-10-24', TODAY_YMD), null);
    assert.equal(refundDayProblem('2026-10-25', '2026-10-24', TODAY_YMD), null);
    assert.equal(refundDayProblem('2026-10-26', '2026-10-24', TODAY_YMD), null);
  });

  it('refuses a day before the day the money came, and names that day', () => {
    const said = refundDayProblem('2026-10-23', '2026-10-24', TODAY_YMD) ?? '';
    assert.match(said, /24 Oct 2026/);
    assert.match(said, /cannot go back before/);
  });

  it('refuses a future day and a day that is not a day', () => {
    assert.match(refundDayProblem('2026-10-27', '2026-10-24', TODAY_YMD) ?? '', /future/);
    assert.match(refundDayProblem('', '2026-10-24', TODAY_YMD) ?? '', /Pick the day/);
    assert.match(refundDayProblem('2026-02-30', null, TODAY_YMD) ?? '', /Pick the day/);
  });

  it('has no lower bound while the day it came is not known', () => {
    assert.equal(refundDayProblem('2020-01-01', null, TODAY_YMD), null);
    assert.equal(refundDayProblem('2020-01-01', undefined, TODAY_YMD), null);
  });
});
