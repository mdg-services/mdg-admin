/**
 * Checks for the billing release's decisions (`src/lib/billingRelease.ts`): the
 * one-line billing status on the Setup card, who may move a bill's day and how far
 * (the 7-day rule), which bills "Give more time" and "Hold chasing" apply to, the
 * send history line and the warning before a third send in a day, the autopay
 * approval's expiry and the owner's money-back ask, and the `MoneyAction` each money
 * window hands to "What the dealer receives". Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npx tsx --test scripts/billingRelease.check.ts
 *
 * Like the other check scripts it sits outside `src/` on purpose: the build
 * type-checks `src/`, and a test import there would break a standalone build.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { giveMoreTimeSchema, holdChasingSchema } from '../shared/src/schemas/payment';
import type { AdminPayment, PaymentSend } from '../shared/src/types/index';
import {
  MORE_TIME_ADMIN_DAYS,
  MORE_TIME_REASON_MAX,
  MORE_TIME_REASON_MIN,
  approvalExpiry,
  approvalExpiryLine,
  autopayIsRunning,
  billingStatusLine,
  cancelPaymentAction,
  canGiveMoreTime,
  canHoldChasing,
  defaultMoreTimeDay,
  holdBody,
  holdChasingAction,
  holdExplainer,
  holdIsOn,
  holdProblem,
  lastDayWithoutSuperAdmin,
  moneyBackAction,
  moreTimeAction,
  moreTimeBody,
  moreTimeProblem,
  originalDueDay,
  overSevenDaysNote,
  payLinkInsteadFacts,
  payLinkInsteadWords,
  recordPaymentAction,
  refundAskedAt,
  refundAskedLine,
  repeatSendWarning,
  requestPaymentAction,
  sendBillAction,
  sendHistoryLine,
  sendSmsAction,
  sendSmsAndEmailLabel,
  sendsOnDay,
  setUpAutopayAction,
  showsBillingStatus,
  stopAutopayAction,
  stopAutopayWords,
  ymdOfIso,
  type BillingStatusFacts,
} from '../src/lib/billingRelease';

/** 29 Oct 2026, 11:30 in India. */
const NOW = Date.parse('2026-10-29T06:00:00.000Z');
const TODAY = '2026-10-29';

const send = (
  at: string,
  byName: string | null,
  kind: PaymentSend['kind'] = 'link',
): PaymentSend => ({
  kind,
  at,
  byName,
});

describe('days read in India time', () => {
  it('moves an evening in UTC onto the next India day', () => {
    assert.equal(ymdOfIso('2026-10-28T20:00:00.000Z'), '2026-10-29');
    assert.equal(ymdOfIso('2026-10-28T05:32:00.000Z'), '2026-10-28');
    assert.equal(ymdOfIso(null), null);
    assert.equal(ymdOfIso('not a time'), null);
  });
});

describe('the send history line', () => {
  it('says "Not sent yet" with nothing sent', () => {
    assert.equal(sendHistoryLine([], NOW), 'Not sent yet');
  });

  it('names the count, the last send, its time in India and who pressed it', () => {
    const sends = [
      send('2026-10-27T10:00:00.000Z', null, 'whatsapp'),
      send('2026-10-28T05:32:00.000Z', 'Asha'),
    ];
    assert.equal(sendHistoryLine(sends, NOW), 'Sent 2 times, last on 28 Oct at 11:02 by Asha');
  });

  it('reads one send as "once", and a send the system made on its own as "by the system"', () => {
    assert.equal(
      sendHistoryLine([send('2026-10-28T05:32:00.000Z', null, 'whatsapp')], NOW),
      'Sent once, on 28 Oct at 11:02 by the system',
    );
  });

  it('finds the last send even when the list is not in order, and adds the year from another year', () => {
    const sends = [
      send('2026-10-28T05:32:00.000Z', 'Asha'),
      send('2026-10-20T05:32:00.000Z', 'Ravi'),
    ];
    assert.match(sendHistoryLine(sends, NOW), /by Asha$/);
    assert.match(
      sendHistoryLine(sends, Date.parse('2027-01-10T00:00:00.000Z')),
      /on 28 Oct 2026 at /,
    );
  });
});

