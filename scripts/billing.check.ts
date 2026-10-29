/**
 * Checks for the billing screens' decisions (`src/lib/billing.ts`): what a short
 * payment is, whether a typed amount may be recorded against a bill, the words
 * for "paid through", "next bill", "overdue" and a pause, and how the answer to
 * "Send bill" is laid out for a person. Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npm run check:billing
 *
 * Like the other check scripts it sits outside `src/` on purpose: the build
 * type-checks `src/`, and a test import there would break a standalone build.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SendSetupBillResult, SetupSubscriptionView } from '../shared/src/types/index';
import {
  billOutcome,
  manualDrawerLines,
  manualProblem,
  shortfallNote,
  shortfallPaise,
  subscriptionLines,
  waLinkWithText,
  ymdFromIso,
} from '../src/lib/billing';

const TODAY = '2026-10-23';
const ok = { amountText: '3540', paidOn: '2026-10-22', mode: 'bank', reference: 'UTR-1' };

describe('a short payment', () => {
  it('is the bill minus what came, never below zero', () => {
    assert.equal(shortfallPaise(354_000, 318_600), 35_400);
    assert.equal(shortfallPaise(354_000, 354_000), 0);
    assert.equal(shortfallPaise(354_000, 400_000), 0);
  });

  it('is said in words only while the amount is short of the bill', () => {
    assert.match(
      shortfallNote(354_000, '3186') ?? '',
      /^₹354 short\. It is recorded as paid for what came, with the shortfall shown; the GST invoice stays for the full ₹3,540\.$/,
    );
    assert.equal(shortfallNote(354_000, '3540'), null);
    assert.equal(shortfallNote(354_000, '4000'), null);
    assert.equal(shortfallNote(354_000, ''), null);
    assert.equal(shortfallNote(354_000, 'abc'), null);
    assert.equal(shortfallNote(null, '3186'), null);
  });
});

describe('what may be recorded against a bill', () => {
  it('accepts the whole bill, or less', () => {
    assert.equal(manualProblem(ok, 354_000, TODAY), null);
    assert.equal(manualProblem({ ...ok, amountText: '3186' }, 354_000, TODAY), null);
    assert.equal(manualProblem({ ...ok, paidOn: TODAY }, 354_000, TODAY), null);
    assert.equal(manualProblem({ ...ok, reference: '' }, 354_000, TODAY), null);
  });

  it('refuses more than the bill, in words that say what to do', () => {
    const p = manualProblem({ ...ok, amountText: '3541' }, 354_000, TODAY);
    assert.match(p ?? '', /^The bill is ₹3,540\. Record at most that/);
  });

  it('refuses what is not an amount, a day in the future, a day that does not exist, a mode we do not know', () => {
    assert.ok(manualProblem({ ...ok, amountText: '' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, amountText: '35.405' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, amountText: '0' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, paidOn: '2026-10-24' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, paidOn: '2026-02-30' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, paidOn: '' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, mode: 'barter' }, 354_000, TODAY));
    assert.ok(manualProblem({ ...ok, reference: 'x'.repeat(121) }, 354_000, TODAY));
  });

  it('does not judge the amount against a bill it does not know', () => {
    assert.equal(manualProblem({ ...ok, amountText: '99999' }, null, TODAY), null);
  });
});

describe('the drawer lines for a payment recorded by hand', () => {
  const manual = {
    mode: 'bank' as const,
    reference: 'UTR-1',
    paidOn: '2026-10-22',
    recordedByName: 'Asha',
    amountPaise: 354_000,
    shortfallPaise: 0,
  };
  it('names what came, how, on which day, and who recorded it', () => {
    const lines = manualDrawerLines(manual, 'Bank transfer');
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.value, '₹3,540 by Bank transfer · ref UTR-1 · on 22 Oct 2026 · by Asha');
  });
  it('adds the shortfall only when there is one, and leaves out a reference there is not', () => {
    const lines = manualDrawerLines(
      { ...manual, amountPaise: 318_600, shortfallPaise: 35_400, reference: null },
      'UPI',
    );
    assert.equal(lines.length, 2);
    assert.equal(lines[0]!.value, '₹3,186 by UPI · on 22 Oct 2026 · by Asha');
    assert.equal(lines[1]!.label, 'Short by');
    assert.match(lines[1]!.value, /^₹354 /);
  });
});

describe('the subscription lines', () => {
  const base: SetupSubscriptionView = {
    paidThrough: '2026-11-27',
    nextBillOn: '2026-11-22',
    overdue: false,
    billingHold: null,
  };
  const labels = (s: SetupSubscriptionView, today = TODAY) =>
    subscriptionLines(s, today).map((l) => l.label);

  it('says nothing before the first month is paid', () => {
    assert.deepEqual(
      subscriptionLines(
        { paidThrough: null, nextBillOn: null, overdue: false, billingHold: null },
        TODAY,
      ),
      [],
    );
  });

  it('says how far it is paid and when the next bill is raised', () => {
    assert.deepEqual(
      subscriptionLines(base, TODAY).map((l) => [l.label, l.value, l.tone]),
      [
        ['Paid through', '27 Nov 2026', 'normal'],
        ['Next bill', 'Raised on 22 Nov 2026', 'normal'],
      ],
    );
  });

  it('says when the bill is due to be raised by the next pass, and when the paid day has gone', () => {
    const lines = subscriptionLines(base, '2026-11-23');
    assert.equal(lines.find((l) => l.key === 'nextBill')!.value, 'Raised by the next morning pass');
    const late = subscriptionLines(base, '2026-11-28');
    assert.equal(late.find((l) => l.key === 'paidThrough')!.tone, 'warning');
    assert.match(late.find((l) => l.key === 'paidThrough')!.value, /that day has passed/);
  });

  it('shouts about an overdue bill', () => {
    const l = subscriptionLines({ ...base, overdue: true }, TODAY).find(
      (x) => x.key === 'overdue',
    )!;
    assert.equal(l.tone, 'danger');
    assert.match(l.value, /past its due day/);
  });

  it('says who paused it and why, and stops promising a next bill', () => {
    const paused: SetupSubscriptionView = {
      ...base,
      nextBillOn: null,
      billingHold: { at: '2026-10-22T20:00:00.000Z', byName: 'Asha', reason: 'not paying' },
    };
    assert.deepEqual(labels(paused), ['Paid through', 'Paused for non-payment']);
    const hold = subscriptionLines(paused, TODAY).find((x) => x.key === 'hold')!;
    // 20:00 UTC on the 22nd is 01:30 on the 23rd in India
    assert.equal(
      hold.value,
      'since 23 Oct 2026 · by Asha · not paying · Paid up since — the services can be resumed.',
    );
    assert.equal(hold.tone, 'warning');
    // not paid up: no hint to resume
    const unpaid = subscriptionLines({ ...paused, paidThrough: '2026-10-01' }, TODAY).find(
      (x) => x.key === 'hold',
    )!;
    assert.ok(!unpaid.value.includes('resumed'));
  });
});

describe('the days as India reads them', () => {
  it('moves a late-evening UTC time to the next India day', () => {
    assert.equal(ymdFromIso('2026-10-22T20:00:00.000Z'), '23 Oct 2026');
    assert.equal(ymdFromIso('2026-10-23T05:00:00.000Z'), '23 Oct 2026');
    assert.equal(ymdFromIso('nonsense'), '');
  });
});

const sent = (over: Partial<SendSetupBillResult> = {}): SendSetupBillResult => ({
  setup: {} as SendSetupBillResult['setup'],
  whatsapp: {
    sent: false,
    reason: 'The WhatsApp bill template is not approved yet',
    text: 'नमस्ते',
    waLink: 'https://wa.me/919870000001?text=%E0%A4%A8',
  },
  link: { url: 'https://rzp.io/i/abc', sentTo: { phone: '+919870000001', email: null } },
  linkError: null,
  payment: { id: '65f0c0ffee0123456789abce', number: 'MDG-2026-00012' },
  created: true,
  ...over,
});

describe('the answer to "Send bill"', () => {
  it('says what was raised, where Razorpay sent the link, and hands over the WhatsApp words', () => {
    const o = billOutcome(sent());
    assert.equal(o.headline, 'MDG-2026-00012 raised.');
    assert.deepEqual(o.sms, {
      state: 'sent',
      text: 'Razorpay sent the payment link to +919870000001.',
    });
    assert.equal(o.link, 'https://rzp.io/i/abc');
    assert.equal(o.whatsapp.state, 'by_hand');
    if (o.whatsapp.state === 'by_hand') {
      assert.equal(o.whatsapp.text, 'The WhatsApp bill template is not approved yet');
      assert.equal(o.whatsapp.message, 'नमस्ते');
    }
  });

  it('says a bill that was already out was not raised again', () => {
    assert.equal(
      billOutcome(sent({ created: false })).headline,
      'MDG-2026-00012 is already out; nothing new was raised.',
    );
  });

  it('says a WhatsApp that went by template went', () => {
    assert.deepEqual(billOutcome(sent({ whatsapp: { sent: true } })).whatsapp, {
      state: 'sent',
      text: 'The bill went to the owner on WhatsApp.',
    });
  });

  it('says why there is no link: Razorpay off, or Razorpay refusing', () => {
    assert.equal(billOutcome(sent({ link: null })).sms.state, 'off');
    assert.equal(billOutcome(sent({ link: null })).link, null);
    const refused = billOutcome(sent({ link: null, linkError: 'The link was refused.' }));
    assert.deepEqual(refused.sms, { state: 'not_sent', text: 'No link: The link was refused.' });
  });

  it('says a link that reached nobody was not sent, with the reason when there is one', () => {
    const nobody = billOutcome(
      sent({ link: { url: 'https://rzp.io/i/abc', sentTo: { phone: null, email: null } } }),
    );
    assert.equal(nobody.sms.state, 'not_sent');
    assert.equal(nobody.link, 'https://rzp.io/i/abc');
    const why = billOutcome(
      sent({
        link: { url: 'https://rzp.io/i/abc', sentTo: { phone: null, email: null } },
        linkError: 'No phone number on file.',
      }),
    );
    assert.equal(why.sms.text, 'No phone number on file.');
  });
});

describe('the WhatsApp link with the words as they stand', () => {
  it('replaces the text and keeps the number', () => {
    assert.equal(
      waLinkWithText('https://wa.me/919870000001?text=old', 'नमस्ते & UPI: a@b'),
      `https://wa.me/919870000001?text=${encodeURIComponent('नमस्ते & UPI: a@b')}`,
    );
  });
  it("leaves a link that is not in the server's shape as it came", () => {
    assert.equal(waLinkWithText('https://example.test/x', 'hi'), 'https://example.test/x');
  });
});
