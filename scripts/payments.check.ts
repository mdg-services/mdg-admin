/**
 * Checks for the decisions behind the Payments page (`src/pages/payments/
 * format.ts`): which buttons a payment allows, how much can be refunded, what a
 * typed amount means, and whether the "Request a payment" form agrees with the
 * shared schema it is sent through.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:payments
 *
 * which is `npx tsx --test scripts/payments.check.ts`. Like `check:intake`, it
 * reads `@dk/shared` the way the app does, so `shared` must have been built.
 *
 * They sit outside `src/` on purpose: the build type-checks `src/`, and a test
 * import there would break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PAYMENT_MAX_PAISE,
  PAYMENT_MIN_PAISE,
  PAYMENT_STATUSES,
  type AdminPayment,
  type PaymentStatus,
} from '../shared/src/types/payment';
import { parseRupeesToPaise } from '../shared/src/lib/money';
import {
  cancelPaymentSchema,
  createPaymentSchema,
  refundPaymentSchema,
} from '../shared/src/schemas/payment';
import {
  PAYMENT_NOTE_MAX,
  PAYMENT_REASON_MAX,
  PAYMENT_REASON_MIN,
  PAYMENT_TITLE_MAX,
  PAYMENT_TITLE_MIN,
  type RequestDraft,
  allowedActions,
  amountProblem,
  cancelSentence,
  checkOutcome,
  dashboardUrl,
  extraCaptureLine,
  hasOpenProblem,
  idFromParam,
  isPastDue,
  linkSentLine,
  newestFirst,
  pageFromParam,
  reasonProblem,
  refundAmount,
  refundSentence,
  refundable,
  rupeesText,
  sendSmsLabel,
  sentence,
  statusFromParam,
  statusHint,
  statusTone,
  tidyPhone,
  validateRequest,
} from '../src/pages/payments/format';

const DEALER_ID = '65f0c0ffee0123456789abcd';

/** A payment as the server sends it, with whatever a test needs changed. */
function payment(over: Partial<AdminPayment> = {}): AdminPayment {
  return {
    id: '65f0c0ffee0123456789abce',
    number: 'MDG-2026-00012',
    title: 'Dealer Kavach, October 2026',
    purpose: 'subscription',
    note: null,
    amountPaise: 499_900,
    currency: 'INR',
    status: 'due',
    dueDate: '2026-10-31',
    createdAt: '2026-10-23T05:00:00.000Z',
    paidAt: null,
    method: null,
    razorpayPaymentId: null,
    refundedPaise: 0,
    lastFailure: null,
    dealerId: DEALER_ID,
    dealerCode: '15E',
    createdByName: 'Asha',
    razorpayOrderId: null,
    razorpayLinkId: 'plink_AbC123xyz',
    linkUrl: 'https://rzp.io/i/abc',
    paidVia: null,
    feePaise: null,
    taxPaise: null,
    attempts: [],
    refunds: [],
    extraCaptures: [],
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    linkSentTo: null,
    problem: null,
    updatedAt: '2026-10-23T05:00:00.000Z',
    ...over,
  };
}

const PAID = payment({
  status: 'paid',
  paidAt: '2026-10-24T05:00:00.000Z',
  razorpayPaymentId: 'pay_Abc123xyz',
  method: 'upi',
  paidVia: 'link',
});

describe('statusTone', () => {
  it('has a colour for every status the shared contract knows', () => {
    for (const s of PAYMENT_STATUSES) assert.ok(statusTone(s), s);
  });

  it('shows money that came in as green, and what is still owed as amber', () => {
    assert.equal(statusTone('paid'), 'success');
    assert.equal(statusTone('due'), 'warning');
  });
});