describe('the warning before a third send in a day', () => {
  const day = (n: number) =>
    Array.from({ length: n }, (_, i) => send(`2026-10-29T0${i}:10:00.000Z`, 'Asha'));

  it('stays quiet for the first and second send', () => {
    assert.equal(repeatSendWarning(day(0), NOW), null);
    assert.equal(repeatSendWarning(day(1), NOW), null);
  });

  it('speaks once two have gone today, with the count', () => {
    assert.match(repeatSendWarning(day(2), NOW) ?? '', /already been sent this bill 2 times today/);
    assert.match(repeatSendWarning(day(3), NOW) ?? '', /3 times today/);
  });

  it("counts today's sends only", () => {
    const old = [
      send('2026-10-27T05:00:00.000Z', 'Asha'),
      send('2026-10-28T05:00:00.000Z', 'Asha'),
    ];
    assert.equal(repeatSendWarning(old, NOW), null);
    assert.equal(sendsOnDay(old, '2026-10-28'), 1);
  });
});

describe("the 7-day rule for moving a bill's day", () => {
  it('is seven days past the day the bill was FIRST due', () => {
    assert.equal(MORE_TIME_ADMIN_DAYS, 7);
    assert.equal(lastDayWithoutSuperAdmin('2026-11-03'), '2026-11-10');
    assert.equal(
      originalDueDay({
        dueDate: '2026-11-08',
        dueDateChanges: [
          {
            from: '2026-11-03',
            to: '2026-11-06',
            reason: 'x',
            byName: 'A',
            at: '',
            toldDealer: false,
          },
          {
            from: '2026-11-06',
            to: '2026-11-08',
            reason: 'x',
            byName: 'A',
            at: '',
            toldDealer: false,
          },
        ],
      }),
      '2026-11-03',
    );
    assert.equal(originalDueDay({ dueDate: '2026-11-03', dueDateChanges: [] }), '2026-11-03');
  });

  it('puts a plain note on a day further out, for an ordinary admin only', () => {
    // Today is 29 Oct, so the 10 Nov last day is still ahead and can be named.
    assert.equal(overSevenDaysNote('2026-11-10', '2026-11-03', false, TODAY), null);
    assert.match(
      overSevenDaysNote('2026-11-11', '2026-11-03', false, TODAY) ?? '',
      /^More than 7 days needs a super-admin\. .*3 Nov 2026.*10 Nov 2026/,
    );
    assert.equal(overSevenDaysNote('2026-12-31', '2026-11-03', true, TODAY), null);
    assert.equal(overSevenDaysNote('2026-11-11', null, false, TODAY), null);
  });

  it('says only that the bill is overdue when the last day an ordinary admin may pick has passed', () => {
    // First due 10 Oct: the last day for an ordinary admin was 17 Oct, 12 days ago.
    const note = overSevenDaysNote('2026-11-05', '2026-10-10', false, TODAY);
    assert.equal(
      note,
      'This bill has been overdue more than 7 days, so only a super-admin can move it.',
    );
    assert.doesNotMatch(note ?? '', /latest day/);
    // The last day being today is not yet in the past: it is still named.
    assert.match(overSevenDaysNote('2026-11-05', '2026-10-22', false, TODAY) ?? '', /latest day/);
    // A super-admin has no limit however late it is.
    assert.equal(overSevenDaysNote('2026-11-05', '2026-10-10', true, TODAY), null);
  });

  it('starts at the current due day plus 3, or tomorrow when that is already behind us', () => {
    assert.equal(defaultMoreTimeDay('2026-11-03', TODAY), '2026-11-06');
    assert.equal(defaultMoreTimeDay('2026-10-01', TODAY), '2026-10-30');
    assert.equal(defaultMoreTimeDay(null, TODAY), '2026-11-01');
  });

  const facts = {
    currentDue: '2026-11-03',
    originalDue: '2026-11-03',
    today: TODAY,
    isSuperAdmin: false,
  };
  const why = 'Owner asked, will pay Friday';

  it('accepts a later day inside the seven, with a reason', () => {
    assert.equal(moreTimeProblem({ dueOn: '2026-11-06', reason: why }, facts), null);
    assert.equal(moreTimeProblem({ dueOn: '2026-11-10', reason: why }, facts), null);
  });

  it('refuses the same or an earlier day, a day in the past, and a missing reason', () => {
    assert.match(
      moreTimeProblem({ dueOn: '2026-11-03', reason: why }, facts) ?? '',
      /after the current one/,
    );
    assert.match(
      moreTimeProblem({ dueOn: '', reason: why }, facts) ?? '',
      /Pick the new pay-by day/,
    );
    assert.match(
      moreTimeProblem(
        { dueOn: '2026-10-20', reason: why },
        { ...facts, currentDue: '2026-10-10' },
      ) ?? '',
      /cannot be in the past/,
    );
    assert.match(moreTimeProblem({ dueOn: '2026-11-06', reason: '' }, facts) ?? '', /Say why/);
    assert.match(moreTimeProblem({ dueOn: '2026-11-06', reason: 'ab' }, facts) ?? '', /at least 3/);
  });

  it('refuses eight days for an ordinary admin and lets a super-admin through', () => {
    assert.match(
      moreTimeProblem({ dueOn: '2026-11-11', reason: why }, facts) ?? '',
      /needs a super-admin/,
    );
    assert.equal(
      moreTimeProblem({ dueOn: '2026-11-11', reason: why }, { ...facts, isSuperAdmin: true }),
      null,
    );
  });

  it('tells a bill overdue past the seven days that only a super-admin can move it', () => {
    const late = { ...facts, currentDue: '2026-10-10', originalDue: '2026-10-10' };
    assert.match(
      moreTimeProblem({ dueOn: '2026-11-05', reason: why }, late) ?? '',
      /overdue more than 7 days, so only a super-admin/,
    );
    assert.equal(moreTimeProblem({ dueOn: '2026-11-05', reason: why }, { ...late, isSuperAdmin: true }), null);
  });

  it('counts the 7 days from the FIRST due day even after a move', () => {
    const moved = { ...facts, currentDue: '2026-11-08' };
    assert.equal(moreTimeProblem({ dueOn: '2026-11-10', reason: why }, moved), null);
    assert.match(moreTimeProblem({ dueOn: '2026-11-11', reason: why }, moved) ?? '', /super-admin/);
  });

  it('sends the reason trimmed and "tell the dealer" as the box says', () => {
    assert.deepEqual(
      moreTimeBody({ dueOn: '2026-11-06', reason: '  ok then  ', tellDealer: true }),
      {
        dueOn: '2026-11-06',
        reason: 'ok then',
        tellDealer: true,
      },
    );
  });

  it('agrees with the shared schemas it is sent through', () => {
    const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
      schema.safeParse(v).success;
    const day = { dueOn: '2026-11-06', tellDealer: false };
    assert.equal(
      ok(giveMoreTimeSchema, { ...day, reason: 'a'.repeat(MORE_TIME_REASON_MIN - 1) }),
      false,
    );
    assert.equal(
      ok(giveMoreTimeSchema, { ...day, reason: 'a'.repeat(MORE_TIME_REASON_MIN) }),
      true,
    );
    assert.equal(
      ok(giveMoreTimeSchema, { ...day, reason: 'a'.repeat(MORE_TIME_REASON_MAX) }),
      true,
    );
    assert.equal(
      ok(giveMoreTimeSchema, { ...day, reason: 'a'.repeat(MORE_TIME_REASON_MAX + 1) }),
      false,
    );
    assert.equal(
      ok(holdChasingSchema, { until: '2026-11-06', reason: 'a'.repeat(MORE_TIME_REASON_MAX + 1) }),
      false,
    );
    assert.equal(ok(holdChasingSchema, { until: null }), true);
  });
});

