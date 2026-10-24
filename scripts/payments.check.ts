/**
 * Checks for the decisions behind the Payments page (`src/pages/payments/
 * format.ts`): which buttons a payment allows, how much can be refunded, what a
 * typed amount means, whether the "Request a payment" form agrees with the
 * shared schema it is sent through, and the GST invoice pieces — who to bill,
 * the tax split shown for an amount, and what the drawer says about an invoice
 * that has not been issued.
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
  INVOICE_BLOCKERS,
  PAYMENT_MAX_PAISE,
  PAYMENT_MIN_PAISE,
  PAYMENT_STATUSES,
  type AdminPayment,
  type GstDocumentSummary,
  type PaymentStatus,
} from '../shared/src/types/payment';
import { gstinCheckChar, splitGstInclusive } from '../shared/src/lib/gst';
import { formatPaise, parseRupeesToPaise } from '../shared/src/lib/money';
import {
  billToSchema,
  cancelPaymentSchema,
  createPaymentSchema,
  refundPaymentSchema,
} from '../shared/src/schemas/payment';
import {
  BILL_TO_ADDRESS_MAX,
  BILL_TO_ADDRESS_MIN,
  BILL_TO_NAME_MAX,
  BILL_TO_NAME_MIN,
  type BillToDraft,
  EMPTY_BILL_TO,
  PAYMENT_NOTE_MAX,
  PAYMENT_REASON_MAX,
  PAYMENT_REASON_MIN,
  PAYMENT_TITLE_MAX,
  PAYMENT_TITLE_MIN,
  type RequestDraft,
  allowedActions,
  amountProblem,
  billToDraftFrom,
  billToFacts,
  billToForOutlet,
  billToHint,
  billToState,
  canEditBillTo,
  canIssueInvoice,
  cancelSentence,
  checkBillTo,
  checkOutcome,
  creditNoteLine,
  dashboardUrl,
  extraCaptureLine,
  hasOpenProblem,
  idFromParam,
  invoiceBlockerSentence,
  invoiceSentence,
  invoiceState,
  isBlankBillTo,
  isPastDue,
  issuedMessage,
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
  splitText,
  stateForGstin,
  stateLabel,
  statusFromParam,
  statusHint,
  statusTone,
  taxSplitHint,
  tidyPhone,
  validateRequest,
  wasPaid,
  withGstin,
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
    invoice: null,
    creditNotes: [],
    billTo: null,
    invoiceBlocker: null,
    manual: null,
    subscriptionPeriod: null,
    ...over,
  };
}

/** A real GSTIN for a state: the shared check character is worked out, not copied from anywhere. */
function gstin(state: string): string {
  const first14 = `${state}ABCDE1234F1Z`;
  return `${first14}${gstinCheckChar(first14)}`;
}
const GSTIN_HARYANA = gstin('06');
const GSTIN_MAHARASHTRA = gstin('27');

const BILL_TO_SAVED = {
  name: 'Shree Ram Fuels',
  gstin: GSTIN_HARYANA as string | null,
  address: 'NH 48, Sector 14, Gurugram, Haryana 122001',
  stateCode: '06',
};

const BILL_TO: BillToDraft = {
  name: 'Shree Ram Fuels',
  gstin: GSTIN_HARYANA,
  address: 'NH 48, Sector 14, Gurugram, Haryana 122001',
  stateCode: '06',
};