describe('refundable', () => {
  it('is all of it once paid, and what is left after a part refund', () => {
    assert.equal(refundable(PAID), 499_900);
    assert.equal(
      refundable({ ...PAID, status: 'partially_refunded', refundedPaise: 100_000 }),
      399_900,
    );
  });

  it('is nothing for a payment that was never paid, or already given back in full', () => {
    for (const status of ['due', 'processing', 'cancelled', 'refunded'] as PaymentStatus[]) {
      assert.equal(refundable({ ...PAID, status, refundedPaise: 0 }), 0, status);
    }
  });

  it('never goes below zero', () => {
    assert.equal(refundable({ ...PAID, status: 'partially_refunded', refundedPaise: 600_000 }), 0);
  });
});

describe('allowedActions', () => {
  it('lets any admin copy the link, text it, look it up and cancel a payment that is due', () => {
    const can = allowedActions(payment(), false);
    assert.deepEqual(can, {
      copyLink: true,
      sendSms: true,
      check: true,
      cancel: true,
      refund: false,
      markChecked: false,
    });
  });

  it('cannot text a link that has not been made yet, and has nothing to look up at Razorpay', () => {
    const can = allowedActions(payment({ razorpayLinkId: null, linkUrl: null }), false);
    assert.equal(can.sendSms, false);
    assert.equal(can.check, false);
    // …but the link itself can still be made.
    assert.equal(can.copyLink, true);
  });

  it('cannot text a link that has expired, but can make a fresh one to copy', () => {
    // The server blanks `linkUrl` once a link can no longer be paid; the id stays.
    const can = allowedActions(payment({ linkUrl: null }), false);
    assert.equal(can.sendSms, false);
    assert.equal(can.copyLink, true);
    assert.equal(can.check, true);
  });

  it('offers nothing to cancel or send once Razorpay has the money in flight', () => {
    const can = allowedActions(payment({ status: 'processing' }), true);
    assert.equal(can.cancel, false);
    assert.equal(can.copyLink, false);
    assert.equal(can.sendSms, false);
    assert.equal(can.check, true);
  });

  it('shows Refund to a super-admin on a paid payment, and to nobody else', () => {
    assert.equal(allowedActions(PAID, true).refund, true);
    assert.equal(allowedActions(PAID, false).refund, false);
    assert.equal(allowedActions(PAID, true).cancel, false);
  });

  it('keeps Refund while some of it is left, and drops it when none is', () => {
    const part = { ...PAID, status: 'partially_refunded' as const, refundedPaise: 100_000 };
    assert.equal(allowedActions(part, true).refund, true);
    const all = { ...PAID, status: 'refunded' as const, refundedPaise: 499_900 };
    assert.equal(allowedActions(all, true).refund, false);
  });

  it('can still look up a cancelled payment, which may have been paid after it was withdrawn', () => {
    const cancelled = payment({ status: 'cancelled', cancelledAt: '2026-10-24T05:00:00.000Z' });
    const can = allowedActions(cancelled, true);
    assert.equal(can.check, true);
    assert.equal(can.cancel, false);
    assert.equal(can.refund, false);
  });

  it('offers Mark as checked only while a problem is open', () => {
    const open = {
      reason: 'Paid twice',
      at: '2026-10-24T05:00:00.000Z',
      checkedAt: null,
      checkedByName: null,
    };
    assert.equal(allowedActions(payment({ problem: open }), false).markChecked, true);
    assert.equal(
      allowedActions(
        payment({
          problem: { ...open, checkedAt: '2026-10-25T05:00:00.000Z', checkedByName: 'Asha' },
        }),
        false,
      ).markChecked,
      false,
    );
    assert.equal(hasOpenProblem(payment()), false);
  });
});

describe('sendSmsLabel', () => {
  it('says "again" only once a message has gone', () => {
    assert.equal(sendSmsLabel({ linkSentTo: null }), 'Send link by SMS');
    assert.equal(
      sendSmsLabel({ linkSentTo: { phone: '9876543210', email: null } }),
      'Send SMS again',
    );
  });
});