describe('which bills each button is for', () => {
  const base = {
    status: 'due' as const,
    purpose: 'subscription' as AdminPayment['purpose'],
    dueDate: '2026-11-03',
    autopayTakes: false,
    chaseHeldUntil: null as string | null,
  };

  it('gives more time to a due bill the owner pays by link, and holds chasing on none of those', () => {
    assert.equal(canGiveMoreTime(base), true);
    assert.equal(canHoldChasing(base), false);
  });

  it("holds chasing on a bill autopay is meant to take (the server's own flag), and gives it no more time", () => {
    const p = { ...base, autopayTakes: true };
    assert.equal(canHoldChasing(p), true);
    assert.equal(canGiveMoreTime(p), false);
  });

  it('gives more time to a bill that fell back to a link, and still lets a hold on it be changed or lifted', () => {
    // A fallen-back bill keeps its subscription id, but autopay no longer takes it.
    assert.equal(canGiveMoreTime({ ...base, autopayTakes: false }), true);
    assert.equal(canHoldChasing({ ...base, chaseHeldUntil: '2026-11-06' }), true);
  });

  it('offers neither on a bill that is not due, and no more time on one with no due day', () => {
    for (const status of ['processing', 'paid', 'cancelled', 'refunded'] as const) {
      assert.equal(canGiveMoreTime({ ...base, status }), false);
      assert.equal(canHoldChasing({ ...base, status, autopayTakes: true }), false);
    }
    assert.equal(canGiveMoreTime({ ...base, dueDate: null }), false);
  });

  it("offers neither on a bill that is not a monthly-service bill (the server refuses those)", () => {
    for (const purpose of ['setup', 'service', 'other'] as const) {
      const other = { ...base, purpose: purpose as AdminPayment['purpose'] };
      assert.equal(canGiveMoreTime(other), false);
      assert.equal(canHoldChasing({ ...other, autopayTakes: true }), false);
      assert.equal(canHoldChasing({ ...other, chaseHeldUntil: '2026-11-06' }), false);
    }
  });

  it('explains a hold by what it is for: autopay keeps retrying, a refund-ask hold has no debit', () => {
    assert.match(
      holdExplainer({ autopayTakes: true, chaseHeldUntil: null }, TODAY) ?? '',
      /Razorpay still retries the debit/,
    );
    const refundHold = holdExplainer({ autopayTakes: false, chaseHeldUntil: '2026-11-05' }, TODAY);
    assert.equal(
      refundHold,
      'Held for a week because the owner asked for their first month back.',
    );
    assert.doesNotMatch(refundHold ?? '', /Razorpay/);
    // A link bill with no hold in force has nothing to explain.
    assert.equal(holdExplainer({ autopayTakes: false, chaseHeldUntil: '2026-10-20' }, TODAY), null);
    assert.equal(holdExplainer({ autopayTakes: false, chaseHeldUntil: null }, TODAY), null);
  });

  it('knows a hold is on until the end of its last day', () => {
    assert.equal(holdIsOn('2026-10-29', TODAY), true);
    assert.equal(holdIsOn('2026-10-28', TODAY), false);
    assert.equal(holdIsOn(null, TODAY), false);
  });

  it('checks a hold against the same rule, and lifts it with a null day', () => {
    const f = { originalDue: '2026-11-03', today: TODAY, isSuperAdmin: false };
    assert.equal(holdProblem({ until: '2026-11-06', reason: 'bank takes it on the 6th' }, f), null);
    assert.match(
      holdProblem({ until: '2026-10-28', reason: 'bank takes it on the 6th' }, f) ?? '',
      /past/,
    );
    assert.match(
      holdProblem({ until: '2026-11-11', reason: 'bank takes it on the 6th' }, f) ?? '',
      /super-admin/,
    );
    assert.match(holdProblem({ until: '2026-11-06', reason: '' }, f) ?? '', /Say why/);
    assert.deepEqual(holdBody(null, 'ignored'), { until: null });
    assert.deepEqual(holdBody('2026-11-06', ' why now '), {
      until: '2026-11-06',
      reason: 'why now',
    });
  });
});

