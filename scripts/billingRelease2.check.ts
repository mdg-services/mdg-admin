/**
 * Checks for billing release 2's decisions (`src/lib/billingRelease2.ts`): the day
 * the monthly price starts after a first month, when a first month below the price
 * goes as the one approval, who may send it and what must be written, the words the
 * Send bill window says, the billing history's pages, "Bill this outlet again", and
 * the page that lists every outlet's autopay. Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npm run check:billing-release2
 *
 * Like the other check scripts it sits outside `src/` on purpose: the build
 * type-checks `src/`, and a test import there would break a standalone build.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dealerReceives } from '../shared/src/lib/dealerReceives';
import { addIsoMonths, shiftIsoDay } from '../shared/src/lib/isoDays';
import { restartBillingSchema, sendSetupBillRequestSchema } from '../shared/src/schemas/payment';
import type {
  AdminAutopayListRow,
  BillingActivityItem,
  OnboardingConfig,
} from '../shared/src/types/index';
import {
  ACTIVITY_PAGE,
  LOWER_FIRST_MONTH_REASON_MAX,
  RESTART_REASON_MAX,
  activityPage,
  activityWho,
  addMonthsClamped,
  autopayRowFacts,
  approvalOutUpfront,
  autopayRowHref,
  autopayStateCounts,
  billingEndedLine,
  billingHasEnded,
  canBillAgain,
  filterAutopayRows,
  firstDebitOnFor,
  isBelowMonthly,
  listStateFromParam,
  lowerFirstMonthBlock,
  lowerFirstMonthNeeded,
  lowerFirstMonthReasonProblem,
  newestActivityFirst,
  periodEndDay,
  restartBillingAction,
  restartBillingBody,
  restartReasonProblem,
  restartWords,
  sendBillActionWithUpfront,
  sendBillBody,
  sendBillWords,
  showMoreLabel,
  upfrontIsOn,
  upfrontLine,
  upfrontPlan,
} from '../src/lib/billingRelease2';

const PRICE = 354000;
const cfg = (o: Partial<OnboardingConfig> = {}) => ({
  firstMonthUpfront: false,
  firstMonthUpfrontOutlets: [] as string[],
  ...o,
});

describe('the day the monthly price starts', () => {
  it('is a calendar month after Send bill', () => {
    assert.equal(firstDebitOnFor('2026-10-30'), '2026-11-30');
    assert.equal(firstDebitOnFor('2026-12-15'), '2027-01-15');
    assert.equal(firstDebitOnFor('2026-10-01'), '2026-11-01');
  });
  it('lands on the last day of a short month, never the month after', () => {
    assert.equal(firstDebitOnFor('2027-01-31'), '2027-02-28');
    assert.equal(firstDebitOnFor('2028-01-31'), '2028-02-29');
    assert.equal(firstDebitOnFor('2026-08-31'), '2026-09-30');
    assert.equal(firstDebitOnFor('2027-01-29'), '2027-02-28');
  });
  it('the first month ends the day before it starts', () => {
    assert.equal(periodEndDay('2026-10-30'), '2026-11-29');
    assert.equal(periodEndDay('2026-10-28'), '2026-11-27');
    assert.equal(periodEndDay('2027-01-31'), '2027-02-27');
  });
  it('agrees with the shared calendar sums the server uses, on every day of three years', () => {
    let day = '2026-01-01';
    for (let i = 0; i < 365 * 3; i += 1) {
      const server = shiftIsoDay(shiftIsoDay(addIsoMonths(day, 1), -1), 1);
      assert.equal(firstDebitOnFor(day), server, day);
      for (const n of [1, 2, 12])
        assert.equal(addMonthsClamped(day, n), addIsoMonths(day, n), `${day} +${n}`);
      day = shiftIsoDay(day, 1);
    }
  });
});

describe('below the monthly price', () => {
  it('is below only when both figures are known and the amount is lower', () => {
    assert.equal(isBelowMonthly(100, PRICE), true);
    assert.equal(isBelowMonthly(PRICE, PRICE), false);
    assert.equal(isBelowMonthly(PRICE + 100, PRICE), false);
    assert.equal(isBelowMonthly(null, PRICE), false);
    assert.equal(isBelowMonthly(100, null), false);
    assert.equal(isBelowMonthly(0, PRICE), false);
  });
  const need = {
    amountPaise: 100,
    monthlyPricePaise: PRICE,
    billedPaise: null as number | null,
    billOpen: false,
    upfrontStarts: false,
  };
  it('needs a super-admin and a reason for a new bill below the price', () => {
    assert.equal(lowerFirstMonthNeeded(need), true);
  });
  it('needs them when the amount of the open bill is changed to one below the price', () => {
    assert.equal(
      lowerFirstMonthNeeded({ ...need, amountPaise: 100, billedPaise: PRICE, billOpen: true }),
      true,
    );
    assert.equal(
      lowerFirstMonthNeeded({ ...need, amountPaise: 100, billedPaise: 200, billOpen: true }),
      true,
    );
  });
  it('needs them when an upfront approval would start, even for the bill already out at that amount', () => {
    assert.equal(
      lowerFirstMonthNeeded({
        ...need,
        billedPaise: 100,
        billOpen: true,
        upfrontStarts: true,
      }),
      true,
    );
  });
  it('does not need them to send the open bill again unchanged, or to move only its day, while no upfront starts', () => {
    // Same ₹1 bill, no new approval: only sent again (the due day is not part of the test).
    assert.equal(
      lowerFirstMonthNeeded({ ...need, billedPaise: 100, billOpen: true, upfrontStarts: false }),
      false,
    );
  });
  it('does not need them at or above the price, or while the price is not known', () => {
    assert.equal(lowerFirstMonthNeeded({ ...need, amountPaise: PRICE }), false);
    assert.equal(lowerFirstMonthNeeded({ ...need, amountPaise: PRICE + 100 }), false);
    assert.equal(lowerFirstMonthNeeded({ ...need, monthlyPricePaise: null }), false);
    assert.equal(lowerFirstMonthNeeded({ ...need, amountPaise: null }), false);
  });
  it('a plain admin is told, in words, that only a super-admin can; a super-admin is not', () => {
    assert.equal(
      lowerFirstMonthBlock({ needed: true, monthlyPricePaise: PRICE, isSuperAdmin: false }),
      'Only a super-admin can send a first month below ₹3,540.',
    );
    assert.equal(
      lowerFirstMonthBlock({ needed: true, monthlyPricePaise: PRICE, isSuperAdmin: true }),
      null,
    );
    // Not needed (the price, or the open bill sent again): nobody is blocked.
    assert.equal(
      lowerFirstMonthBlock({ needed: false, monthlyPricePaise: PRICE, isSuperAdmin: false }),
      null,
    );
  });
  it('asks for a reason, and only while one is needed', () => {
    const f = { needed: true };
    assert.match(lowerFirstMonthReasonProblem({ ...f, reason: '' })!, /why/i);
    assert.match(lowerFirstMonthReasonProblem({ ...f, reason: '  ab ' })!, /at least 3/);
    assert.match(
      lowerFirstMonthReasonProblem({ ...f, reason: 'x'.repeat(LOWER_FIRST_MONTH_REASON_MAX + 1) })!,
      /Keep it to 300/,
    );
    assert.equal(lowerFirstMonthReasonProblem({ ...f, reason: 'Owner agreed on the phone' }), null);
    assert.equal(lowerFirstMonthReasonProblem({ needed: false, reason: '' }), null);
  });
  it('the body carries the reason when one is needed and passes the server schema; otherwise it carries none', () => {
    const below = sendBillBody({
      amountText: '1',
      dueOn: '2026-11-09',
      reason: '  Owner agreed on the phone ',
      reasonNeeded: true,
    });
    assert.deepEqual(below, {
      amountPaise: 100,
      dueOn: '2026-11-09',
      reason: 'Owner agreed on the phone',
    });
    assert.ok(sendSetupBillRequestSchema.safeParse(below).success);
    const at = sendBillBody({
      amountText: '3,540',
      dueOn: '2026-11-09',
      messageLang: 'en',
      reason: 'left over from before',
      reasonNeeded: false,
    });
    assert.deepEqual(at, { amountPaise: PRICE, dueOn: '2026-11-09', messageLang: 'en' });
    assert.ok(sendSetupBillRequestSchema.safeParse(at).success);
    // The open ₹1 bill sent again: no reason box, so none goes (an empty one would be refused).
    const again = sendBillBody({
      amountText: '1',
      dueOn: '2026-11-12',
      reason: '',
      reasonNeeded: false,
    });
    assert.deepEqual(again, { amountPaise: 100, dueOn: '2026-11-12' });
    assert.ok(sendSetupBillRequestSchema.safeParse(again).success);
  });
  it('the reason limits match the server schema', () => {
    const base = { amountPaise: 100, dueOn: '2026-11-09' };
    assert.ok(sendSetupBillRequestSchema.safeParse({ ...base, reason: 'abc' }).success);
    assert.ok(!sendSetupBillRequestSchema.safeParse({ ...base, reason: 'ab' }).success);
    assert.ok(
      sendSetupBillRequestSchema.safeParse({
        ...base,
        reason: 'x'.repeat(LOWER_FIRST_MONTH_REASON_MAX),
      }).success,
    );
    assert.ok(
      !sendSetupBillRequestSchema.safeParse({
        ...base,
        reason: 'x'.repeat(LOWER_FIRST_MONTH_REASON_MAX + 1),
      }).success,
    );
  });
});

describe('when the upfront approval is on', () => {
  it('is on for everyone when the switch is on', () => {
    assert.equal(upfrontIsOn(cfg({ firstMonthUpfront: true }), '15E'), true);
  });
  it('is on only for the named outlets while the switch is off', () => {
    const c = cfg({ firstMonthUpfrontOutlets: ['2E', '15E'] });
    assert.equal(upfrontIsOn(c, '15E'), true);
    assert.equal(upfrontIsOn(c, '3E'), false);
  });
  it('is off by default, and while the settings have not loaded', () => {
    assert.equal(upfrontIsOn(cfg(), '15E'), false);
    assert.equal(upfrontIsOn(undefined, '15E'), false);
  });
});

describe('the upfront plan', () => {
  const on = {
    paymentsOn: true,
    firstBillAutopay: true,
    switchedOn: true,
    amountPaise: 100,
    monthlyPricePaise: PRICE,
    approvalOut: false,
    today: '2026-10-30',
  };
  it('applies below the price, with the switch on for the outlet and autopay on', () => {
    assert.deepEqual(upfrontPlan(on), { monthlyPaise: PRICE, firstDebitOn: '2026-11-30' });
  });
  it('does not apply when anything is off, at the price, or while an approval is already out', () => {
    assert.equal(upfrontPlan({ ...on, switchedOn: false }), null);
    assert.equal(upfrontPlan({ ...on, paymentsOn: false }), null);
    assert.equal(upfrontPlan({ ...on, firstBillAutopay: false }), null);
    assert.equal(upfrontPlan({ ...on, amountPaise: PRICE }), null);
    assert.equal(upfrontPlan({ ...on, amountPaise: PRICE + 100 }), null);
    assert.equal(upfrontPlan({ ...on, approvalOut: true }), null);
    assert.equal(upfrontPlan({ ...on, monthlyPricePaise: null }), null);
  });
  it('the preview then says the one approval takes the first month now and the price from the day it starts', () => {
    const base = {
      paymentsOn: true,
      amountPaise: 100,
      monthlyPricePaise: PRICE,
      billedPaise: null,
      billedDueOn: null,
      dueOn: '2026-11-09',
      billOpen: false,
      approvalOut: false,
      firstEver: true,
      firstBillAutopay: true,
    };
    const action = sendBillActionWithUpfront({
      ...base,
      upfront: upfrontPlan(on),
    });
    assert.equal(action.autopay, true);
    assert.deepEqual(action.upfront, { monthlyPaise: PRICE, firstDebitOn: '2026-11-30' });
    const p = dealerReceives(action);
    assert.match(
      p.charged!,
      /₹1 is taken the moment they approve the autopay, for the first month/,
    );
    assert.match(p.charged!, /₹3,540 on 30 Nov 2026/);
    // Without a plan, a below-price bill is the link, as before.
    const link = sendBillActionWithUpfront({ ...base, upfront: null });
    assert.equal(link.autopay, false);
    assert.equal(link.upfront, undefined);
  });
});

describe('the words under the Send bill form', () => {
  const plan = { monthlyPaise: PRICE, firstDebitOn: '2026-11-30' };
  it('says the one approval, the first month now, then the price from the day', () => {
    const w = sendBillWords({
      paymentsOn: true,
      monthlyPricePaise: PRICE,
      amountPaise: 100,
      upfront: plan,
      approvalOut: false,
    });
    assert.match(
      w,
      /^The owner approves autopay once: ₹1 is taken now for the first month, then ₹3,540 from 30 Nov 2026 every month\./,
    );
    assert.match(w, /never how to pay\.$/);
  });
  it('says a one-time payment link for another amount when the upfront is off', () => {
    const w = sendBillWords({
      paymentsOn: true,
      monthlyPricePaise: PRICE,
      amountPaise: 100,
      upfront: null,
      approvalOut: false,
    });
    assert.match(w, /one-time payment link/);
    assert.match(w, /not the monthly price/);
  });
  it('says the autopay approval at the price, and that Razorpay off means no link', () => {
    assert.match(
      sendBillWords({
        paymentsOn: true,
        monthlyPricePaise: PRICE,
        amountPaise: PRICE,
        upfront: null,
        approvalOut: false,
      }),
      /asks the owner to approve autopay: approving it pays this ₹3,540 now/,
    );
    assert.match(
      sendBillWords({
        paymentsOn: false,
        monthlyPricePaise: PRICE,
        amountPaise: PRICE,
        upfront: null,
        approvalOut: false,
      }),
      /Razorpay is not switched on/,
    );
  });
  it('says the approval is already out, before any word about the price, whatever is typed', () => {
    const plain = sendBillWords({
      paymentsOn: true,
      monthlyPricePaise: PRICE,
      amountPaise: 100,
      upfront: null,
      approvalOut: true,
    });
    assert.equal(
      plain,
      'The approval is already with the owner. Razorpay does not text it again; you get the WhatsApp words to send.',
    );
    assert.doesNotMatch(plain, /not the monthly price|one-time payment link/);
    // Typing the price changes nothing: it is only sent again.
    assert.equal(
      sendBillWords({
        paymentsOn: true,
        monthlyPricePaise: PRICE,
        amountPaise: PRICE,
        upfront: null,
        approvalOut: true,
      }),
      plain,
    );
  });
  it('names the first month and the start day when the approval out is an upfront one', () => {
    const w = sendBillWords({
      paymentsOn: true,
      monthlyPricePaise: PRICE,
      amountPaise: 100,
      upfront: null,
      approvalOut: true,
      approvalOutUpfront: { upfrontPaise: 100, monthlyPaise: PRICE, firstDebitOn: '2026-11-30' },
    });
    assert.match(w, /^The approval is already with the owner\. Razorpay does not text it again; you get the WhatsApp words to send\./);
    assert.match(w, /It takes ₹1 for the first month, then ₹3,540 from 30 Nov 2026\.$/);
  });
  it('reads the upfront figures of the approval that is out, and none from a plain one', () => {
    assert.deepEqual(
      approvalOutUpfront({ upfrontPaise: 100, amountPaise: PRICE, firstDebitOn: '2026-11-30' }),
      { upfrontPaise: 100, monthlyPaise: PRICE, firstDebitOn: '2026-11-30' },
    );
    assert.equal(
      approvalOutUpfront({ upfrontPaise: null, amountPaise: PRICE, firstDebitOn: null }),
      null,
    );
    assert.equal(approvalOutUpfront(null), null);
    assert.equal(
      approvalOutUpfront({ upfrontPaise: 100, amountPaise: PRICE, firstDebitOn: null })!
        .firstDebitOn,
      null,
    );
  });
  it('never uses a pay-here word the dealer app is not allowed to show', () => {
    for (const [upfront, approvalOut] of [
      [plan, false],
      [null, false],
      [null, true],
    ] as const) {
      const w = sendBillWords({
        paymentsOn: true,
        monthlyPricePaise: PRICE,
        amountPaise: 100,
        upfront,
        approvalOut,
      });
      assert.doesNotMatch(w, /pay here|pay now/i);
    }
  });
});

describe('the Autopay panel line', () => {
  const a = { upfrontPaise: 100, amountPaise: PRICE, firstDebitOn: '2026-11-30' };
  it('names the first month and when the price starts, without the year this year', () => {
    assert.equal(upfrontLine(a, '2026-10-30'), '₹1 first month, then ₹3,540 from 30 Nov');
  });
  it('keeps the year when it is another year', () => {
    assert.equal(
      upfrontLine({ ...a, firstDebitOn: '2027-01-30' }, '2026-12-30'),
      '₹1 first month, then ₹3,540 from 30 Jan 2027',
    );
  });
  it('has no line for an autopay without an upfront amount, and copes with no day', () => {
    assert.equal(upfrontLine({ ...a, upfrontPaise: null }, '2026-10-30'), null);
    assert.equal(
      upfrontLine({ ...a, firstDebitOn: null }, '2026-10-30'),
      '₹1 first month, then ₹3,540 a month',
    );
  });
});

describe('billing history', () => {
  const at = (n: number): BillingActivityItem => ({
    at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
    kind: 'bill',
    words: `line ${n}`,
    byName: null,
    paymentId: null,
  });
  const many = Array.from({ length: 45 }, (_, i) => at(i));
  it('puts the newest first whatever order it arrives in, keeping ties as they came', () => {
    const sorted = newestActivityFirst([at(1), at(3), at(2), { ...at(3), words: 'same time' }]);
    assert.deepEqual(
      sorted.map((x) => x.words),
      ['line 3', 'same time', 'line 2', 'line 1'],
    );
  });
  it('shows twenty, then twenty more, then the last five', () => {
    const sorted = newestActivityFirst(many);
    let p = activityPage(sorted, ACTIVITY_PAGE);
    assert.equal(p.lines.length, 20);
    assert.equal(p.left, 25);
    assert.equal(showMoreLabel(p.left), 'Show 20 more');
    p = activityPage(sorted, ACTIVITY_PAGE * 2);
    assert.equal(p.lines.length, 40);
    assert.equal(showMoreLabel(p.left), 'Show 5 more');
    p = activityPage(sorted, ACTIVITY_PAGE * 3);
    assert.equal(p.lines.length, 45);
    assert.equal(p.left, 0);
  });
  it('says who: the admin, or the owner or automatic when nobody on the team did', () => {
    assert.equal(activityWho('Asha'), 'Asha');
    assert.equal(activityWho(null), 'Owner or automatic');
    assert.equal(activityWho('  '), 'Owner or automatic');
  });
});

describe('Bill this outlet again', () => {
  const setup = (
    ended: { at: string; reason: string } | null,
    lost = null as object | null,
    // Everything the old guess read: none of it may matter now.
    sub: Partial<{
      paidThrough: string | null;
      nextBillOn: string | null;
      billingHold: object | null;
    }> = {},
  ) =>
    ({
      lost,
      subscription: {
        paidThrough: '2026-11-27',
        nextBillOn: '2026-11-24',
        billingHold: null,
        billingEnded: ended,
        ...sub,
      },
    }) as unknown as Parameters<typeof billingHasEnded>[0];
  const ENDED = { at: '2026-10-29T10:00:00Z', reason: 'refund' };

  it('is not shown for an outlet that is billed as usual', () => {
    assert.equal(billingHasEnded(setup(null)), false);
  });
  it("reads the server's flag and nothing else", () => {
    assert.equal(billingHasEnded(setup(ENDED)), true);
    // No next bill but no flag: that is not "ended" (the old guess said it was).
    assert.equal(billingHasEnded(setup(null, null, { nextBillOn: null })), false);
    // A flag with a next bill still planned is still ended: the server's word wins.
    assert.equal(billingHasEnded(setup(ENDED, null, { nextBillOn: '2026-12-01' })), true);
    assert.equal(billingHasEnded(setup(ENDED, null, { paidThrough: null })), true);
  });
  it('is not shown for a closed outlet', () => {
    assert.equal(billingHasEnded(setup(ENDED, { reason: 'closed' })), false);
  });
  it('says, to every admin, when billing ended, in India’s calendar', () => {
    assert.equal(
      billingEndedLine(setup(ENDED), '2026-10-30'),
      'Billing ended when the first month was given back on 29 Oct.',
    );
    // 20:00 UTC on the 29th is already the 30th in India.
    assert.equal(
      billingEndedLine(setup({ at: '2026-10-29T20:00:00Z', reason: 'refund' }), '2026-10-30'),
      'Billing ended when the first month was given back on 30 Oct.',
    );
    assert.equal(
      billingEndedLine(setup({ at: '2026-10-29T10:00:00Z', reason: 'refund' }), '2027-01-05'),
      'Billing ended when the first month was given back on 29 Oct 2026.',
    );
    assert.equal(billingEndedLine(setup(null), '2026-10-30'), null);
    assert.equal(
      billingEndedLine(setup({ at: 'nonsense', reason: 'x' }), '2026-10-30'),
      'Billing ended when the first month was given back.',
    );
  });
  it('the button is for a super-admin only', () => {
    assert.equal(canBillAgain(setup(ENDED), true), true);
    assert.equal(canBillAgain(setup(ENDED), false), false);
    assert.equal(canBillAgain(setup(null), true), false);
  });
  it('asks for a reason the server accepts', () => {
    assert.ok(restartReasonProblem(''));
    assert.ok(restartReasonProblem('ab'));
    assert.ok(restartReasonProblem('x'.repeat(RESTART_REASON_MAX + 1)));
    assert.equal(restartReasonProblem('Owner called, wants to carry on'), null);
    assert.ok(restartBillingSchema.safeParse(restartBillingBody('  Owner called  ')).success);
    assert.deepEqual(restartBillingBody('  Owner called  '), { reason: 'Owner called' });
    assert.ok(!restartBillingSchema.safeParse({ reason: 'ab' }).success);
    assert.ok(restartBillingSchema.safeParse({ reason: 'x'.repeat(RESTART_REASON_MAX) }).success);
    assert.ok(
      !restartBillingSchema.safeParse({ reason: 'x'.repeat(RESTART_REASON_MAX + 1) }).success,
    );
  });
  it('says the new month starts today, with the real date', () => {
    assert.match(restartWords('2026-10-30'), /the month that starts today \(30 Oct\)\./);
    assert.match(restartWords('2026-01-05'), /the month that starts today \(5 Jan\)\./);
    assert.doesNotMatch(restartWords('2026-10-30'), /next daily run|that day|begins that/);
  });
  it('the preview says nothing is sent now, a bill follows on the next daily run, and it shows in the app list', () => {
    const p = dealerReceives(restartBillingAction(PRICE));
    assert.equal(p.charged, null);
    assert.ok(p.notes.some((n) => /next daily run raises a ₹3,540 bill/.test(n)));
    assert.ok(p.lines.some((l) => /payments list/.test(l.words)));
  });
});

describe('every outlet’s autopay', () => {
  const row = (o: Partial<AdminAutopayListRow>): AdminAutopayListRow => ({
    dealerId: 'd1',
    dealerCode: '15E',
    state: 'on',
    amountPaise: PRICE,
    nextDebitOn: '2026-11-28',
    paidThrough: '2026-11-27',
    approvalSentAt: null,
    approvalExpiresAt: null,
    refundAskedAt: null,
    needsCall: false,
    upfrontPaise: null,
    endedAt: null,
    endedBy: null,
    ...o,
  });
  const rows = [
    row({
      dealerId: 'a',
      dealerCode: '2E',
      state: 'off',
      endedAt: '2026-10-20T06:00:00Z',
      endedBy: 'dealer',
    }),
    row({ dealerId: 'b', dealerCode: '10E', state: 'on', nextDebitOn: '2026-12-05' }),
    row({ dealerId: 'c', dealerCode: '3E', state: 'on', nextDebitOn: '2026-11-02' }),
    row({
      dealerId: 'd',
      dealerCode: '7E',
      state: 'setting_up',
      approvalSentAt: '2026-10-29T06:00:00Z',
      approvalExpiresAt: '2026-11-05T18:29:00Z',
    }),
    row({
      dealerId: 'e',
      dealerCode: '8E',
      state: 'setting_up',
      approvalSentAt: '2026-10-25T06:00:00Z',
      approvalExpiresAt: '2026-11-01T18:29:00Z',
    }),
    row({ dealerId: 'f', dealerCode: '9E', state: 'failing' }),
    row({
      dealerId: 'g',
      dealerCode: '4E',
      state: 'on',
      nextDebitOn: '2026-11-02',
      refundAskedAt: '2026-10-29T06:00:00Z',
      needsCall: true,
    }),
  ];
  it('keeps the server’s order: with no filter, and inside a filter', () => {
    // Deliberately not the order a sort would give: the server decided it.
    const serverOrder = [rows[6]!, rows[5]!, rows[0]!, rows[3]!, rows[2]!, rows[1]!, rows[4]!];
    assert.deepEqual(
      filterAutopayRows(serverOrder, null).map((r) => r.dealerId),
      serverOrder.map((r) => r.dealerId),
    );
    assert.deepEqual(
      filterAutopayRows(serverOrder, 'on').map((r) => r.dealerId),
      ['g', 'c', 'b'],
    );
    assert.deepEqual(
      filterAutopayRows(serverOrder, 'setting_up').map((r) => r.dealerId),
      ['d', 'e'],
    );
  });
  it('filters by state and counts each', () => {
    assert.equal(filterAutopayRows(rows, null).length, 7);
    assert.deepEqual(
      filterAutopayRows(rows, 'setting_up')
        .map((r) => r.dealerId)
        .sort(),
      ['d', 'e'],
    );
    assert.deepEqual(autopayStateCounts(rows), { failing: 1, setting_up: 2, on: 3, off: 1 });
  });
  it('reads a state from the address, and ignores anything else', () => {
    assert.equal(listStateFromParam('setting_up'), 'setting_up');
    assert.equal(listStateFromParam('nope'), null);
    assert.equal(listStateFromParam(null), null);
  });
  it('says each column in words, in India’s calendar', () => {
    const f = autopayRowFacts(rows[3]!, '2026-10-30');
    assert.equal(f.amount, '₹3,540 a month');
    assert.equal(f.waiting, 'Sent 29 Oct, runs out 5 Nov');
    assert.equal(f.nextDebit, '28 Nov');
    assert.equal(f.paidTill, '27 Nov');
    assert.equal(f.refundAsked, null);
    const asked = autopayRowFacts(rows[6]!, '2026-10-30');
    assert.equal(asked.refundAsked, 'Asked 29 Oct');
    const off = autopayRowFacts(rows[0]!, '2026-10-30');
    assert.equal(off.endedDay, '20 Oct');
    assert.equal(off.waiting, null);
  });
  it('labels each date in its own words for the phone card', () => {
    const waiting = autopayRowFacts(rows[3]!, '2026-10-30').phone;
    assert.equal(waiting.nextDebit, 'Next debit 28 Nov');
    assert.equal(waiting.paidTill, 'Paid till 27 Nov');
    assert.equal(waiting.waiting, 'Waiting since 29 Oct, runs out 5 Nov');
    assert.equal(waiting.refundAsked, null);
    assert.equal(autopayRowFacts(rows[6]!, '2026-10-30').phone.refundAsked, 'Refund asked 29 Oct');
    // A year away keeps the year.
    assert.equal(autopayRowFacts(rows[3]!, '2027-01-05').phone.nextDebit, 'Next debit 28 Nov 2026');
    // Waiting is only said while an approval waits.
    assert.equal(autopayRowFacts(rows[1]!, '2026-10-30').phone.waiting, null);
  });
  it('shows the refund ask only while the owner still needs a call', () => {
    const base = { refundAskedAt: '2026-10-29T06:00:00Z' };
    assert.equal(
      autopayRowFacts(row({ ...base, needsCall: true }), '2026-10-30').refundAsked,
      'Asked 29 Oct',
    );
    for (const r of [row({ ...base, needsCall: false }), row({ needsCall: true })]) {
      const f = autopayRowFacts(r, '2026-10-30');
      assert.equal(f.refundAsked, null);
      assert.equal(f.phone.refundAsked, null);
    }
  });
  it('shows the special first month in the amount', () => {
    assert.equal(
      autopayRowFacts(row({ upfrontPaise: 100 }), '2026-10-30').amount,
      '₹1 now, then ₹3,540 a month',
    );
    assert.equal(autopayRowFacts(row({ upfrontPaise: null }), '2026-10-30').amount, '₹3,540 a month');
    assert.equal(
      autopayRowFacts(row({ upfrontPaise: 100, amountPaise: null }), '2026-10-30').amount,
      null,
    );
  });
  it('copes with an outlet that has no autopay figures, and prints no dash for them', () => {
    const f = autopayRowFacts(
      row({ state: 'off', amountPaise: null, nextDebitOn: null, paidThrough: null }),
      '2026-10-30',
    );
    assert.deepEqual(
      [f.amount, f.nextDebit, f.paidTill, f.waiting, f.refundAsked, f.endedDay],
      [null, null, null, null, null, null],
    );
    assert.deepEqual(Object.values(f.phone), [null, null, null, null]);
    for (const v of [...Object.values(f), ...Object.values(f.phone)])
      assert.ok(v === null || !/—/.test(String(v)));
  });
  it('a row opens the outlet’s Info tab', () => {
    assert.equal(autopayRowHref('abc123'), '/dealers/abc123?tab=info');
  });
});