describe('refundAmount', () => {
  const part = {
    status: 'partially_refunded' as const,
    amountPaise: 499_900,
    refundedPaise: 100_000,
  };

  it('reads rupees, and accepts exactly what is left', () => {
    assert.deepEqual(refundAmount('500', PAID), { ok: true, paise: 50_000 });
    assert.deepEqual(refundAmount('3,999', part), { ok: true, paise: 399_900 });
  });

  it('refuses more than what is left, in rupees', () => {
    const r = refundAmount('4000', part);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.problem : '', /^At most ₹3,999 can be given back\.$/);
  });

  it('refuses nothing, junk, and less than a rupee', () => {
    for (const bad of ['', '  ', 'abc', '-5', '12.345', '0.5']) {
      assert.equal(refundAmount(bad, PAID).ok, false, bad);
    }
  });

  it('says so when nothing is left', () => {
    const none = { status: 'refunded' as const, amountPaise: 499_900, refundedPaise: 499_900 };
    const r = refundAmount('100', none);
    assert.equal(!r.ok && r.problem, 'Nothing is left to give back.');
  });
});

describe('rupeesText', () => {
  it('writes what a person would type, and reads back to the same paise', () => {
    assert.equal(rupeesText(499_900), '4999');
    assert.equal(rupeesText(499_950), '4999.50');
    assert.equal(rupeesText(5), '0.05');
    for (const paise of [100, 101, 499_900, 499_950, 12_345_678]) {
      assert.equal(parseRupeesToPaise(rupeesText(paise)), paise, String(paise));
    }
  });
});

describe('amountProblem', () => {
  it('accepts ordinary amounts however they are typed', () => {
    for (const ok of ['4999', '4,999', '₹ 4,999.5', '4999.50', '1', '5,00,000']) {
      assert.equal(amountProblem(ok), null, ok);
    }
  });

  it('keeps to the contract’s floor and ceiling', () => {
    assert.equal(amountProblem('0.99'), `The smallest payment is ₹${PAYMENT_MIN_PAISE / 100}.`);
    assert.equal(amountProblem('500000.01'), 'The largest payment is ₹5,00,000.');
    assert.equal(PAYMENT_MAX_PAISE, 50_000_000);
  });

  it('refuses text that is not an amount', () => {
    for (const bad of ['', 'ten', '1.234', '-1', '1e5']) {
      assert.notEqual(amountProblem(bad), null, bad);
    }
  });
});

describe('reasonProblem', () => {
  it('agrees with the shared schemas about how long a reason may be', () => {
    for (const reason of [
      'a'.repeat(PAYMENT_REASON_MIN - 1),
      'a'.repeat(PAYMENT_REASON_MIN),
      'a'.repeat(PAYMENT_REASON_MAX),
      'a'.repeat(PAYMENT_REASON_MAX + 1),
      '  ab  ',
      '',
    ]) {
      const ok = reasonProblem(reason) === null;
      assert.equal(cancelPaymentSchema.safeParse({ reason }).success, ok, JSON.stringify(reason));
      assert.equal(refundPaymentSchema.safeParse({ reason }).success, ok, JSON.stringify(reason));
    }
  });
});

describe('dashboardUrl', () => {
  it('links a Razorpay id to the page that shows it', () => {
    assert.equal(
      dashboardUrl('payment', 'pay_Abc123xyz'),
      'https://dashboard.razorpay.com/app/payments/pay_Abc123xyz',
    );
    assert.match(dashboardUrl('order', 'order_Abc123xyz') ?? '', /\/app\/orders\/order_Abc123xyz$/);
    assert.match(
      dashboardUrl('link', 'plink_Abc123xyz') ?? '',
      /\/app\/paymentlinks\/plink_Abc123xyz$/,
    );
  });

  it('makes no link from anything that is not that kind of id', () => {
    assert.equal(dashboardUrl('payment', null), null);
    assert.equal(dashboardUrl('payment', 'order_Abc123xyz'), null);
    assert.equal(dashboardUrl('payment', 'pay_x/../../evil'), null);
    assert.equal(dashboardUrl('payment', 'pay_x?next=1'), null);
    assert.equal(dashboardUrl('link', 'pay_Abc123xyz'), null);
  });
});