describe('the one-line billing status', () => {
  const facts = (over: Partial<BillingStatusFacts> = {}): BillingStatusFacts => ({
    today: TODAY,
    first: { state: 'paid', number: 'MDG-2026-00012', amountPaise: 354_000, dueOn: '2026-11-03' },
    open: null,
    paidThrough: null,
    nextBillOn: null,
    overdue: false,
    billingHold: null,
    autopay: null,
    now: NOW,
    ...over,
  });
  const openBill = (over: Partial<NonNullable<BillingStatusFacts['open']>> = {}) => ({
    number: 'MDG-2026-00012',
    amountPaise: 354_000,
    dueDate: '2026-12-03',
    autopayOn: null,
    waitingForAutopayApproval: false,
    chaseHeldUntil: null,
    ...over,
  });
  const autopay = (over: Partial<NonNullable<BillingStatusFacts['autopay']>> = {}) => ({
    state: 'on' as const,
    amountPaise: 354_000,
    nextDebitOn: '2026-11-29',
    createdAt: '2026-10-29T05:00:00.000Z',
    approvalExpiresAt: null,
    ...over,
  });

  it('says what autopay will take and when', () => {
    assert.equal(
      billingStatusLine(facts({ paidThrough: '2026-11-28', autopay: autopay() })),
      'Paid till 28 Nov. ₹3,540 will be taken by autopay on 29 Nov.',
    );
  });

  it('says an approval is waiting, when it went and when it runs out', () => {
    assert.equal(
      billingStatusLine(
        facts({
          first: {
            state: 'sent',
            number: 'MDG-2026-00012',
            amountPaise: 354_000,
            dueOn: '2026-11-08',
          },
          autopay: autopay({
            state: 'setting_up',
            nextDebitOn: null,
            approvalExpiresAt: '2026-11-08T18:29:59.000Z',
          }),
        }),
      ),
      'Autopay approval sent 29 Oct; waiting for the owner. It runs out on 8 Nov.',
    );
  });

  it('says it ran out once the day has passed', () => {
    assert.match(
      billingStatusLine(
        facts({
          autopay: autopay({ state: 'setting_up', approvalExpiresAt: '2026-10-28T18:29:59.000Z' }),
        }),
      ),
      /It ran out on 28 Oct\.$/,
    );
  });

  it('names an open bill with its amount and due day', () => {
    assert.equal(
      billingStatusLine(facts({ open: openBill() })),
      'Bill MDG-2026-00012, ₹3,540, due 3 Dec.',
    );
  });

  it('says a bill is overdue and when it was due', () => {
    assert.equal(
      billingStatusLine(facts({ today: '2026-12-05', open: openBill() })),
      'Bill MDG-2026-00012 is overdue; it was due on 3 Dec.',
    );
  });

  it("falls back to the setup's own bill when the open bill is not at hand", () => {
    assert.equal(
      billingStatusLine(
        facts({
          first: {
            state: 'sent',
            number: 'MDG-2026-00012',
            amountPaise: 354_000,
            dueOn: '2026-11-08',
          },
        }),
      ),
      'Bill MDG-2026-00012, ₹3,540, due 8 Nov.',
    );
  });

  it('adds a hold while it is on, and not after it', () => {
    assert.equal(
      billingStatusLine(
        facts({ today: '2026-12-05', open: openBill({ chaseHeldUntil: '2026-12-06' }) }),
      ),
      'Bill MDG-2026-00012 is overdue; it was due on 3 Dec. Chasing held until 6 Dec.',
    );
    assert.doesNotMatch(
      billingStatusLine(facts({ open: openBill({ chaseHeldUntil: '2026-10-01' }) })),
      /held/,
    );
  });

  it('does not call a bill autopay will take "due" or "overdue"', () => {
    assert.equal(
      billingStatusLine(
        facts({
          paidThrough: '2026-11-28',
          open: openBill({ autopayOn: '2026-11-29', dueDate: '2026-11-29' }),
          autopay: autopay(),
        }),
      ),
      'Paid till 28 Nov. ₹3,540 will be taken by autopay on 29 Nov.',
    );
  });

  it('says when a debit is failing', () => {
    assert.match(
      billingStatusLine(
        facts({ paidThrough: '2026-11-28', autopay: autopay({ state: 'failing' }) }),
      ),
      /The last autopay debit failed; Razorpay is trying again\.$/,
    );
  });

  it('says what comes next when paid with no autopay, and when nothing is sent yet or services are paused', () => {
    assert.equal(
      billingStatusLine(facts({ paidThrough: '2026-11-28', nextBillOn: '2026-11-23' })),
      'Paid till 28 Nov. The next bill is raised on 23 Nov.',
    );
    assert.equal(
      billingStatusLine(
        facts({ first: { state: 'not_sent', number: null, amountPaise: null, dueOn: null } }),
      ),
      'Bill not sent yet.',
    );
    assert.equal(
      billingStatusLine(
        facts({ billingHold: { at: '2026-10-24T05:41:00.000Z' }, open: openBill() }),
      ),
      'Services paused for non-payment since 24 Oct.',
    );
  });

  it('shows a billing line from the payment step on, and not while the owner is still signing up', () => {
    assert.equal(showsBillingStatus('sign_in', 'not_sent'), false);
    assert.equal(showsBillingStatus('billing', 'not_sent'), false);
    assert.equal(showsBillingStatus('lost', 'not_sent'), false);
    assert.equal(showsBillingStatus('payment', 'not_sent'), true);
    assert.equal(showsBillingStatus('live', 'paid'), true);
    assert.equal(showsBillingStatus('lost', 'sent'), true);
  });
});