/** A stored invoice or credit note, with whatever a test needs changed. */
function document(over: Partial<GstDocumentSummary> = {}): GstDocumentSummary {
  return {
    id: '65f0c0ffee0123456789abcf',
    kind: 'invoice',
    number: 'MDG/26-27/00001',
    issuedAt: '2026-10-24T05:00:00.000Z',
    taxablePaise: 300_000,
    cgstPaise: 27_000,
    sgstPaise: 27_000,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 354_000,
    againstNumber: null,
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
      recordPayment: true,
    });
  });

  it('lets any admin record money that came outside Razorpay, and only while it is due', () => {
    assert.equal(allowedActions(payment(), true).recordPayment, true);
    assert.equal(allowedActions(payment(), false).recordPayment, true);
    assert.equal(allowedActions(payment({ status: 'processing' }), true).recordPayment, false);
    assert.equal(allowedActions(PAID, true).recordPayment, false);
    assert.equal(
      allowedActions(payment({ status: 'cancelled', cancelledAt: '2026-10-24T05:00:00.000Z' }), true)
        .recordPayment,
      false,
    );
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
    billTo: EMPTY_BILL_TO,
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

describe('the state follows the GSTIN', () => {
  it('reads the state from the first two digits, and from nothing else', () => {
    assert.equal(stateForGstin(GSTIN_HARYANA), '06');
    assert.equal(stateForGstin(` ${GSTIN_MAHARASHTRA.toLowerCase()} `), '27');
    assert.equal(stateForGstin('06'), '06');
    for (const none of ['', '0', '99', 'AB1234', 'toString']) {
      assert.equal(stateForGstin(none), null, none);
    }
  });

  it('tidies what is typed, caps it at fifteen, and moves the state with it', () => {
    const typed = withGstin(EMPTY_BILL_TO, ` ${GSTIN_MAHARASHTRA.toLowerCase()}999 `);
    assert.equal(typed.gstin, GSTIN_MAHARASHTRA);
    assert.equal(typed.stateCode, '27');
  });

  it('leaves the state alone while the first two digits are not yet a state, and when the box is cleared', () => {
    const picked = { ...EMPTY_BILL_TO, stateCode: '07' };
    assert.equal(withGstin(picked, '9').stateCode, '07');
    assert.equal(withGstin(withGstin(picked, GSTIN_HARYANA), '').stateCode, '06');
  });

  it('lets the GSTIN’s state win over a state picked earlier', () => {
    assert.equal(billToState({ gstin: GSTIN_HARYANA, stateCode: '27' }), '06');
    assert.equal(billToState({ gstin: '', stateCode: '27' }), '27');
  });

  it('names a state with its code, and a code it does not know as it is', () => {
    assert.equal(stateLabel('06'), 'Haryana (06)');
    assert.equal(stateLabel('99'), '99');
    assert.equal(stateLabel(''), '—');
  });
});

describe('billToForOutlet', () => {
  it('puts the outlet’s own GSTIN in the box, and the state with it', () => {
    const d = billToForOutlet(EMPTY_BILL_TO, ` ${GSTIN_MAHARASHTRA.toLowerCase()} `, false);
    assert.equal(d.gstin, GSTIN_MAHARASHTRA);
    assert.equal(d.stateCode, '27');
  });

  it('leaves the GSTIN empty for an outlet that has none', () => {
    assert.deepEqual(billToForOutlet(EMPTY_BILL_TO, undefined, false), EMPTY_BILL_TO);
    assert.deepEqual(billToForOutlet(EMPTY_BILL_TO, null, false), EMPTY_BILL_TO);
  });

  it('keeps what was already typed on the first fill', () => {
    const typed = { ...EMPTY_BILL_TO, name: 'Shree Ram Fuels', gstin: GSTIN_HARYANA };
    const d = billToForOutlet(typed, GSTIN_MAHARASHTRA, false);
    assert.equal(d.name, 'Shree Ram Fuels');
    assert.equal(d.gstin, GSTIN_HARYANA);
  });

  it('starts again on a different outlet, so one outlet’s name never sits on another’s invoice', () => {
    const d = billToForOutlet(BILL_TO, GSTIN_MAHARASHTRA, true);
    assert.equal(d.name, '');
    assert.equal(d.address, '');
    assert.equal(d.gstin, GSTIN_MAHARASHTRA);
    assert.equal(d.stateCode, '27');
    // …and an outlet with no GSTIN does not inherit the last one's.
    assert.deepEqual(billToForOutlet(BILL_TO, undefined, true), EMPTY_BILL_TO);
  });

  it('reads a saved bill-to back as a draft, an unregistered buyer as an empty GSTIN', () => {
    assert.deepEqual(
      billToDraftFrom({ name: 'A B', gstin: null, address: 'Somewhere, 12345', stateCode: '06' }),
      { name: 'A B', gstin: '', address: 'Somewhere, 12345', stateCode: '06' },
    );
    assert.deepEqual(billToDraftFrom(null), EMPTY_BILL_TO);
  });
});

describe('checkBillTo', () => {
  it('says nothing was given when there is no name and no address — the outlet’s own GSTIN is not an answer', () => {
    assert.equal(isBlankBillTo(EMPTY_BILL_TO), true);
    assert.equal(isBlankBillTo({ ...EMPTY_BILL_TO, gstin: GSTIN_HARYANA, stateCode: '06' }), true);
    assert.deepEqual(checkBillTo({ ...EMPTY_BILL_TO, gstin: 'junk' }, false), { kind: 'blank' });
    assert.equal(isBlankBillTo({ ...EMPTY_BILL_TO, name: 'A' }), false);
  });

  it('turns a full form into exactly what the server wants', () => {
    assert.deepEqual(checkBillTo({ ...BILL_TO, name: '  Shree Ram Fuels ' }, false), {
      kind: 'ok',
      billTo: {
        name: 'Shree Ram Fuels',
        gstin: GSTIN_HARYANA,
        address: 'NH 48, Sector 14, Gurugram, Haryana 122001',
        stateCode: '06',
      },
    });
  });

  it('sends no GSTIN for a buyer who is not registered, and takes the state that was picked', () => {
    const r = checkBillTo({ ...BILL_TO, gstin: '', stateCode: '27' }, false);
    assert.equal(r.kind, 'ok');
    assert.deepEqual(r.kind === 'ok' ? [r.billTo.gstin, r.billTo.stateCode] : null, [null, '27']);
  });

  it('takes the GSTIN’s state when the picked one disagrees, instead of failing on it', () => {
    const r = checkBillTo({ ...BILL_TO, stateCode: '27' }, false);
    assert.equal(r.kind === 'ok' ? r.billTo.stateCode : null, '06');
  });

  it('asks for the missing half, in words, once either half is given', () => {
    const noAddress = checkBillTo({ ...BILL_TO, address: '' }, false);
    assert.equal(noAddress.kind, 'bad');
    assert.deepEqual(Object.keys(noAddress.kind === 'bad' ? noAddress.problems : {}), ['address']);
    const noName = checkBillTo({ ...BILL_TO, name: ' ' }, false);
    assert.deepEqual(Object.keys(noName.kind === 'bad' ? noName.problems : {}), ['name']);
  });

  it('does not accept an empty form when the bill-to is the whole point', () => {
    const r = checkBillTo(EMPTY_BILL_TO, true);
    assert.equal(r.kind, 'bad');
    assert.deepEqual(Object.keys(r.kind === 'bad' ? r.problems : {}).sort(), [
      'address',
      'name',
      'stateCode',
    ]);
  });

  it('refuses a GSTIN with one wrong character, and a state nobody can pick', () => {
    const wrongCheck = GSTIN_HARYANA.slice(0, 14) + (GSTIN_HARYANA.endsWith('A') ? 'B' : 'A');
    const r = checkBillTo({ ...BILL_TO, gstin: wrongCheck }, false);
    assert.equal(
      r.kind === 'bad' ? r.problems.gstin : null,
      'That is not a valid GSTIN. Check it letter by letter against the outlet’s GST certificate.',
    );
    const noState = checkBillTo({ ...BILL_TO, gstin: '', stateCode: '' }, false);
    assert.equal(
      noState.kind === 'bad' ? noState.problems.stateCode : null,
      'Pick the state the outlet is in.',
    );
    assert.equal(checkBillTo({ ...BILL_TO, gstin: '', stateCode: '99' }, false).kind, 'bad');
    assert.equal(checkBillTo({ ...BILL_TO, gstin: '', stateCode: 'toString' }, false).kind, 'bad');
  });

  it('agrees with the shared schema about how long the name and the address may be', () => {
    const lengths = (min: number, max: number) => [min - 1, min, max, max + 1];
    for (const len of lengths(BILL_TO_NAME_MIN, BILL_TO_NAME_MAX)) {
      const draft = { ...BILL_TO, name: 'n'.repeat(len) };
      const here = checkBillTo(draft, false).kind === 'ok';
      const there = billToSchema.safeParse(draft).success;
      assert.equal(here, there, `name of ${len}`);
    }
    for (const len of lengths(BILL_TO_ADDRESS_MIN, BILL_TO_ADDRESS_MAX)) {
      const draft = { ...BILL_TO, address: 'a'.repeat(len) };
      const here = checkBillTo(draft, false).kind === 'ok';
      const there = billToSchema.safeParse(draft).success;
      assert.equal(here, there, `address of ${len}`);
    }
  });
});

describe('the tax split shown for an amount', () => {
  it('writes ₹3,540 as ₹3,000 plus CGST and SGST in Haryana', () => {
    assert.equal(
      splitText(splitGstInclusive(354_000, '06')),
      '₹3,540 = ₹3,000 + CGST ₹270 + SGST ₹270',
    );
  });

  it('writes the same amount as one IGST line anywhere else', () => {
    assert.equal(splitText(splitGstInclusive(354_000, '27')), '₹3,540 = ₹3,000 + IGST ₹540');
  });

  it('shows the paise when there are some, as the list does', () => {
    assert.equal(
      splitText(splitGstInclusive(499_900, '06')),
      '₹4,999 = ₹4,236.44 + CGST ₹381.28 + SGST ₹381.28',
    );
  });

  it('shows the round off a paisa of rounding leaves, with its sign', () => {
    // ₹1: ₹0.85 + two lots of ₹0.08 is ₹1.01, so one paisa has to come off.
    assert.equal(
      splitText(splitGstInclusive(100, '06')),
      '₹1 = ₹0.85 + CGST ₹0.08 + SGST ₹0.08 − round off ₹0.01',
    );
    // And ₹1.09: ₹0.92 + two lots of ₹0.08 is ₹1.08, so a paisa has to be added.
    assert.equal(
      splitText(splitGstInclusive(109, '06')),
      '₹1.09 = ₹0.92 + CGST ₹0.08 + SGST ₹0.08 + round off ₹0.01',
    );
  });

  it('adds up to the total it started from, for any amount, and the line opens with that total', () => {
    for (const total of [100, 101, 105, 118, 999, 12_345, 354_000, 499_900, 50_000_000]) {
      for (const state of ['06', '27']) {
        const s = splitGstInclusive(total, state);
        assert.equal(
          s.taxablePaise + s.cgstPaise + s.sgstPaise + s.igstPaise + s.roundOffPaise,
          total,
        );
        assert.ok(splitText(s).startsWith(`${formatPaise(total)} = `), `${total} in ${state}`);
      }
    }
  });

  it('reads a stored invoice as it was issued, without working it out again', () => {
    // Figures a different rounding would not give: the document is the record.
    assert.equal(
      splitText(
        document({ taxablePaise: 300_001, cgstPaise: 26_999, sgstPaise: 27_000, roundOffPaise: 0 }),
      ),
      '₹3,540 = ₹3,000.01 + CGST ₹269.99 + SGST ₹270',
    );
    assert.equal(
      splitText(document({ cgstPaise: 0, sgstPaise: 0, igstPaise: 54_000 })),
      '₹3,540 = ₹3,000 + IGST ₹540',
    );
  });

  it('says what is missing when the state is not known, instead of guessing', () => {
    assert.equal(
      taxSplitHint(354_000, ''),
      'Includes 18% GST. Pick the state under Bill to to see how it splits.',
    );
    assert.equal(
      taxSplitHint(354_000, '06'),
      'Includes 18% GST: ₹3,540 = ₹3,000 + CGST ₹270 + SGST ₹270.',
    );
    assert.equal(taxSplitHint(354_000, '27'), 'Includes 18% GST: ₹3,540 = ₹3,000 + IGST ₹540.');
  });
});

describe('the invoice section', () => {
  const paid = payment({ status: 'paid', paidAt: '2026-10-24T05:00:00.000Z' });

  it('knows a payment was paid even after some or all of it was given back', () => {
    for (const status of PAYMENT_STATUSES) {
      assert.equal(
        wasPaid(status),
        status === 'paid' || status === 'partially_refunded' || status === 'refunded',
        status,
      );
    }
  });

  it('tells issued, blocked, waiting and nothing-to-do apart', () => {
    assert.equal(invoiceState({ ...paid, invoice: document() }), 'issued');
    assert.equal(invoiceState({ ...paid, invoiceBlocker: 'no_bill_to' }), 'blocked');
    assert.equal(invoiceState(paid), 'pending');
    assert.equal(invoiceState(payment()), 'none');
    assert.equal(invoiceState(payment({ status: 'cancelled' })), 'none');
    // Given back in full but never invoiced: it still waits for one, and a credit note needs it.
    assert.equal(invoiceState({ ...paid, status: 'refunded' }), 'pending');
  });

  it('says why in a sentence for every reason the shared contract knows', () => {
    for (const blocker of INVOICE_BLOCKERS) {
      assert.match(invoiceBlockerSentence(blocker), /\.$/, blocker);
    }
    assert.equal(invoiceBlockerSentence('no_bill_to'), 'Add who to bill, then issue the invoice.');
    assert.match(
      invoiceBlockerSentence('gst_not_configured'),
      /^The company’s GST details are not set on the server yet\./,
    );
  });

  it('opens with that sentence while the invoice is blocked, and with nothing once it is issued or not yet due', () => {
    assert.equal(
      invoiceSentence({ ...paid, invoiceBlocker: 'no_bill_to' }),
      'Add who to bill, then issue the invoice.',
    );
    assert.match(invoiceSentence(paid) ?? '', /^The invoice has not been issued yet\./);
    assert.equal(invoiceSentence({ ...paid, invoice: document() }), null);
    assert.equal(invoiceSentence(payment()), null);
  });

  it('offers Issue invoice only where pressing it can work', () => {
    // The company's details are missing: an admin cannot fix that, but can try again once it is.
    assert.equal(canIssueInvoice({ ...paid, invoiceBlocker: 'gst_not_configured' }), true);
    // Nobody to bill, and nobody added: the server would refuse, so the button waits for the card.
    assert.equal(canIssueInvoice({ ...paid, invoiceBlocker: 'no_bill_to' }), false);
    assert.equal(
      canIssueInvoice({ ...paid, invoiceBlocker: 'no_bill_to', billTo: BILL_TO_SAVED }),
      true,
    );
    assert.equal(canIssueInvoice(paid), true);
    assert.equal(canIssueInvoice({ ...paid, invoice: document() }), false);
    assert.equal(canIssueInvoice(payment()), false);
  });

  it('lets who to bill change until the invoice is issued, and not after', () => {
    assert.equal(canEditBillTo(payment()), true);
    assert.equal(canEditBillTo(paid), true);
    // Corrected while it waits for the invoice, with a bill-to already saved.
    assert.equal(canEditBillTo(payment({ ...paid, billTo: BILL_TO_SAVED })), true);
    assert.equal(canEditBillTo({ ...paid, invoice: document() }), false);
    // A withdrawn payment is never invoiced.
    assert.equal(canEditBillTo(payment({ status: 'cancelled' })), false);
  });

  it('says what the Bill to card is for, and whether it can still change', () => {
    assert.match(billToHint(payment()), /made as soon as the payment is paid\.$/);
    assert.match(billToHint(paid), /correct it until the invoice is issued\.$/);
    assert.match(billToHint({ ...paid, invoice: document() }), /can no longer be changed\.$/);
  });

  it('prints the saved bill-to in four lines, an unregistered buyer as such', () => {
    assert.deepEqual(billToFacts(BILL_TO_SAVED), {
      name: 'Shree Ram Fuels',
      gstin: GSTIN_HARYANA,
      address: 'NH 48, Sector 14, Gurugram, Haryana 122001',
      state: 'Haryana (06)',
    });
    assert.equal(billToFacts({ ...BILL_TO_SAVED, gstin: null }).gstin, 'Not registered for GST');
  });

  it('names the invoice in the toast when the server sent the payment back with it', () => {
    assert.equal(issuedMessage({ invoice: document() }), 'Invoice MDG/26-27/00001 issued.');
    assert.equal(issuedMessage({ invoice: null }), 'Asked the server to issue the invoice.');
    assert.equal(issuedMessage(undefined), 'Asked the server to issue the invoice.');
  });

  it('puts the amount and the invoice a credit note reduces on one line', () => {
    assert.equal(
      creditNoteLine(
        document({
          kind: 'credit_note',
          number: 'MDGCN/26-27/0001',
          totalPaise: 50_000,
          againstNumber: 'MDG/26-27/00001',
        }),
      ),
      '₹500 · against MDG/26-27/00001',
    );
    assert.equal(
      creditNoteLine(document({ kind: 'credit_note', totalPaise: 50_000, againstNumber: null })),
      '₹500 · against the invoice',
    );
  });
});

describe('validateRequest with who to bill', () => {
  const good: RequestDraft = {
    dealerId: DEALER_ID,
    title: 'Dealer Kavach, October 2026',
    purpose: 'subscription',
    amount: '3,540',
    dueDate: '',
    note: '',
    sendLink: true,
    phone: '',
    email: '',
    billTo: BILL_TO,
  };

  it('sends who to bill with the payment, the GSTIN tidied and the state from it', () => {
    const { input, problems } = validateRequest({
      ...good,
      billTo: { ...BILL_TO, gstin: ` ${GSTIN_HARYANA.toLowerCase()} `, stateCode: '' },
    });
    assert.deepEqual(problems, {});
    assert.deepEqual(input?.billTo, {
      name: 'Shree Ram Fuels',
      gstin: GSTIN_HARYANA,
      address: 'NH 48, Sector 14, Gurugram, Haryana 122001',
      stateCode: '06',
    });
    assert.equal(input?.amountPaise, 354_000);
  });

  it('raises the payment anyway when nobody is named to bill — the invoice waits', () => {
    const { input, problems } = validateRequest({
      ...good,
      // The outlet's own GSTIN is in the box, but no name and no address.
      billTo: { ...EMPTY_BILL_TO, gstin: GSTIN_HARYANA, stateCode: '06' },
    });
    assert.deepEqual(problems, {});
    assert.equal(input !== null, true);
    assert.equal('billTo' in (input ?? {}), false);
  });

  it('says which box is wrong, under its own name, and stops the request', () => {
    const { input, problems } = validateRequest({
      ...good,
      billTo: { ...BILL_TO, gstin: 'NOTAGSTIN' },
    });
    assert.equal(input, null);
    assert.deepEqual(Object.keys(problems).sort(), ['billToGstin']);
    const half = validateRequest({ ...good, billTo: { ...BILL_TO, address: '' } });
    assert.equal(half.input, null);
    assert.deepEqual(Object.keys(half.problems), ['billToAddress']);
  });

  it('is not held up by a bill-to problem that is hidden because nothing was entered', () => {
    // A junk GSTIN alone (say, an outlet record with "NA" in it) must not stop a payment.
    const { input } = validateRequest({ ...good, billTo: { ...EMPTY_BILL_TO, gstin: 'NA' } });
    assert.equal(input !== null, true);
  });
});