describe('the URL parameters', () => {
  it('lets only a real id, status and page through', () => {
    assert.equal(idFromParam(DEALER_ID), DEALER_ID);
    assert.equal(idFromParam('../etc'), null);
    assert.equal(idFromParam(null), null);
    assert.equal(statusFromParam('paid'), 'paid');
    assert.equal(statusFromParam('nonsense'), undefined);
    assert.equal(pageFromParam('3'), 3);
    for (const bad of [null, '0', '-2', '1.5', 'x', '99999']) {
      assert.equal(pageFromParam(bad), 1, String(bad));
    }
  });
});

describe('words', () => {
  it('reports whether looking a payment up found anything new', () => {
    assert.equal(checkOutcome('due', 'paid'), 'Razorpay says it is now paid.');
    assert.equal(checkOutcome('due', 'due'), 'Nothing new from Razorpay. It is still due.');
    assert.equal(checkOutcome(undefined, 'due'), 'Nothing new from Razorpay. It is still due.');
  });

  it('knows a payment is past due only while it is still unpaid', () => {
    assert.equal(isPastDue(payment({ dueDate: '2026-10-01' }), '2026-10-23'), true);
    assert.equal(isPastDue(payment({ dueDate: '2026-10-31' }), '2026-10-23'), false);
    assert.equal(isPastDue(payment({ dueDate: null }), '2026-10-23'), false);
    assert.equal(isPastDue({ ...PAID, dueDate: '2026-10-01' }, '2026-10-23'), false);
  });

  it('gives every status a sentence', () => {
    for (const status of PAYMENT_STATUSES) {
      assert.ok(statusHint(payment({ status, refundedPaise: 100_000 }), '2026-10-23').length > 5);
    }
    assert.match(
      statusHint(payment({ dueDate: '2026-10-01' }), '2026-10-23'),
      /^Not paid yet\. It was due on /,
    );
  });

  it('puts the figures into what a refund and a cancel are about to do', () => {
    assert.match(
      refundSentence({ number: 'MDG-2026-00012', dealerCode: '15E' }, 50_000),
      /^You are giving ₹500 back to outlet 15E for payment MDG-2026-00012\./,
    );
    assert.match(
      cancelSentence(payment()),
      /^This withdraws payment MDG-2026-00012: ₹4,999 asked from outlet 15E\./,
    );
  });

  it('prints where the link went, leaving out what it did not go to', () => {
    assert.equal(linkSentLine({ linkSentTo: null }), null);
    assert.equal(linkSentLine({ linkSentTo: { phone: null, email: null } }), null);
    assert.equal(
      linkSentLine({ linkSentTo: { phone: '919876543210', email: 'a@b.com' } }),
      '+91 98765 43210 and a@b.com',
    );
    assert.equal(
      linkSentLine({ linkSentTo: { phone: '9876543210', email: null } }),
      '+91 98765 43210',
    );
  });

  it('says whether the extra money was given back', () => {
    const extra = {
      razorpayPaymentId: 'pay_Xyz',
      amountPaise: 499_900,
      razorpayRefundId: 'rfnd_1',
      at: '2026-10-24T05:00:00.000Z',
    };
    assert.match(extraCaptureLine(extra), /₹4,999 was paid a second time/);
    assert.match(extraCaptureLine(extra), /given back automatically\.$/);
    assert.match(extraCaptureLine({ ...extra, razorpayRefundId: null }), /not confirmed/);
  });

  it('ends Razorpay’s reason with a full stop, once', () => {
    assert.equal(sentence('The phone number is not valid'), 'The phone number is not valid.');
    assert.equal(sentence(' Already done. '), 'Already done.');
    assert.equal(sentence('Really?'), 'Really?');
  });

  it('sorts a history newest first without touching the original', () => {
    const rows = [
      { at: '2026-10-01T00:00:00Z' },
      { at: '2026-10-03T00:00:00Z' },
      { at: '2026-10-02T00:00:00Z' },
    ];
    assert.deepEqual(
      newestFirst(rows, (r) => r.at).map((r) => r.at.slice(8, 10)),
      ['03', '02', '01'],
    );
    assert.equal(rows[0]?.at.slice(8, 10), '01');
  });
});