describe('the autopay approval and the money-back ask', () => {
  it('says when the approval runs out, with the clock time, or that it has', () => {
    assert.equal(
      approvalExpiryLine('2026-11-08T18:29:59.000Z', NOW),
      'The approval link runs out on 8 Nov at 23:59.',
    );
    assert.equal(
      approvalExpiryLine('2026-10-28T18:29:59.000Z', NOW),
      'The approval link has run out.',
    );
    assert.equal(approvalExpiryLine(null, NOW), null);
    assert.deepEqual(approvalExpiry('2026-11-08T18:29:59.000Z', NOW), {
      when: 'on 8 Nov at 23:59',
      past: false,
    });
  });

  it('finds the newest ask for the first month back, across the running autopay and the ended ones', () => {
    const a = (refundAskedAt: string | null) => ({ refundAskedAt }) as never;
    assert.equal(refundAskedAt({ current: null, history: [a(null), a(null)] }), null);
    assert.equal(
      refundAskedAt({
        current: null,
        history: [a('2026-10-27T05:00:00.000Z'), a('2026-10-28T05:00:00.000Z')],
      }),
      '2026-10-28T05:00:00.000Z',
    );
    assert.equal(refundAskedAt(undefined), null);
    assert.equal(
      refundAskedLine('2026-10-28T05:00:00.000Z', TODAY),
      'The owner asked for the first month back on 28 Oct.',
    );
  });
});

describe('what each money window hands to "What the dealer receives"', () => {
  const sendFacts = {
    paymentsOn: true,
    amountPaise: 354_000,
    monthlyPricePaise: 354_000,
    billedPaise: null,
    billedDueOn: null,
    dueOn: '2026-11-08',
    billOpen: false,
    approvalOut: false,
    firstEver: true,
    firstBillAutopay: true,
  };

  it('Send bill: the autopay approval at the monthly price with payments on, a pay link otherwise', () => {
    assert.deepEqual(sendBillAction(sendFacts), {
      kind: 'send_bill',
      autopay: true,
      resend: false,
      paymentsOn: true,
      amountPaise: 354_000,
      firstEver: true,
      approvalOut: false,
    });
    assert.equal(sendBillAction({ ...sendFacts, amountPaise: 300_000 }).autopay, false);
    assert.equal(sendBillAction({ ...sendFacts, paymentsOn: false }).autopay, false);
    assert.equal(sendBillAction({ ...sendFacts, monthlyPricePaise: null }).autopay, false);
    assert.equal(sendBillAction({ ...sendFacts, amountPaise: null }).amountPaise, 0);
    // The server's switch off: always the payment link.
    assert.equal(sendBillAction({ ...sendFacts, firstBillAutopay: false }).autopay, false);
    // An approval already out is sent again even when the price has changed since.
    assert.equal(
      sendBillAction({ ...sendFacts, approvalOut: true, amountPaise: 300_000 }).autopay,
      true,
    );
  });

  it('Send bill: only a resend when the open bill has the same figures, or an approval is already out', () => {
    const open = {
      ...sendFacts,
      billOpen: true,
      billedPaise: 354_000,
      billedDueOn: '2026-11-08',
      firstEver: false,
    };
    assert.equal(sendBillAction(open).resend, true);
    assert.equal(sendBillAction({ ...open, dueOn: '2026-11-09' }).resend, false);
    assert.equal(sendBillAction({ ...open, amountPaise: 300_000 }).resend, false);
    assert.equal(sendBillAction({ ...sendFacts, approvalOut: true }).resend, true);
    assert.equal(sendBillAction(open).firstEver, false);
  });

  it('Request a payment: reminders apply to a Subscription with a due day', () => {
    const f = {
      sendLink: true,
      amountPaise: 499_900,
      purpose: 'subscription',
      dueDate: '2026-11-08',
    };
    assert.deepEqual(requestPaymentAction(f), {
      kind: 'request_payment',
      sendLink: true,
      amountPaise: 499_900,
      remindersApply: true,
    });
    assert.equal(requestPaymentAction({ ...f, dueDate: '' }).remindersApply, false);
    assert.equal(requestPaymentAction({ ...f, purpose: 'service' }).remindersApply, false);
    assert.equal(requestPaymentAction({ ...f, sendLink: false }).sendLink, false);
    assert.equal(requestPaymentAction({ ...f, amountPaise: null }).amountPaise, 0);
  });

  it('Record payment: the first bill, and logins missing while some are needed and not finished', () => {
    const f = { firstBill: true, loginsNeeded: 2, loginsDoneAt: null, amountPaise: 354_000 };
    assert.deepEqual(recordPaymentAction(f), {
      kind: 'record_payment',
      firstBill: true,
      loginsMissing: true,
      amountPaise: 354_000,
    });
    assert.equal(
      recordPaymentAction({ ...f, loginsDoneAt: '2026-10-20T00:00:00.000Z' }).loginsMissing,
      false,
    );
    assert.equal(recordPaymentAction({ ...f, loginsNeeded: 0 }).loginsMissing, false);
    assert.equal(recordPaymentAction({ ...f, firstBill: false }).firstBill, false);
  });

  it('Set up autopay: the first month at approval, the day after a paid month, or at approval once it has run out', () => {
    const f = { paidThrough: null, firstBillUnpaid: true, amountPaise: 354_000, today: TODAY };
    assert.deepEqual(setUpAutopayAction(f), {
      kind: 'set_up_autopay',
      firstMonth: true,
      amountPaise: 354_000,
      firstDebitOn: null,
    });
    assert.deepEqual(
      setUpAutopayAction({ ...f, paidThrough: '2026-11-28', firstBillUnpaid: false }),
      {
        kind: 'set_up_autopay',
        firstMonth: false,
        amountPaise: 354_000,
        firstDebitOn: '2026-11-29',
      },
    );
    assert.equal(
      setUpAutopayAction({ ...f, paidThrough: '2026-10-20', firstBillUnpaid: false }).firstDebitOn,
      null,
    );
    assert.equal(setUpAutopayAction({ ...f, firstBillUnpaid: false }).firstMonth, false);
  });

  it("Stop autopay: a bill waiting is the first bill's approval, or any bill autopay was meant to take", () => {
    const bill = { status: 'due' as const, autopayTakes: true, chaseHeldUntil: null };
    const none = { firstBillWaiting: false, approved: true, today: TODAY };
    assert.deepEqual(stopAutopayAction({ bill: null, ...none }), {
      kind: 'stop_autopay_admin',
      billWaiting: false,
      approved: true,
      billHeld: false,
    });
    assert.equal(
      stopAutopayAction({ bill: null, ...none, firstBillWaiting: true }).billWaiting,
      true,
    );
    assert.equal(stopAutopayAction({ bill, ...none }).billWaiting, true);
    assert.equal(
      stopAutopayAction({ bill: { ...bill, autopayTakes: false }, ...none }).billWaiting,
      false,
    );
  });

  it('Stop autopay: says whether the owner had approved, and whether the waiting bill is on hold', () => {
    const bill = { status: 'due' as const, autopayTakes: true, chaseHeldUntil: '2026-10-29' };
    const f = { firstBillWaiting: true, approved: false, today: TODAY };
    const a = stopAutopayAction({ bill, ...f });
    assert.equal(a.approved, false);
    // A hold that ends today is still in force; one that ended yesterday is not.
    assert.equal(a.billHeld, true);
    assert.equal(
      stopAutopayAction({ bill: { ...bill, chaseHeldUntil: '2026-10-28' }, ...f }).billHeld,
      false,
    );
    assert.equal(stopAutopayAction({ bill: null, ...f }).billHeld, false);
  });

  it('Stop autopay: the sentence matches the preview (approved: "Autopay stopped"; not approved: a one-time link, no autopay notice)', () => {
    const approved = stopAutopayWords({ approved: true, billWaiting: false, billHeld: false });
    assert.match(approved, /Autopay stopped/);
    assert.match(approved, /next bill goes to the owner as a link/);
    const approvedHeld = stopAutopayWords({ approved: true, billWaiting: true, billHeld: true });
    assert.match(approvedHeld, /on hold, so no link goes now/);
    assert.match(approvedHeld, /Autopay stopped/);

    const nobody = stopAutopayWords({ approved: false, billWaiting: true, billHeld: false });
    assert.doesNotMatch(nobody, /Autopay stopped/);
    assert.match(nobody, /not told about it/);
    assert.match(nobody, /first bill goes to them at once as a one-time payment link/);
    assert.match(
      stopAutopayWords({ approved: false, billWaiting: true, billHeld: true }),
      /on hold, so no link goes now/,
    );
    const noBill = stopAutopayWords({ approved: false, billWaiting: false, billHeld: false });
    assert.doesNotMatch(noBill, /payment link/);
  });

  it('Give the first month back: what came goes back, by hand when it came by hand, and whether autopay runs', () => {
    assert.deepEqual(
      moneyBackAction({ amountPaise: 354_000, paidPaise: 318_600, paidByHand: true }, false),
      {
        kind: 'money_back',
        amountPaise: 318_600,
        byHand: true,
        autopayRunning: false,
      },
    );
    assert.deepEqual(
      moneyBackAction({ amountPaise: 354_000, paidPaise: 354_000, paidByHand: false }, true),
      {
        kind: 'money_back',
        amountPaise: 354_000,
        byHand: false,
        autopayRunning: true,
      },
    );
  });

  it('autopay counts as running only when approved and not ended', () => {
    assert.equal(autopayIsRunning(null), false);
    assert.equal(autopayIsRunning({ approvedAt: null, endedAt: null }), false);
    assert.equal(autopayIsRunning({ approvedAt: '2026-10-20T05:00:00.000Z', endedAt: null }), true);
    assert.equal(
      autopayIsRunning({ approvedAt: '2026-10-20T05:00:00.000Z', endedAt: '2026-10-28T05:00:00.000Z' }),
      false,
    );
  });

  it('Send a pay link instead: works from the live approval, or from the ended one that ran out unused', () => {
    const live = {
      amountPaise: 354_000,
      approvalExpiresAt: '2026-11-08T18:29:00.000Z',
      endedAt: null,
    };
    const ended = {
      amountPaise: 354_000,
      approvalExpiresAt: '2026-10-20T18:29:00.000Z',
      endedAt: '2026-10-21T01:00:00.000Z',
    };
    type O = Parameters<typeof payLinkInsteadFacts>[0];
    const waiting = payLinkInsteadFacts(
      { current: live, history: [], firstMonth: null } as unknown as O,
      NOW,
    );
    assert.deepEqual(waiting, {
      amountPaise: 354_000,
      approvalExpiresAt: '2026-11-08T18:29:00.000Z',
      ranOut: false,
    });
    // No current autopay: the approval that ran out is the newest ended one.
    const ranOut = payLinkInsteadFacts(
      { current: null, history: [ended], firstMonth: { amountPaise: 300_000 } } as unknown as O,
      NOW,
    );
    assert.deepEqual(ranOut, {
      amountPaise: 300_000,
      approvalExpiresAt: '2026-10-20T18:29:00.000Z',
      ranOut: true,
    });
    // A live approval whose day has passed is also run out.
    assert.equal(
      payLinkInsteadFacts(
        { current: { ...live, approvalExpiresAt: '2026-10-28T18:29:00.000Z' }, history: [], firstMonth: null } as unknown as O,
        NOW,
      )?.ranOut,
      true,
    );
    assert.equal(
      payLinkInsteadFacts({ current: null, history: [], firstMonth: null } as unknown as O, NOW),
      null,
    );
  });

  it('Send a pay link instead: says one thing, and nothing about stopping an approval that already ran out', () => {
    const waiting = payLinkInsteadWords(false, '2026-11-08T18:29:00.000Z', NOW);
    assert.match(waiting, /approval link stops working/);
    assert.match(waiting, /one-time payment link/);
    assert.doesNotMatch(waiting, /refunded|may still work/);
    const ranOut = payLinkInsteadWords(true, '2026-10-20T18:29:00.000Z', NOW);
    assert.equal(ranOut, 'The first bill goes to the owner as a one-time payment link.');
    assert.doesNotMatch(ranOut, /stops working/);
  });

  it('Send SMS and email: again when the link was texted before, by a press or by the system', () => {
    const none = { linkSentTo: null, sends: [] } as Pick<AdminPayment, 'linkSentTo' | 'sends'>;
    assert.deepEqual(sendSmsAction(none), { kind: 'send_sms', again: false });
    assert.equal(
      sendSmsAction({ ...none, linkSentTo: { phone: '9876543210', email: null } }).again,
      true,
    );
    assert.equal(
      sendSmsAction({ ...none, sends: [{ kind: 'link', at: '2026-10-28T05:00:00.000Z', byName: null }] })
        .again,
      true,
    );
    // An app notification or an approval text is not a link sent.
    assert.equal(
      sendSmsAction({ ...none, sends: [{ kind: 'push', at: '2026-10-28T05:00:00.000Z', byName: null }] })
        .again,
      false,
    );
  });

  it('Cancel payment: a renewal knows its month before it is paid; the first bill does not', () => {
    assert.equal(
      cancelPaymentAction({
        purpose: 'subscription',
        subscriptionPeriod: { from: '2026-12-04', to: '2027-01-03' },
      }).renewal,
      true,
    );
    assert.equal(
      cancelPaymentAction({ purpose: 'subscription', subscriptionPeriod: null }).renewal,
      false,
    );
    assert.equal(
      cancelPaymentAction({
        purpose: 'service',
        subscriptionPeriod: { from: '2026-12-04', to: '2027-01-03' },
      }).renewal,
      false,
    );
  });

  it('Give more time and Hold chasing carry what the window shows', () => {
    assert.deepEqual(moreTimeAction(true, '2026-11-06'), {
      kind: 'more_time',
      tellDealer: true,
      dueOn: '2026-11-06',
    });
    assert.deepEqual(holdChasingAction('2026-11-06'), {
      kind: 'hold_chasing',
      until: '2026-11-06',
    });
    assert.deepEqual(holdChasingAction(null), { kind: 'hold_chasing', until: null });
  });

  it('the drawer button says it sends by SMS AND email', () => {
    assert.equal(sendSmsAndEmailLabel({ linkSentTo: null }), 'Send SMS and email');
    assert.equal(
      sendSmsAndEmailLabel({ linkSentTo: { phone: null, email: 'a@b.in' } } as Pick<
        AdminPayment,
        'linkSentTo'
      >),
      'Send SMS and email again',
    );
  });
});