describe('validateRequest', () => {
  const good: RequestDraft = {
    dealerId: DEALER_ID,
    title: ' Dealer Kavach, October 2026 ',
    purpose: 'subscription',
    amount: '4,999',
    dueDate: '2026-10-31',
    note: '',
    sendLink: true,
    phone: '',
    email: '',
  };

  it('turns a good form into exactly what the server wants, in paise', () => {
    const { input, problems } = validateRequest(good);
    assert.deepEqual(problems, {});
    assert.deepEqual(input, {
      dealerId: DEALER_ID,
      title: 'Dealer Kavach, October 2026',
      purpose: 'subscription',
      amountPaise: 499_900,
      dueDate: '2026-10-31',
      sendLink: true,
    });
  });

  it('sends a phone and email override only when the link is going out', () => {
    const typed = { ...good, phone: '98765 43210', email: ' a@b.com ' };
    assert.deepEqual(validateRequest(typed).input?.contact, {
      phone: '9876543210',
      email: 'a@b.com',
    });
    // Switched off, the boxes are hidden: whatever is in them goes nowhere.
    const off = validateRequest({ ...typed, sendLink: false, phone: 'garbage' });
    assert.equal(off.input?.contact, undefined);
    assert.equal(off.input?.sendLink, false);
  });

  it('says which field is wrong, in words', () => {
    const { input, problems } = validateRequest({
      ...good,
      dealerId: '',
      title: 'ab',
      amount: '12.345',
      dueDate: '2026-02-31',
      phone: '12345',
      email: 'nope',
    });
    assert.equal(input, null);
    assert.deepEqual(Object.keys(problems).sort(), [
      'amount',
      'dealerId',
      'dueDate',
      'email',
      'phone',
      'title',
    ]);
  });

  it('agrees with the shared schema about the length of the title and the note', () => {
    for (const len of [
      PAYMENT_TITLE_MIN - 1,
      PAYMENT_TITLE_MIN,
      PAYMENT_TITLE_MAX,
      PAYMENT_TITLE_MAX + 1,
    ]) {
      const here = validateRequest({ ...good, title: 'a'.repeat(len) }).input !== null;
      const there = createPaymentSchema.safeParse({
        dealerId: DEALER_ID,
        title: 'a'.repeat(len),
        purpose: 'subscription',
        amountPaise: 499_900,
      }).success;
      assert.equal(here, there, `title of ${len}`);
    }
    for (const len of [PAYMENT_NOTE_MAX, PAYMENT_NOTE_MAX + 1]) {
      const here = validateRequest({ ...good, note: 'a'.repeat(len) }).input !== null;
      const there = createPaymentSchema.safeParse({
        dealerId: DEALER_ID,
        title: 'Dealer Kavach',
        purpose: 'subscription',
        amountPaise: 499_900,
        note: 'a'.repeat(len),
      }).success;
      assert.equal(here, there, `note of ${len}`);
    }
  });

  it('agrees with the shared schema about the smallest and largest amount', () => {
    for (const amount of ['0.99', '1', '5,00,000', '500000.01']) {
      const here = validateRequest({ ...good, amount }).input !== null;
      assert.equal(here, amountProblem(amount) === null, amount);
    }
  });

  it('tidies a phone number the way people write it', () => {
    assert.equal(tidyPhone('+91 98765-43210'), '+919876543210');
  });
});
